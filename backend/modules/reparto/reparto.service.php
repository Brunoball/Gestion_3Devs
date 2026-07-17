<?php
// backend/modules/reparto/reparto.service.php
declare(strict_types=1);

/**
 * Motor central de distribución de ingresos.
 *
 * Reglas del negocio:
 * - 3DEVS (`por_sistema`): cada sistema define su equipo y porcentajes.
 * - BALTO (`por_entidad`): todos los sistemas usan una regla institucional.
 * - Una organización beneficiaria puede distribuir su participación entre personas.
 *   Ejemplo: BALTO 50% contador + 50% 3DEVS; el 50% de 3DEVS se expande entre
 *   los integrantes de 3DEVS según su distribución interna vigente.
 * - Al registrar un pago, el resultado se congela en `pagos_reparto` para que
 *   cambios futuros de porcentajes no alteren la contabilidad histórica.
 */

function reparto_redondear(float $value, int $scale = 4): float
{
    return round($value, $scale);
}

function reparto_tabla_existe(PDO $pdo, string $tabla): bool
{
    $st = $pdo->prepare(
        'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tabla LIMIT 1'
    );
    $st->execute([':tabla' => $tabla]);
    return (bool)$st->fetchColumn();
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
 * El resultado siempre suma exactamente el monto base.
 */
function reparto_aplicar_montos_exactos(array $items, float $monto): array
{
    if (!$items) return [];

    $totalCentavos = (int)round(max(0.0, $monto) * 100);
    $porcentajeTotal = array_sum(array_map(
        static fn(array $item): float => max(0.0, (float)($item['porcentaje'] ?? 0)),
        $items
    ));
    $objetivoCentavos = (int)round($totalCentavos * min(100.0, $porcentajeTotal) / 100.0);
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
            if ($calculados[$i % $cantidad]['centavos'] > 0) {
                $calculados[$i % $cantidad]['centavos']--;
            }
        }
    }

    foreach ($calculados as $calc) {
        $items[$calc['index']]['monto_estimado'] = $calc['centavos'] / 100;
    }

    return $items;
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
            'porcentaje' => reparto_redondear((float)$row['porcentaje']),
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

    $sum = 0.0;
    foreach ($rows as $row) $sum += (float)($row['porcentaje_reparto'] ?? 0);
    $configured = count($rows) > 0 && abs($sum - 100.0) <= 0.0001;
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
            'porcentaje' => reparto_redondear($pct),
            'activo' => (int)$row['activo'],
            'ruta' => null,
            'configurado' => $configured,
        ];
    }

    return [
        'items' => $items,
        'configurado' => $configured,
        'total' => reparto_redondear(array_sum(array_column($items, 'porcentaje'))),
    ];
}

/** Expande organizaciones beneficiarias hasta llegar a personas finales. */
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
            'porcentaje' => reparto_redondear($porcentajePadre),
            'ruta' => $currentRoute,
            'configurado' => false,
        ]];
    }

    $items = reparto_items_organizacion($pdo, $idOrganizacion);
    $visitadas[] = $idOrganizacion;

    if (!$items) {
        return [[
            'tipo_beneficiario' => 'organizacion',
            'id_organizacion_beneficiaria' => $idOrganizacion,
            'beneficiario_nombre' => $org['nombre'],
            'porcentaje' => reparto_redondear($porcentajePadre),
            'ruta' => $currentRoute,
            'configurado' => false,
        ]];
    }

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
                'porcentaje' => reparto_redondear($effective),
                'porcentaje_directo' => reparto_redondear((float)$item['porcentaje']),
                'ruta' => $currentRoute,
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

