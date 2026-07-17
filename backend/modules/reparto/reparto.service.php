<?php
// backend/modules/reparto/reparto.service.php
declare(strict_types=1);

/**
 * Motor central de distribución de ingresos.
 *
 * Diseño simplificado:
 * - Los pagos se guardan únicamente en `pagos`.
 * - El reparto se calcula en el momento de consultar reportes o resúmenes.
 * - No depende de snapshots ni de la tabla `pagos_reparto`.
 * - En repartos entre entidades, los montos se asignan jerárquicamente para
 *   respetar cada nivel exacto (por ejemplo: BALTO 50/50 y luego 3DEVS 33/33/33).
 */

function reparto_redondear(float $value, int $scale = 4): float
{
    return round($value, $scale);
}

/** @return float[] */
function reparto_porcentajes_iguales(int $cantidad, int $scale = 4): array
{
    if ($cantidad <= 0) return [];

    $factor = 10 ** $scale;
    $totalUnits = 100 * $factor;
    $base = intdiv($totalUnits, $cantidad);
    $remainder = $totalUnits - ($base * $cantidad);

    $out = [];
    for ($i = 0; $i < $cantidad; $i++) {
        $units = $base + ($i < $remainder ? 1 : 0);
        $out[] = $units / $factor;
    }
    return $out;
}

/**
 * Distribuye un monto en centavos sin perder ni crear dinero por redondeo.
 * Si los porcentajes suman 100%, el resultado suma exactamente el monto base.
 */
function reparto_aplicar_montos_exactos(array $items, float $monto): array
{
    if (!$items) return [];

    $totalCentavos = (int)round(max(0.0, $monto) * 100);
    $porcentajeTotal = array_sum(array_map(
        static fn(array $item): float => max(0.0, (float)($item['porcentaje'] ?? 0)),
        $items
    ));
    if ($porcentajeTotal <= 0.0) {
        foreach ($items as &$item) $item['monto_estimado'] = 0.0;
        unset($item);
        return $items;
    }

    $objetivoCentavos = (int)round(
        $totalCentavos * min(100.0, max(0.0, $porcentajeTotal)) / 100.0
    );
    $calculados = [];
    $sumaPisos = 0;

    foreach ($items as $index => $item) {
        $pct = max(0.0, (float)($item['porcentaje'] ?? 0));
        $raw = ($totalCentavos * $pct) / 100.0;
        $floor = (int)floor($raw + 1e-9);
        $calculados[] = [
            'index' => $index,
            'centavos' => $floor,
            'fraccion' => $raw - $floor,
        ];
        $sumaPisos += $floor;
    }

    $resto = $objetivoCentavos - $sumaPisos;
    usort($calculados, static function (array $a, array $b): int {
        $cmp = $b['fraccion'] <=> $a['fraccion'];
        return $cmp !== 0 ? $cmp : ($a['index'] <=> $b['index']);
    });

    $cantidad = count($calculados);
    if ($cantidad > 0 && $resto > 0) {
        for ($i = 0; $i < $resto; $i++) {
            $calculados[$i % $cantidad]['centavos']++;
        }
    } elseif ($cantidad > 0 && $resto < 0) {
        usort($calculados, static function (array $a, array $b): int {
            $cmp = $a['fraccion'] <=> $b['fraccion'];
            return $cmp !== 0 ? $cmp : ($b['index'] <=> $a['index']);
        });
        for ($i = 0; $i < abs($resto); $i++) {
            $slot = $i % $cantidad;
            if ($calculados[$slot]['centavos'] > 0) {
                $calculados[$slot]['centavos']--;
            }
        }
    }

    foreach ($calculados as $calc) {
        $items[$calc['index']]['monto_estimado'] = $calc['centavos'] / 100;
    }

    return $items;
}

