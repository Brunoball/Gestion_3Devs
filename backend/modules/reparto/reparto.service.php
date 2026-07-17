<?php
// backend/modules/reparto/reparto.service.php
declare(strict_types=1);

/**
 * Motor central de distribución de ingresos.
 *
 * Diseño contable:
 * - Cada pago congela su reparto exacto en `pagos_reparto_snapshots`.
 * - Cada egreso con pagadores congela sus reembolsos en
 *   `egresos_reparto_snapshots`.
 * - Cambiar porcentajes solo afecta movimientos futuros; nunca reescribe el
 *   historial ya registrado.
 * - En repartos entre entidades, los montos se asignan jerárquicamente para
 *   respetar cada nivel exacto (por ejemplo: BALTO 50/50 y luego 3DEVS 33/33/33).
 */

function reparto_redondear(float $value, int $scale = 4): float
{
    return round($value, $scale);
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

    // La configuración se persiste con cuatro decimales: debe sumar 100,0000%
    // de forma exacta. No se corrigen silenciosamente faltantes ni sobrantes.
    return $totalUnits === 1000000;
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

    $items = [];
    foreach ($rows as $row) {
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
            'porcentaje' => (float)$row['porcentaje_reparto'],
            'activo' => (int)$row['activo'],
            'ruta' => null,
            'rutas' => [],
            'configurado' => false,
        ];
    }

    // Nunca se inventa un reparto igualitario. Si la suma no es exactamente
    // 100%, el pago queda bloqueado y debe corregirse la configuración.
    $configured = reparto_regla_valida($items);
    foreach ($items as &$item) $item['configurado'] = $configured;
    unset($item);
    if ($configured) $items = reparto_normalizar_porcentajes($items);

    return [
        'items' => $items,
        'configurado' => $configured,
        'usa_reparto_igualitario' => false,
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

/** Comprueba la existencia de las tablas de snapshots financieros. */
function reparto_snapshot_table_exists(PDO $pdo, string $table): bool
{
    static $cache = [];
    if (array_key_exists($table, $cache)) return (bool)$cache[$table];
    $st = $pdo->prepare("\n        SELECT COUNT(*)\n        FROM information_schema.TABLES\n        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tabla\n    ");
    $st->execute([':tabla' => $table]);
    $cache[$table] = (int)$st->fetchColumn() > 0;
    return (bool)$cache[$table];
}

function reparto_validar_resumen_contable(array $summary, float $expectedAmount): void
{
    $items = is_array($summary['items'] ?? null) ? $summary['items'] : [];
    $totalPercentage = (float)($summary['total_porcentaje'] ?? 0.0);
    $totalPercentageUnits = (int)round($totalPercentage * 10000);
    if (empty($summary['configurado']) || !$items || $totalPercentageUnits !== 1000000) {
        throw new DomainException('La configuración de reparto está incompleta o no suma exactamente 100%.');
    }
    if (!empty($summary['usa_reparto_igualitario'])) {
        throw new DomainException('No se permite liquidar con un reparto igualitario automático.');
    }

    $distributed = round(array_sum(array_map(
        static fn(array $item): float => (float)($item['monto_estimado'] ?? 0),
        $items
    )), 2);
    if (abs($distributed - round($expectedAmount, 2)) > 0.01) {
        throw new DomainException('El reparto no coincide exactamente con el monto del movimiento.');
    }
}

function reparto_pago_snapshot_cargar(PDO $pdo, int $idOrganizacion, int $idPago): ?array
{
    if (!reparto_snapshot_table_exists($pdo, 'pagos_reparto_snapshots')) return null;
    $st = $pdo->prepare("\n        SELECT monto, snapshot_json, snapshot_hash, created_at\n        FROM pagos_reparto_snapshots\n        WHERE id_organizacion = :org AND id_pago = :pago\n        LIMIT 1\n    ");
    $st->execute([':org' => $idOrganizacion, ':pago' => $idPago]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;

    $json = (string)$row['snapshot_json'];
    $hash = trim((string)($row['snapshot_hash'] ?? ''));
    if ($hash !== '' && !hash_equals($hash, hash('sha256', $json))) {
        throw new RuntimeException('El snapshot de reparto del pago está dañado.');
    }
    $decoded = json_decode($json, true);
    if (!is_array($decoded)) throw new RuntimeException('El snapshot de reparto del pago es inválido.');
    $decoded['origen'] = 'snapshot_pago';
    $decoded['snapshot_creado_at'] = (string)($row['created_at'] ?? '');
    return ['monto' => round((float)$row['monto'], 2), 'resumen' => $decoded];
}

function reparto_pago_snapshot_guardar(
    PDO $pdo,
    array $payment,
    array $summary
): array {
    if (!reparto_snapshot_table_exists($pdo, 'pagos_reparto_snapshots')) {
        throw new RuntimeException('Falta ejecutar la migración de snapshots de pagos.');
    }

    reparto_validar_resumen_contable($summary, (float)$payment['monto']);
    $summary['origen'] = 'snapshot_pago';
    $json = json_encode($summary, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    if ($json === false) throw new RuntimeException('No se pudo serializar el reparto del pago.');

    $st = $pdo->prepare("\n        INSERT INTO pagos_reparto_snapshots\n            (id_pago, id_organizacion, id_sistema, id_mes, anio, monto, snapshot_json, snapshot_hash)\n        VALUES\n            (:pago, :org, :sistema, :mes, :anio, :monto, :snapshot, :hash)\n        ON DUPLICATE KEY UPDATE id_pago = VALUES(id_pago)\n    ");
    $st->execute([
        ':pago' => (int)$payment['id_pago'],
        ':org' => (int)$payment['id_organizacion'],
        ':sistema' => (int)$payment['id_sistema'],
        ':mes' => (int)$payment['id_mes'],
        ':anio' => (int)$payment['anio_periodo'],
        ':monto' => round((float)$payment['monto'], 2),
        ':snapshot' => $json,
        ':hash' => hash('sha256', $json),
    ]);

    $loaded = reparto_pago_snapshot_cargar($pdo, (int)$payment['id_organizacion'], (int)$payment['id_pago']);
    if (!$loaded) throw new RuntimeException('No se pudo confirmar el snapshot del pago.');
    return $loaded['resumen'];
}

function reparto_pago_snapshot_eliminar(PDO $pdo, int $idOrganizacion, int $idPago): void
{
    if (!reparto_snapshot_table_exists($pdo, 'pagos_reparto_snapshots')) return;
    $st = $pdo->prepare('DELETE FROM pagos_reparto_snapshots WHERE id_organizacion=:org AND id_pago=:pago');
    $st->execute([':org' => $idOrganizacion, ':pago' => $idPago]);
}

/** Obtiene el pago y usa siempre el reparto congelado del movimiento. */
function reparto_resumen_pago(PDO $pdo, int $idOrganizacion, int $idPago, bool $crearSnapshot = true): array
{
    $st = $pdo->prepare("\n        SELECT id_pago, id_organizacion, id_sistema, id_mes, anio_periodo, monto\n        FROM pagos\n        WHERE id_organizacion=:org AND id_pago=:pago\n        LIMIT 1\n    ");
    $st->execute([':org' => $idOrganizacion, ':pago' => $idPago]);
    $payment = $st->fetch(PDO::FETCH_ASSOC);
    if (!$payment) throw new RuntimeException('Pago inexistente en la organización activa.');

    $snapshot = reparto_pago_snapshot_cargar($pdo, $idOrganizacion, $idPago);
    if ($snapshot) {
        if (abs((float)$snapshot['monto'] - round((float)$payment['monto'], 2)) > 0.01) {
            throw new RuntimeException('El monto del pago no coincide con su snapshot contable.');
        }
        return $snapshot['resumen'];
    }

    $summary = reparto_resumen_sistema(
        $pdo,
        $idOrganizacion,
        (int)$payment['id_sistema'],
        (float)$payment['monto']
    );
    reparto_validar_resumen_contable($summary, (float)$payment['monto']);

    if ($crearSnapshot && reparto_snapshot_table_exists($pdo, 'pagos_reparto_snapshots')) {
        return reparto_pago_snapshot_guardar($pdo, $payment, $summary);
    }

    $summary['origen'] = 'regla_vigente_sin_snapshot';
    $summary['snapshot_faltante'] = true;
    return $summary;
}

function reparto_egreso_snapshot_cargar(PDO $pdo, int $idOrganizacion, int $idEgreso): ?array
{
    if (!reparto_snapshot_table_exists($pdo, 'egresos_reparto_snapshots')) return null;
    $st = $pdo->prepare("\n        SELECT monto, pagadores_hash, snapshot_json, snapshot_hash, created_at\n        FROM egresos_reparto_snapshots\n        WHERE id_organizacion=:org AND id_egreso=:egreso\n        LIMIT 1\n    ");
    $st->execute([':org' => $idOrganizacion, ':egreso' => $idEgreso]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;
    $json = (string)$row['snapshot_json'];
    $hash = trim((string)($row['snapshot_hash'] ?? ''));
    if ($hash !== '' && !hash_equals($hash, hash('sha256', $json))) {
        throw new RuntimeException('El snapshot de reparto del egreso está dañado.');
    }
    $decoded = json_decode($json, true);
    if (!is_array($decoded)) throw new RuntimeException('El snapshot de reparto del egreso es inválido.');
    return [
        'monto' => round((float)$row['monto'], 2),
        'pagadores_hash' => (string)$row['pagadores_hash'],
        'snapshot' => $decoded,
        'created_at' => (string)($row['created_at'] ?? ''),
    ];
}

function reparto_egreso_pagadores_hash(array $payers): string
{
    $normalized = array_map(static function (array $payer): array {
        return [
            'tipo_pagador' => (string)($payer['tipo_pagador'] ?? ''),
            'id_trabajador' => isset($payer['id_trabajador']) ? (int)$payer['id_trabajador'] : null,
            'id_organizacion_pagadora' => isset($payer['id_organizacion_pagadora'])
                ? (int)$payer['id_organizacion_pagadora'] : null,
            'monto' => round((float)($payer['monto'] ?? 0), 2),
        ];
    }, $payers);
    usort($normalized, static fn(array $a, array $b): int => strcmp(json_encode($a), json_encode($b)));
    return hash('sha256', (string)json_encode($normalized, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION));
}

function reparto_egreso_snapshot_eliminar(PDO $pdo, int $idOrganizacion, int $idEgreso): void
{
    if (!reparto_snapshot_table_exists($pdo, 'egresos_reparto_snapshots')) return;
    $st = $pdo->prepare('DELETE FROM egresos_reparto_snapshots WHERE id_organizacion=:org AND id_egreso=:egreso');
    $st->execute([':org' => $idOrganizacion, ':egreso' => $idEgreso]);
}

function reparto_resumen_egreso(
    PDO $pdo,
    int $idOrganizacion,
    int $idEgreso,
    array $payers,
    bool $crearSnapshot = true
): array {
    $st = $pdo->prepare("\n        SELECT id_egreso, id_organizacion, monto, fecha\n        FROM egresos\n        WHERE id_organizacion=:org AND id_egreso=:egreso\n        LIMIT 1\n    ");
    $st->execute([':org' => $idOrganizacion, ':egreso' => $idEgreso]);
    $expense = $st->fetch(PDO::FETCH_ASSOC);
    if (!$expense) throw new RuntimeException('Egreso inexistente en la organización activa.');

    $payerHash = reparto_egreso_pagadores_hash($payers);
    $stored = reparto_egreso_snapshot_cargar($pdo, $idOrganizacion, $idEgreso);
    if ($stored) {
        if (abs((float)$stored['monto'] - round((float)$expense['monto'], 2)) > 0.01
            || !hash_equals((string)$stored['pagadores_hash'], $payerHash)) {
            throw new RuntimeException('El egreso no coincide con su snapshot contable.');
        }
        return $stored['snapshot'];
    }

    $workers = [];
    $organizations = [];
    $details = [];
    $total = 0.0;
    foreach ($payers as $payer) {
        $amount = round((float)($payer['monto'] ?? 0), 2);
        if ($amount <= 0) throw new DomainException('Hay un pagador de egreso con monto inválido.');
        $total += $amount;

        if (($payer['tipo_pagador'] ?? '') === 'trabajador') {
            $workerId = (int)($payer['id_trabajador'] ?? 0);
            if ($workerId <= 0) throw new DomainException('Hay un pagador trabajador inválido.');
            $workerSt = $pdo->prepare('SELECT id_organizacion FROM trabajadores WHERE id=:id LIMIT 1');
            $workerSt->execute([':id' => $workerId]);
            $workerOrganization = (int)($workerSt->fetchColumn() ?: 0);
            if ($workerOrganization <= 0) throw new DomainException('El trabajador pagador no existe.');
            $workers[$workerId] = round((float)($workers[$workerId] ?? 0) + $amount, 2);
            $details[] = [
                'tipo_pagador' => 'trabajador',
                'id_trabajador' => $workerId,
                'id_organizacion_trabajador' => $workerOrganization,
                'id_organizacion_pagadora' => null,
                'monto' => $amount,
                'workers' => [$workerId => $amount],
                'organizations' => [],
            ];
            continue;
        }

        if (($payer['tipo_pagador'] ?? '') !== 'organizacion') {
            throw new DomainException('Hay un tipo de pagador de egreso inválido.');
        }
        $payerOrganization = (int)($payer['id_organizacion_pagadora'] ?? 0);
        if ($payerOrganization <= 0) throw new DomainException('Hay una organización pagadora inválida.');
        $tree = reparto_distribuir_organizacion_jerarquico($pdo, $payerOrganization, $amount);
        $items = reparto_agrupar_items_finales($tree['items'] ?? []);
        if (empty($tree['configurado']) || !$items) {
            throw new DomainException('La organización pagadora no tiene un reparto válido.');
        }
        $detailWorkers = [];
        $detailOrganizations = [];
        $distributed = 0.0;
        foreach ($items as $item) {
            $itemAmount = round((float)($item['monto_estimado'] ?? 0), 2);
            $distributed += $itemAmount;
            if (($item['tipo_beneficiario'] ?? '') === 'trabajador') {
                $workerId = (int)($item['id_trabajador'] ?? 0);
                if ($workerId > 0) {
                    $detailWorkers[$workerId] = round((float)($detailWorkers[$workerId] ?? 0) + $itemAmount, 2);
                    $workers[$workerId] = round((float)($workers[$workerId] ?? 0) + $itemAmount, 2);
                }
            } else {
                $organizationId = (int)($item['id_organizacion_beneficiaria'] ?? 0);
                if ($organizationId > 0) {
                    $detailOrganizations[$organizationId] = round((float)($detailOrganizations[$organizationId] ?? 0) + $itemAmount, 2);
                    $organizations[$organizationId] = round((float)($organizations[$organizationId] ?? 0) + $itemAmount, 2);
                }
            }
        }
        if (abs(round($distributed, 2) - $amount) > 0.01) {
            throw new DomainException('El reparto del pagador del egreso no coincide con su monto.');
        }
        $details[] = [
            'tipo_pagador' => 'organizacion',
            'id_trabajador' => null,
            'id_organizacion_pagadora' => $payerOrganization,
            'monto' => $amount,
            'workers' => $detailWorkers,
            'organizations' => $detailOrganizations,
        ];
    }

    if ($payers && abs(round($total, 2) - round((float)$expense['monto'], 2)) > 0.01) {
        throw new DomainException('La suma de pagadores no coincide exactamente con el monto del egreso.');
    }

    $summary = [
        'id_egreso' => $idEgreso,
        'id_organizacion' => $idOrganizacion,
        'fecha' => (string)$expense['fecha'],
        'monto_egreso' => round((float)$expense['monto'], 2),
        'monto_pagadores' => round($total, 2),
        'workers' => $workers,
        'organizations' => $organizations,
        'payers' => $details,
        'origen' => 'snapshot_egreso',
    ];

    if ($crearSnapshot && reparto_snapshot_table_exists($pdo, 'egresos_reparto_snapshots')) {
        $json = json_encode($summary, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
        if ($json === false) throw new RuntimeException('No se pudo serializar el reparto del egreso.');
        $ins = $pdo->prepare("\n            INSERT INTO egresos_reparto_snapshots\n                (id_egreso, id_organizacion, fecha, monto, pagadores_hash, snapshot_json, snapshot_hash)\n            VALUES\n                (:egreso, :org, :fecha, :monto, :payers_hash, :snapshot, :snapshot_hash)\n            ON DUPLICATE KEY UPDATE id_egreso = VALUES(id_egreso)\n        ");
        $ins->execute([
            ':egreso' => $idEgreso,
            ':org' => $idOrganizacion,
            ':fecha' => (string)$expense['fecha'],
            ':monto' => round((float)$expense['monto'], 2),
            ':payers_hash' => $payerHash,
            ':snapshot' => $json,
            ':snapshot_hash' => hash('sha256', $json),
        ]);
        $stored = reparto_egreso_snapshot_cargar($pdo, $idOrganizacion, $idEgreso);
        if (!$stored) throw new RuntimeException('No se pudo confirmar el snapshot del egreso.');
        return $stored['snapshot'];
    }

    $summary['origen'] = 'regla_vigente_sin_snapshot';
    $summary['snapshot_faltante'] = true;
    return $summary;
}