/** Resumen final y exacto para un sistema. */
function reparto_resumen_sistema(PDO $pdo, int $idOrganizacion, int $idSistema, float $monto = 0.0): array
{
    $org = reparto_organizacion_config($pdo, $idOrganizacion);
    $reglaDirecta = [];

    if ($org['modelo_reparto'] === 'por_sistema') {
        $direct = reparto_items_sistema($pdo, $idOrganizacion, $idSistema);
        $items = $direct['items'];
        $configured = (bool)$direct['configurado'];
        $reglaDirecta = $items;
    } else {
        $reglaDirecta = reparto_items_organizacion($pdo, $idOrganizacion);
        $items = reparto_expandir_organizacion($pdo, $idOrganizacion);
        $configured = count($reglaDirecta) > 0
            && abs(array_sum(array_column($reglaDirecta, 'porcentaje')) - 100.0) <= 0.0001
            && count($items) > 0
            && !array_filter($items, static fn(array $item): bool => empty($item['configurado']));
    }

    $grouped = [];
    foreach ($items as $item) {
        $key = $item['tipo_beneficiario'] === 'trabajador'
            ? 't:' . (int)($item['id_trabajador'] ?? 0)
            : 'o:' . (int)($item['id_organizacion_beneficiaria'] ?? 0);
        if (!isset($grouped[$key])) {
            $grouped[$key] = $item;
            $grouped[$key]['porcentaje'] = 0.0;
            $grouped[$key]['rutas'] = [];
        }
        $grouped[$key]['porcentaje'] += (float)($item['porcentaje'] ?? 0);
        if (!empty($item['ruta'])) $grouped[$key]['rutas'][] = (string)$item['ruta'];
    }

    $final = [];
    foreach ($grouped as $item) {
        $item['porcentaje'] = reparto_redondear((float)$item['porcentaje']);
        $item['rutas'] = array_values(array_unique($item['rutas']));
        $final[] = $item;
    }
    usort($final, static fn(array $a, array $b): int => strcmp(
        (string)($a['beneficiario_nombre'] ?? ''),
        (string)($b['beneficiario_nombre'] ?? '')
    ));
    $final = reparto_aplicar_montos_exactos($final, $monto);

    $reglaDirecta = reparto_aplicar_montos_exactos($reglaDirecta, $monto);

    return [
        'organizacion' => $org,
        'modelo_reparto' => $org['modelo_reparto'],
        'configurado' => $configured,
        'total_porcentaje' => reparto_redondear(array_sum(array_column($final, 'porcentaje'))),
        'monto_base' => reparto_redondear($monto, 2),
        'regla_directa' => $reglaDirecta,
        'items' => $final,
    ];
}

/** Congela la distribución efectiva de un pago. */
function reparto_snapshot_pago_guardar(
    PDO $pdo,
    int $idOrganizacion,
    int $idPago,
    int $idSistema,
    float $monto
): array {
    if (!reparto_tabla_existe($pdo, 'pagos_reparto')) {
        throw new RuntimeException('Falta ejecutar la migración que crea pagos_reparto.');
    }

    $resumen = reparto_resumen_sistema($pdo, $idOrganizacion, $idSistema, $monto);
    if (!$resumen['configurado'] || abs((float)$resumen['total_porcentaje'] - 100.0) > 0.0001) {
        throw new RuntimeException(
            'El sistema no tiene una distribución contable válida. Configurala antes de registrar el pago.'
        );
    }

    $pdo->prepare('DELETE FROM pagos_reparto WHERE id_organizacion=:org AND id_pago=:pago')
        ->execute([':org' => $idOrganizacion, ':pago' => $idPago]);

    $ins = $pdo->prepare("\n        INSERT INTO pagos_reparto\n          (id_organizacion, id_pago, orden, tipo_beneficiario, id_trabajador,\n           id_organizacion_beneficiaria, beneficiario_nombre, alias_pago, rol, ruta,\n           porcentaje, monto)\n        VALUES\n          (:org, :pago, :orden, :tipo, :trabajador, :org_benef, :nombre, :alias, :rol, :ruta, :pct, :monto)\n    ");

    foreach ($resumen['items'] as $index => $item) {
        $ins->execute([
            ':org' => $idOrganizacion,
            ':pago' => $idPago,
            ':orden' => $index + 1,
            ':tipo' => (string)$item['tipo_beneficiario'],
            ':trabajador' => $item['id_trabajador'] ?? null,
            ':org_benef' => $item['id_organizacion_beneficiaria'] ?? null,
            ':nombre' => mb_substr((string)($item['beneficiario_nombre'] ?? 'Beneficiario'), 0, 160),
            ':alias' => isset($item['alias_pago']) && $item['alias_pago'] !== ''
                ? mb_substr((string)$item['alias_pago'], 0, 100) : null,
            ':rol' => isset($item['rol']) && $item['rol'] !== ''
                ? mb_substr((string)$item['rol'], 0, 60) : null,
            ':ruta' => !empty($item['rutas'])
                ? mb_substr(implode(' / ', $item['rutas']), 0, 255)
                : (isset($item['ruta']) ? mb_substr((string)$item['ruta'], 0, 255) : null),
            ':pct' => reparto_redondear((float)$item['porcentaje']),
            ':monto' => reparto_redondear((float)$item['monto_estimado'], 2),
        ]);
    }

    return $resumen;
}