/** Fuerza porcentajes positivos a sumar exactamente 100,0000%. */
function reparto_normalizar_porcentajes(array $items, int $scale = 4): array
{
    if (!$items) return [];

    $factor = 10 ** $scale;
    $totalUnits = 100 * $factor;
    $weights = array_map(
        static fn(array $item): float => max(0.0, (float)($item['porcentaje'] ?? 0)),
        $items
    );
    $totalWeight = array_sum($weights);
    if ($totalWeight <= 0.0) return $items;

    $rows = [];
    $sumFloor = 0;
    foreach ($weights as $index => $weight) {
        $raw = ($totalUnits * $weight) / $totalWeight;
        $floor = (int)floor($raw + 1e-9);
        $rows[] = [
            'index' => $index,
            'units' => $floor,
            'fraction' => $raw - $floor,
        ];
        $sumFloor += $floor;
    }

    $remaining = $totalUnits - $sumFloor;
    usort($rows, static function (array $a, array $b): int {
        $cmp = $b['fraction'] <=> $a['fraction'];
        return $cmp !== 0 ? $cmp : ($a['index'] <=> $b['index']);
    });
    $count = count($rows);
    for ($i = 0; $count > 0 && $i < $remaining; $i++) {
        $rows[$i % $count]['units']++;
    }

    foreach ($rows as $row) {
        $items[$row['index']]['porcentaje'] = $row['units'] / $factor;
    }
    return $items;
}

function reparto_regla_valida(array $items): bool
{
    if (!$items) return false;

    $totalUnits = 0;
    foreach ($items as $item) {
        $pct = (float)($item['porcentaje'] ?? 0);
        if ($pct <= 0.0 || $pct > 100.0) return false;
        $totalUnits += (int)round($pct * 10000);
    }

    // Acepta como máximo una unidad de 0,0001% por diferencias de representación.
    return abs($totalUnits - 1000000) <= 1;
}

function reparto_organizacion_config(PDO $pdo, int $idOrganizacion): array
{
    $st = $pdo->prepare("\n        SELECT id_organizacion, codigo, nombre,\n               COALESCE(modelo_reparto, 'por_sistema') AS modelo_reparto\n        FROM organizaciones\n        WHERE id_organizacion = :id\n          AND activo = 1\n        LIMIT 1\n    ");
    $st->execute([':id' => $idOrganizacion]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new RuntimeException('La organización no existe o está inactiva.');

    $modelo = (string)($row['modelo_reparto'] ?? 'por_sistema');
    if (!in_array($modelo, ['por_sistema', 'por_entidad'], true)) $modelo = 'por_sistema';

    return [
        'id_organizacion' => (int)$row['id_organizacion'],
        'codigo' => (string)$row['codigo'],
        'nombre' => (string)$row['nombre'],
        'modelo_reparto' => $modelo,
    ];
}

/** Devuelve la regla institucional vigente sin expandir organizaciones beneficiarias. */
function reparto_items_organizacion(PDO $pdo, int $idOrganizacion): array
{
    $st = $pdo->prepare("\n        SELECT\n            r.id_reparto, r.tipo_beneficiario, r.id_trabajador,\n            r.id_organizacion_beneficiaria, r.porcentaje,\n            CASE\n                WHEN r.tipo_beneficiario = 'trabajador' THEN CONCAT_WS(' ', t.nombre, t.apellido)\n                ELSE ob.nombre\n            END AS beneficiario_nombre,\n            t.alias_pago, tro.rol_en_organizacion AS rol,\n            ob.codigo AS organizacion_codigo\n        FROM organizaciones_reparto r\n        LEFT JOIN trabajadores t ON t.id = r.id_trabajador\n        LEFT JOIN trabajadores_organizaciones tro\n          ON tro.id_organizacion = r.id_organizacion\n         AND tro.id_trabajador = r.id_trabajador\n        LEFT JOIN organizaciones ob\n          ON ob.id_organizacion = r.id_organizacion_beneficiaria\n        WHERE r.id_organizacion = :org\n          AND r.activo = 1\n          AND r.fecha_hasta IS NULL\n        ORDER BY r.id_reparto\n    ");
    $st->execute([':org' => $idOrganizacion]);

    $items = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
        $items[] = [
            'id_reparto' => (int)$row['id_reparto'],
            'tipo_beneficiario' => (string)$row['tipo_beneficiario'],
            'id_trabajador' => $row['id_trabajador'] !== null ? (int)$row['id_trabajador'] : null,
            'id_organizacion_beneficiaria' => $row['id_organizacion_beneficiaria'] !== null
                ? (int)$row['id_organizacion_beneficiaria'] : null,
            'porcentaje' => (float)$row['porcentaje'],
            'beneficiario_nombre' => trim((string)($row['beneficiario_nombre'] ?? '')),
            'alias_pago' => $row['alias_pago'] !== null ? (string)$row['alias_pago'] : null,
            'rol' => $row['rol'] !== null ? (string)$row['rol'] : null,
            'organizacion_codigo' => $row['organizacion_codigo'] !== null
                ? (string)$row['organizacion_codigo'] : null,
        ];
    }
    return $items;
}

