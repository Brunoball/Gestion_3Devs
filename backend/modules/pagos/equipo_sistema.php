<?php
// backend/modules/pagos/equipo_sistema.php
declare(strict_types=1);

/**
 * Resumen de distribución de un sistema puntual.
 * Calcula siempre con la configuración porcentual vigente.
 */
function pagos_equipo_sistema(): void
{
  global $pdo;

  $orgId = pagos_org_id();
  $idSistema = isset($_GET['id_sistema']) && is_numeric($_GET['id_sistema'])
    ? (int)$_GET['id_sistema'] : 0;
  if ($idSistema <= 0) json_error('Falta id_sistema');

  $stSys = $pdo->prepare("\n    SELECT cs.id_sistema, cs.nombre AS sistema_nombre, cs.monto_mensual,\n           c.id_cliente, c.nombre AS cliente_nombre\n    FROM clientes_sistemas cs\n    INNER JOIN clientes c\n      ON c.id_organizacion = cs.id_organizacion\n     AND c.id_cliente = cs.id_cliente\n    WHERE cs.id_organizacion = :org\n      AND cs.id_sistema = :sistema\n    LIMIT 1\n  ");
  $stSys->execute([':org' => $orgId, ':sistema' => $idSistema]);
  $sistema = $stSys->fetch(PDO::FETCH_ASSOC);
  if (!$sistema) json_error('Sistema inexistente en la organización activa.');

  $anio = isset($_GET['anio']) && is_numeric($_GET['anio']) ? (int)$_GET['anio'] : 0;
  $mesParam = isset($_GET['mes']) ? trim((string)$_GET['mes']) : '';
  $pago = null;

  if ($anio >= 2000 && $anio <= 2100 && $mesParam !== '') {
    $idMes = resolver_id_mes($pdo, $mesParam);
    $stP = $pdo->prepare("\n      SELECT p.id_pago, p.id_sistema, p.id_mes, p.anio_periodo,\n             m.mes AS mes_nombre, p.monto, p.fecha_pago,\n             p.id_medio_pago, mp.nombre AS medio_pago\n      FROM pagos p\n      INNER JOIN meses m ON m.id_mes = p.id_mes\n      INNER JOIN medios_pago mp\n        ON mp.id_organizacion = p.id_organizacion\n       AND mp.id_medio_pago = p.id_medio_pago\n      WHERE p.id_organizacion = :org\n        AND p.id_sistema = :sistema\n        AND p.id_mes = :mes\n        AND p.anio_periodo = :anio\n      ORDER BY p.fecha_pago DESC, p.id_pago DESC\n      LIMIT 1\n    ");
    $stP->execute([':org'=>$orgId, ':sistema'=>$idSistema, ':mes'=>$idMes, ':anio'=>$anio]);
    $row = $stP->fetch(PDO::FETCH_ASSOC);
    if ($row) {
      $pago = [
        'id_pago'=>(int)$row['id_pago'], 'id_sistema'=>(int)$row['id_sistema'],
        'id_mes'=>(int)$row['id_mes'], 'mes'=>(string)$row['mes_nombre'],
        'anio'=>(int)$row['anio_periodo'], 'monto'=>(float)$row['monto'],
        'fecha_pago'=>(string)$row['fecha_pago'], 'id_medio_pago'=>(int)$row['id_medio_pago'],
        'medio_pago'=>(string)$row['medio_pago'],
      ];
    }
  }

  try {
    $reparto = $pago
      ? reparto_resumen_pago($pdo, $orgId, (int)$pago['id_pago'])
      : reparto_resumen_sistema($pdo, $orgId, $idSistema, (float)$sistema['monto_mensual']);
    if (!$pago) $reparto['origen'] = 'estimacion_servicio';
  } catch (Throwable $e) {
    json_error('No se pudo resolver la distribución contable.', ['error' => $e->getMessage()]);
  }

  json_ok([
    'exito'=>true,
    'id_sistema'=>$idSistema,
    'sistema'=>[
      'id_sistema'=>(int)$sistema['id_sistema'], 'nombre'=>(string)$sistema['sistema_nombre'],
      'id_cliente'=>(int)$sistema['id_cliente'], 'cliente'=>(string)$sistema['cliente_nombre'],
      'monto_mensual'=>(float)$sistema['monto_mensual'],
    ],
    'modelo_reparto'=>$reparto['modelo_reparto'],
    'reparto'=>$reparto,
    'trabajadores'=>$reparto['items'],
    'pago'=>$pago,
  ]);
}