function reparto_snapshot_pago_leer(PDO $pdo, int $idOrganizacion, int $idPago): array
{
    if (!reparto_tabla_existe($pdo, 'pagos_reparto')) return [];

    $st = $pdo->prepare("\n        SELECT orden, tipo_beneficiario, id_trabajador, id_organizacion_beneficiaria,\n               beneficiario_nombre, alias_pago, rol, ruta, porcentaje, monto\n        FROM pagos_reparto\n        WHERE id_organizacion=:org AND id_pago=:pago\n        ORDER BY orden, id_pago_reparto\n    ");
    $st->execute([':org' => $idOrganizacion, ':pago' => $idPago]);

    return array_map(static function (array $row): array {
        return [
            'tipo_beneficiario' => (string)$row['tipo_beneficiario'],
            'id_trabajador' => $row['id_trabajador'] !== null ? (int)$row['id_trabajador'] : null,
            'id_organizacion_beneficiaria' => $row['id_organizacion_beneficiaria'] !== null
                ? (int)$row['id_organizacion_beneficiaria'] : null,
            'beneficiario_nombre' => (string)$row['beneficiario_nombre'],
            'alias_pago' => $row['alias_pago'] !== null ? (string)$row['alias_pago'] : null,
            'rol' => $row['rol'] !== null ? (string)$row['rol'] : null,
            'rutas' => $row['ruta'] ? [(string)$row['ruta']] : [],
            'porcentaje' => (float)$row['porcentaje'],
            'monto_estimado' => (float)$row['monto'],
        ];
    }, $st->fetchAll(PDO::FETCH_ASSOC) ?: []);
}

/** Lee el snapshot histórico; para pagos viejos usa la regla actual como fallback explícito. */
function reparto_resumen_pago(PDO $pdo, int $idOrganizacion, int $idPago): array
{
    $st = $pdo->prepare("\n        SELECT id_pago, id_sistema, monto\n        FROM pagos\n        WHERE id_organizacion=:org AND id_pago=:pago\n        LIMIT 1\n    ");
    $st->execute([':org' => $idOrganizacion, ':pago' => $idPago]);
    $pago = $st->fetch(PDO::FETCH_ASSOC);
    if (!$pago) throw new RuntimeException('Pago inexistente en la organización activa.');

    $snapshot = reparto_snapshot_pago_leer($pdo, $idOrganizacion, $idPago);
    if ($snapshot) {
        $org = reparto_organizacion_config($pdo, $idOrganizacion);
        return [
            'organizacion' => $org,
            'modelo_reparto' => $org['modelo_reparto'],
            'configurado' => true,
            'origen' => 'snapshot_pago',
            'total_porcentaje' => reparto_redondear(array_sum(array_column($snapshot, 'porcentaje'))),
            'monto_base' => reparto_redondear((float)$pago['monto'], 2),
            'regla_directa' => [],
            'items' => $snapshot,
        ];
    }

    $resumen = reparto_resumen_sistema(
        $pdo,
        $idOrganizacion,
        (int)$pago['id_sistema'],
        (float)$pago['monto']
    );
    $resumen['origen'] = 'regla_actual_sin_snapshot';
    return $resumen;
}