/** Equipo particular de un sistema de una organización `por_sistema`. */
function reparto_items_sistema(PDO $pdo, int $idOrganizacion, int $idSistema): array
{
    $st = $pdo->prepare("\n        SELECT st.id_trabajador, st.porcentaje_reparto, st.rol_en_sistema,\n               t.nombre, t.apellido, t.email, t.alias_pago,\n               tro.rol_en_organizacion AS rol, tro.activo\n        FROM sistemas_trabajadores st\n        INNER JOIN trabajadores t ON t.id = st.id_trabajador\n        INNER JOIN trabajadores_organizaciones tro\n          ON tro.id_organizacion = st.id_organizacion\n         AND tro.id_trabajador = st.id_trabajador\n        WHERE st.id_organizacion = :org\n          AND st.id_sistema = :sistema\n          AND tro.activo = 1\n          AND t.activo = 1\n        ORDER BY t.apellido, t.nombre, t.id\n    ");
    $st->execute([':org' => $idOrganizacion, ':sistema' => $idSistema]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $sumUnits = array_sum(array_map(
        static fn(array $row): int => (int)round((float)($row['porcentaje_reparto'] ?? 0) * 10000),
        $rows
    ));
    $configured = count($rows) > 0 && abs($sumUnits - 1000000) <= 1;
    $fallback = $configured ? [] : reparto_porcentajes_iguales(count($rows), 4);

    $items = [];
    foreach ($rows as $index => $row) {
        $pct = $configured ? (float)$row['porcentaje_reparto'] : (float)($fallback[$index] ?? 0);
        $items[] = [
            'tipo_beneficiario' => 'trabajador',
            'id_trabajador' => (int)$row['id_trabajador'],
            'beneficiario_nombre' => trim((string)$row['nombre'] . ' ' . (string)$row['apellido']),
            'nombre' => (string)$row['nombre'],
            'apellido' => (string)$row['apellido'],
            'email' => $row['email'] !== null ? (string)$row['email'] : null,
            'alias_pago' => $row['alias_pago'] !== null ? (string)$row['alias_pago'] : null,
            'rol' => (string)$row['rol'],
            'rol_en_sistema' => $row['rol_en_sistema'] !== null ? (string)$row['rol_en_sistema'] : null,
            'porcentaje' => $pct,
            'activo' => (int)$row['activo'],
            'ruta' => null,
            'rutas' => [],
            'configurado' => $configured,
        ];
    }
    if ($items) $items = reparto_normalizar_porcentajes($items);

    return [
        'items' => $items,
        'configurado' => $configured,
        'usa_reparto_igualitario' => !$configured && count($rows) > 0,
        'total' => reparto_redondear(array_sum(array_column($items, 'porcentaje'))),
    ];
}

/**
 * Expansión porcentual vigente. Se conserva como API auxiliar para pantallas,
 * pero los montos contables se resuelven con la función jerárquica de abajo.
 */
function reparto_expandir_organizacion(
    PDO $pdo,
    int $idOrganizacion,
    float $porcentajePadre = 100.0,
    array $visitadas = [],
    string $ruta = ''
): array {
    $org = reparto_organizacion_config($pdo, $idOrganizacion);
    $currentRoute = $ruta !== '' ? $ruta : $org['codigo'];

    if (in_array($idOrganizacion, $visitadas, true) || count($visitadas) >= 6) {
        return [[
            'tipo_beneficiario' => 'organizacion',
            'id_organizacion_beneficiaria' => $idOrganizacion,
            'beneficiario_nombre' => $org['nombre'],
            'porcentaje' => $porcentajePadre,
            'ruta' => $currentRoute,
            'rutas' => [$currentRoute],
            'configurado' => false,
        ]];
    }

    $items = reparto_items_organizacion($pdo, $idOrganizacion);
    if (!reparto_regla_valida($items)) {
        return [[
            'tipo_beneficiario' => 'organizacion',
            'id_organizacion_beneficiaria' => $idOrganizacion,
            'beneficiario_nombre' => $org['nombre'],
            'porcentaje' => $porcentajePadre,
            'ruta' => $currentRoute,
            'rutas' => [$currentRoute],
            'configurado' => false,
        ]];
    }

    $visitadas[] = $idOrganizacion;
    $out = [];
    foreach ($items as $item) {
        $effective = ($porcentajePadre * (float)$item['porcentaje']) / 100.0;
        if ($item['tipo_beneficiario'] === 'trabajador') {
            $out[] = [
                'tipo_beneficiario' => 'trabajador',
                'id_trabajador' => $item['id_trabajador'],
                'beneficiario_nombre' => $item['beneficiario_nombre'],
                'alias_pago' => $item['alias_pago'],
                'rol' => $item['rol'],
                'porcentaje' => $effective,
                'porcentaje_directo' => (float)$item['porcentaje'],
                'ruta' => $currentRoute,
                'rutas' => [$currentRoute],
                'configurado' => true,
            ];
            continue;
        }

        $childId = (int)($item['id_organizacion_beneficiaria'] ?? 0);
        if ($childId <= 0) continue;
        $childRoute = $currentRoute . ' → ' . ($item['organizacion_codigo'] ?: $item['beneficiario_nombre']);
        foreach (reparto_expandir_organizacion($pdo, $childId, $effective, $visitadas, $childRoute) as $row) {
            $out[] = $row;
        }
    }
    return $out;
}

/** Distribuye recursivamente un monto respetando cada rama institucional. */
function reparto_distribuir_organizacion_jerarquico(
    PDO $pdo,
    int $idOrganizacion,
    float $monto,
    float $porcentajePadre = 100.0,
    array $visitadas = [],
    string $ruta = ''
): array {
    $org = reparto_organizacion_config($pdo, $idOrganizacion);
    $currentRoute = $ruta !== '' ? $ruta : $org['codigo'];

    if (in_array($idOrganizacion, $visitadas, true) || count($visitadas) >= 6) {
        return [
            'configurado' => false,
            'items' => [[
                'tipo_beneficiario' => 'organizacion',
                'id_organizacion_beneficiaria' => $idOrganizacion,
                'beneficiario_nombre' => $org['nombre'],
                'porcentaje' => $porcentajePadre,
                'monto_estimado' => round($monto, 2),
                'ruta' => $currentRoute,
                'rutas' => [$currentRoute],
                'configurado' => false,
            ]],
        ];
    }

    $direct = reparto_items_organizacion($pdo, $idOrganizacion);
    if (!reparto_regla_valida($direct)) {
        return [
            'configurado' => false,
            'items' => [[
                'tipo_beneficiario' => 'organizacion',
                'id_organizacion_beneficiaria' => $idOrganizacion,
                'beneficiario_nombre' => $org['nombre'],
                'porcentaje' => $porcentajePadre,
                'monto_estimado' => round($monto, 2),
                'ruta' => $currentRoute,
                'rutas' => [$currentRoute],
                'configurado' => false,
            ]],
        ];
    }

    $visitadas[] = $idOrganizacion;
    $directWithAmounts = reparto_aplicar_montos_exactos($direct, $monto);
    $out = [];
    $configured = true;

    foreach ($directWithAmounts as $item) {
        $effective = ($porcentajePadre * (float)$item['porcentaje']) / 100.0;
        $branchAmount = round((float)($item['monto_estimado'] ?? 0), 2);

        if ($item['tipo_beneficiario'] === 'trabajador') {
            $out[] = [
                'tipo_beneficiario' => 'trabajador',
                'id_trabajador' => $item['id_trabajador'],
                'beneficiario_nombre' => $item['beneficiario_nombre'],
                'alias_pago' => $item['alias_pago'],
                'rol' => $item['rol'],
                'porcentaje' => $effective,
                'porcentaje_directo' => (float)$item['porcentaje'],
                'monto_estimado' => $branchAmount,
                'ruta' => $currentRoute,
                'rutas' => [$currentRoute],
                'configurado' => true,
            ];
            continue;
        }

        $childId = (int)($item['id_organizacion_beneficiaria'] ?? 0);
        if ($childId <= 0) {
            $configured = false;
            continue;
        }
        $childRoute = $currentRoute . ' → ' . ($item['organizacion_codigo'] ?: $item['beneficiario_nombre']);
        $child = reparto_distribuir_organizacion_jerarquico(
            $pdo,
            $childId,
            $branchAmount,
            $effective,
            $visitadas,
            $childRoute
        );
        $configured = $configured && (bool)$child['configurado'];
        foreach ($child['items'] as $row) $out[] = $row;
    }

    return ['configurado' => $configured, 'items' => $out];
}

function reparto_agrupar_items_finales(array $items): array
{
    $grouped = [];
    foreach ($items as $item) {
        $key = ($item['tipo_beneficiario'] ?? '') === 'trabajador'
            ? 't:' . (int)($item['id_trabajador'] ?? 0)
            : 'o:' . (int)($item['id_organizacion_beneficiaria'] ?? 0);

        if (!isset($grouped[$key])) {
            $grouped[$key] = $item;
            $grouped[$key]['porcentaje'] = 0.0;
            $grouped[$key]['monto_estimado'] = 0.0;
            $grouped[$key]['rutas'] = [];
        }
        $grouped[$key]['porcentaje'] += (float)($item['porcentaje'] ?? 0);
        $grouped[$key]['monto_estimado'] += (float)($item['monto_estimado'] ?? 0);
        foreach (($item['rutas'] ?? (!empty($item['ruta']) ? [$item['ruta']] : [])) as $route) {
            if ($route !== '') $grouped[$key]['rutas'][] = (string)$route;
        }
    }

    $final = array_values($grouped);
    if ($final) $final = reparto_normalizar_porcentajes($final);
    foreach ($final as &$item) {
        $item['monto_estimado'] = round((float)$item['monto_estimado'], 2);
        $item['rutas'] = array_values(array_unique($item['rutas']));
        $item['ruta'] = $item['rutas'][0] ?? ($item['ruta'] ?? null);
    }
    unset($item);

    usort($final, static fn(array $a, array $b): int => strcmp(
        (string)($a['beneficiario_nombre'] ?? ''),
        (string)($b['beneficiario_nombre'] ?? '')
    ));
    return $final;
}

function reparto_resumen_organizacion(PDO $pdo, int $idOrganizacion, float $monto = 0.0): array
{
    $org = reparto_organizacion_config($pdo, $idOrganizacion);
    $direct = reparto_items_organizacion($pdo, $idOrganizacion);
    $directValid = reparto_regla_valida($direct);
    $directWithAmounts = $directValid ? reparto_aplicar_montos_exactos($direct, $monto) : $direct;
    $tree = reparto_distribuir_organizacion_jerarquico($pdo, $idOrganizacion, $monto);
    $final = reparto_agrupar_items_finales($tree['items']);

    return [
        'organizacion' => $org,
        'modelo_reparto' => $org['modelo_reparto'],
        'configurado' => $directValid && (bool)$tree['configurado'] && count($final) > 0,
        'usa_reparto_igualitario' => false,
        'origen' => 'regla_vigente',
        'total_porcentaje' => reparto_redondear(array_sum(array_column($final, 'porcentaje'))),
        'monto_base' => reparto_redondear($monto, 2),
        'regla_directa' => $directWithAmounts,
        'items' => $final,
    ];
}

/** Resumen final y exacto para un sistema. */
function reparto_resumen_sistema(PDO $pdo, int $idOrganizacion, int $idSistema, float $monto = 0.0): array
{
    $org = reparto_organizacion_config($pdo, $idOrganizacion);

    if ($org['modelo_reparto'] === 'por_entidad') {
        return reparto_resumen_organizacion($pdo, $idOrganizacion, $monto);
    }

    $direct = reparto_items_sistema($pdo, $idOrganizacion, $idSistema);
    $items = reparto_aplicar_montos_exactos($direct['items'], $monto);

    return [
        'organizacion' => $org,
        'modelo_reparto' => $org['modelo_reparto'],
        'configurado' => (bool)$direct['configurado'],
        'usa_reparto_igualitario' => (bool)$direct['usa_reparto_igualitario'],
        'origen' => 'regla_vigente',
        'total_porcentaje' => reparto_redondear(array_sum(array_column($items, 'porcentaje'))),
        'monto_base' => reparto_redondear($monto, 2),
        'regla_directa' => $items,
        'items' => $items,
    ];
}

/** Obtiene el pago y calcula su reparto con la regla vigente. */
function reparto_resumen_pago(PDO $pdo, int $idOrganizacion, int $idPago): array
{
    $st = $pdo->prepare("\n        SELECT id_pago, id_sistema, monto\n        FROM pagos\n        WHERE id_organizacion=:org AND id_pago=:pago\n        LIMIT 1\n    ");
    $st->execute([':org' => $idOrganizacion, ':pago' => $idPago]);
    $pago = $st->fetch(PDO::FETCH_ASSOC);
    if (!$pago) throw new RuntimeException('Pago inexistente en la organización activa.');

    $resumen = reparto_resumen_sistema(
        $pdo,
        $idOrganizacion,
        (int)$pago['id_sistema'],
        (float)$pago['monto']
    );
    $resumen['origen'] = 'regla_vigente';
    return $resumen;
}