/**
 * Distribución consolidada de todos los sistemas de un cliente para un período.
 * - Si hay pago, usa su monto real y la regla vigente.
 * - Si no hay pago, muestra una estimación con el monto mensual acordado.
 */
function pagos_distribucion_cliente(): void
{
  global $pdo;

  $orgId = pagos_org_id();
  $idCliente = isset($_GET['id_cliente']) && is_numeric($_GET['id_cliente'])
    ? (int)$_GET['id_cliente'] : 0;
  $anio = isset($_GET['anio']) && is_numeric($_GET['anio']) ? (int)$_GET['anio'] : 0;
  $idMes = isset($_GET['id_mes']) && is_numeric($_GET['id_mes'])
    ? (int)$_GET['id_mes'] : 0;

  if ($idCliente <= 0) json_error('Falta id_cliente válido.');
  if ($anio < 2000 || $anio > 2100) json_error('Año inválido.');
  if ($idMes < 1 || $idMes > 12) json_error('Mes inválido.');

  $stCliente = $pdo->prepare('SELECT id_cliente, nombre FROM clientes WHERE id_organizacion=:org AND id_cliente=:cliente AND activo=1 LIMIT 1');
  $stCliente->execute([':org'=>$orgId, ':cliente'=>$idCliente]);
  $cliente = $stCliente->fetch(PDO::FETCH_ASSOC);
  if (!$cliente) json_error('Cliente inexistente en la entidad activa.');

  $periodDate = new DateTime(sprintf('%04d-%02d-01', $anio, $idMes));
  $periodEnd = $periodDate->modify('last day of this month')->format('Y-m-d');
  $st = $pdo->prepare("\n    SELECT cs.id_sistema, cs.nombre, cs.descripcion, cs.monto_mensual, cs.estado,\n           p.id_pago, p.monto AS monto_pagado, p.fecha_pago, mp.nombre AS medio_pago\n    FROM clientes_sistemas cs\n    LEFT JOIN pagos p\n      ON p.id_organizacion = cs.id_organizacion\n     AND p.id_sistema = cs.id_sistema\n     AND p.anio_periodo = :anio\n     AND p.id_mes = :mes\n    LEFT JOIN medios_pago mp\n      ON mp.id_organizacion = p.id_organizacion\n     AND mp.id_medio_pago = p.id_medio_pago\n    WHERE cs.id_organizacion = :org\n      AND cs.id_cliente = :cliente\n      AND cs.estado <> 'finalizado'\n      AND COALESCE(cs.fecha_inicio, DATE(cs.created_at)) <= :period_end\n    ORDER BY cs.nombre\n  ");
  $st->execute([
    ':anio'=>$anio, ':mes'=>$idMes, ':org'=>$orgId,
    ':cliente'=>$idCliente, ':period_end'=>$periodEnd,
  ]);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $sistemas = [];
  $aggregate = [];
  $montoTotal = 0.0;
  $pagados = 0;
  $estimados = 0;
  $configurado = true;

  foreach ($rows as $row) {
    $idSistema = (int)$row['id_sistema'];
    $idPago = $row['id_pago'] !== null ? (int)$row['id_pago'] : 0;
    $montoBase = $idPago > 0 ? (float)$row['monto_pagado'] : (float)$row['monto_mensual'];

    try {
      $resumen = $idPago > 0
        ? reparto_resumen_pago($pdo, $orgId, $idPago)
        : reparto_resumen_sistema($pdo, $orgId, $idSistema, $montoBase);
      $resumen['origen'] = $idPago > 0 ? 'regla_vigente' : 'estimacion_servicio';
    } catch (Throwable $e) {
      $resumen = [
        'configurado'=>false, 'total_porcentaje'=>0, 'monto_base'=>$montoBase,
        'modelo_reparto'=>'', 'origen'=>'error', 'regla_directa'=>[], 'items'=>[],
        'error'=>$e->getMessage(),
      ];
    }

    if (!$resumen['configurado'] || abs((float)$resumen['total_porcentaje'] - 100.0) > 0.0001) {
      $configurado = false;
    }

    foreach ($resumen['items'] as $item) {
      $key = $item['tipo_beneficiario'] === 'trabajador'
        ? 't:' . (int)($item['id_trabajador'] ?? 0)
        : 'o:' . (int)($item['id_organizacion_beneficiaria'] ?? 0);
      if (!isset($aggregate[$key])) {
        $aggregate[$key] = $item;
        $aggregate[$key]['monto_estimado'] = 0.0;
        $aggregate[$key]['porcentaje_ponderado_numerador'] = 0.0;
        $aggregate[$key]['rutas'] = [];
      }
      $aggregate[$key]['monto_estimado'] += (float)($item['monto_estimado'] ?? 0);
      $aggregate[$key]['porcentaje_ponderado_numerador'] += $montoBase * (float)($item['porcentaje'] ?? 0);
      foreach (($item['rutas'] ?? []) as $ruta) $aggregate[$key]['rutas'][] = $ruta;
    }

    $montoTotal += $montoBase;
    if ($idPago > 0) $pagados++; else $estimados++;
    $sistemas[] = [
      'id_sistema'=>$idSistema,
      'nombre'=>(string)$row['nombre'],
      'descripcion'=>$row['descripcion'] !== null ? (string)$row['descripcion'] : null,
      'estado'=>(string)$row['estado'],
      'monto_base'=>round($montoBase, 2),
      'pagado'=>$idPago > 0,
      'id_pago'=>$idPago > 0 ? $idPago : null,
      'fecha_pago'=>$row['fecha_pago'] !== null ? (string)$row['fecha_pago'] : null,
      'medio_pago'=>$row['medio_pago'] !== null ? (string)$row['medio_pago'] : null,
      'origen'=>$resumen['origen'],
      'configurado'=>(bool)$resumen['configurado'],
      'items'=>$resumen['items'],
    ];
  }

  $itemsFinales = [];
  foreach ($aggregate as $item) {
    $item['monto_estimado'] = round((float)$item['monto_estimado'], 2);
    $item['porcentaje'] = $montoTotal > 0
      ? round((float)$item['porcentaje_ponderado_numerador'] / $montoTotal, 4)
      : 0.0;
    unset($item['porcentaje_ponderado_numerador']);
    $item['rutas'] = array_values(array_unique($item['rutas']));
    $itemsFinales[] = $item;
  }
  usort($itemsFinales, static fn(array $a, array $b): int => strcmp(
    (string)($a['beneficiario_nombre'] ?? ''),
    (string)($b['beneficiario_nombre'] ?? '')
  ));

  $orgConfig = reparto_organizacion_config($pdo, $orgId);
  $reglaDirecta = $orgConfig['modelo_reparto'] === 'por_entidad'
    ? reparto_aplicar_montos_exactos(reparto_items_organizacion($pdo, $orgId), $montoTotal)
    : [];

  json_ok([
    'exito'=>true,
    'cliente'=>['id_cliente'=>(int)$cliente['id_cliente'], 'nombre'=>(string)$cliente['nombre']],
    'anio'=>$anio,
    'id_mes'=>$idMes,
    'organizacion'=>$orgConfig,
    'modelo_reparto'=>$orgConfig['modelo_reparto'],
    'configurado'=>$configurado && count($rows) > 0,
    'monto_total'=>round($montoTotal, 2),
    'estado_periodo'=>$pagados > 0 && $estimados === 0 ? 'pagado' : ($pagados > 0 ? 'mixto' : 'estimado'),
    'sistemas_pagados'=>$pagados,
    'sistemas_estimados'=>$estimados,
    'regla_directa'=>$reglaDirecta,
    'items'=>$itemsFinales,
    'sistemas'=>$sistemas,
  ]);
}
