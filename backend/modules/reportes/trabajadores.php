<?php
// ✅ REEMPLAZAR COMPLETO
// backend/modules/reportes/trabajadores.php
declare(strict_types=1);

global $pdo;

$op = $_GET['op'] ?? '';

if (!function_exists('reptra_json_ok')) {
  function reptra_json_ok(array $extra = []): void {
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['exito' => true], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}
if (!function_exists('reptra_json_fail')) {
  function reptra_json_fail(string $mensaje, array $extra = []): void {
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['exito' => false, 'mensaje' => $mensaje], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}
if (!function_exists('reptra_req_method')) {
  function reptra_req_method(): string {
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
  }
}
if (!function_exists('reptra_int')) {
  function reptra_int(string $key, int $default = 0): int {
    $v = $_GET[$key] ?? null;
    if ($v === null || $v === '') return $default;
    return (int)$v;
  }
}

try {
  if (!($pdo instanceof PDO)) reptra_json_fail('Conexión PDO no disponible.');

  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  if (!in_array($op, ['trabajadores', 'trabajadores_activos'], true)) {
    reptra_json_fail('op no válida en trabajadores: ' . $op);
  }

  if (reptra_req_method() !== 'GET') {
    reptra_json_fail('Método no permitido. Se esperaba GET');
  }

  /* =========================================================
     ✅ NUEVO: LISTA SIMPLE DE TRABAJADORES ACTIVOS
     GET /api.php?action=reportes&op=trabajadores_activos
  ========================================================= */
  if ($op === 'trabajadores_activos') {
    $sql = "
      SELECT
        t.id,
        t.nombre,
        t.apellido,
        t.email,
        t.rol,
        t.alias_pago
      FROM trabajadores t
      WHERE t.activo = 1
      ORDER BY t.apellido ASC, t.nombre ASC
    ";

    $st = $pdo->prepare($sql);
    $st->execute();

    $trabajadores = $st->fetchAll(PDO::FETCH_ASSOC);

    reptra_json_ok([
      'trabajadores' => $trabajadores,
    ]);
  }

  $mes  = reptra_int('mes', 0);
  $anio = reptra_int('anio', 0);

  $sqlSys = "
    SELECT
      p.id_sistema,
      cs.nombre AS sistema_nombre,
      SUM(p.monto) AS total_monto
    FROM pagos p
    JOIN clientes_sistemas cs ON cs.id_sistema = p.id_sistema
    WHERE 1=1
  ";

  $paramsSys = [];

  if ($mes > 0) {
    $sqlSys .= " AND MONTH(p.fecha_pago) = :mes ";
    $paramsSys[':mes'] = $mes;
  }
  if ($anio > 0) {
    $sqlSys .= " AND YEAR(p.fecha_pago) = :anio ";
    $paramsSys[':anio'] = $anio;
  }

  $sqlSys .= "
    GROUP BY p.id_sistema, cs.nombre
    HAVING SUM(p.monto) > 0
    ORDER BY total_monto DESC
  ";

  $stSys = $pdo->prepare($sqlSys);
  $stSys->execute($paramsSys);
  $sistemasPagados = $stSys->fetchAll(PDO::FETCH_ASSOC);

  $sqlEg = "
    SELECT
      e.id_trabajador,
      t.nombre,
      t.apellido,
      t.email,
      t.rol,
      t.alias_pago,
      SUM(e.monto) AS total_egresos
    FROM egresos e
    JOIN trabajadores t ON t.id = e.id_trabajador
    WHERE e.id_trabajador IS NOT NULL
      AND t.activo = 1
  ";

  $paramsEg = [];

  if ($mes > 0) {
    $sqlEg .= " AND MONTH(e.fecha) = :mes ";
    $paramsEg[':mes'] = $mes;
  }
  if ($anio > 0) {
    $sqlEg .= " AND YEAR(e.fecha) = :anio ";
    $paramsEg[':anio'] = $anio;
  }

  $sqlEg .= "
    GROUP BY
      e.id_trabajador,
      t.nombre,
      t.apellido,
      t.email,
      t.rol,
      t.alias_pago
    ORDER BY t.apellido, t.nombre
  ";

  $stEg = $pdo->prepare($sqlEg);
  $stEg->execute($paramsEg);
  $egresosPorTrabajador = $stEg->fetchAll(PDO::FETCH_ASSOC);

  $acc = [];
  $sinAsignar = [];
  $detalleSistemas = [];

  foreach ($egresosPorTrabajador as $eg) {
    $idT = (int)($eg['id_trabajador'] ?? 0);
    if ($idT <= 0) continue;

    if (!isset($acc[$idT])) {
      $acc[$idT] = [
        'id' => $idT,
        'nombre' => (string)($eg['nombre'] ?? ''),
        'apellido' => (string)($eg['apellido'] ?? ''),
        'email' => (string)($eg['email'] ?? ''),
        'rol' => (string)($eg['rol'] ?? ''),
        'alias_pago' => (string)($eg['alias_pago'] ?? ''),
        'sistemas_cobrados' => 0,
        'monto_reembolso' => 0.0,
        'monto_sistemas' => 0.0,
        'monto' => 0.0,
      ];
    }

    $reembolso = (float)($eg['total_egresos'] ?? 0);
    $acc[$idT]['monto_reembolso'] += $reembolso;
    $acc[$idT]['monto'] += $reembolso;
  }

  $totalIngresos = 0.0;
  foreach ($sistemasPagados as $sys) {
    $totalIngresos += (float)($sys['total_monto'] ?? 0);
  }

  $totalEgresosReembolsables = 0.0;
  foreach ($egresosPorTrabajador as $eg) {
    $totalEgresosReembolsables += (float)($eg['total_egresos'] ?? 0);
  }

  $ingresoLimpio = $totalIngresos - $totalEgresosReembolsables;
  if ($ingresoLimpio < 0) $ingresoLimpio = 0.0;

  $sqlTrab = "
    SELECT
      st.id_trabajador,
      t.nombre,
      t.apellido,
      t.email,
      t.rol,
      t.alias_pago
    FROM sistemas_trabajadores st
    JOIN trabajadores t ON t.id = st.id_trabajador
    WHERE st.id_sistema = :id_sistema
      AND t.activo = 1
  ";
  $stTrab = $pdo->prepare($sqlTrab);

  foreach ($sistemasPagados as $sys) {
    $idSistema = (int)($sys['id_sistema'] ?? 0);
    $sistemaNombre = (string)($sys['sistema_nombre'] ?? '');
    $totalMontoSistema = (float)($sys['total_monto'] ?? 0);

    if ($idSistema <= 0 || $totalMontoSistema <= 0) continue;

    $stTrab->execute([':id_sistema' => $idSistema]);
    $trabDelSistema = $stTrab->fetchAll(PDO::FETCH_ASSOC);

    $cantTrab = count($trabDelSistema);

    if ($cantTrab === 0) {
      $sinAsignar[] = [
        'id_sistema' => $idSistema,
        'sistema' => $sistemaNombre,
        'total_monto' => $totalMontoSistema,
        'motivo' => 'Sin trabajadores asignados en sistemas_trabajadores',
      ];
      continue;
    }

    $montoSistemaLimpio = $totalIngresos > 0
      ? ($ingresoLimpio * ($totalMontoSistema / $totalIngresos))
      : 0.0;

    $share = $cantTrab > 0 ? ($montoSistemaLimpio / $cantTrab) : 0.0;

    $detalleSistemas[] = [
      'id_sistema' => $idSistema,
      'sistema' => $sistemaNombre,
      'ingreso_bruto' => round($totalMontoSistema, 2),
      'ingreso_limpio_asignado' => round($montoSistemaLimpio, 2),
      'cantidad_trabajadores' => $cantTrab,
      'share_por_trabajador' => round($share, 2),
    ];

    foreach ($trabDelSistema as $t) {
      $idT = (int)($t['id_trabajador'] ?? 0);
      if ($idT <= 0) continue;

      if (!isset($acc[$idT])) {
        $acc[$idT] = [
          'id' => $idT,
          'nombre' => (string)($t['nombre'] ?? ''),
          'apellido' => (string)($t['apellido'] ?? ''),
          'email' => (string)($t['email'] ?? ''),
          'rol' => (string)($t['rol'] ?? ''),
          'alias_pago' => (string)($t['alias_pago'] ?? ''),
          'sistemas_cobrados' => 0,
          'monto_reembolso' => 0.0,
          'monto_sistemas' => 0.0,
          'monto' => 0.0,
        ];
      }

      $acc[$idT]['monto_sistemas'] += $share;
      $acc[$idT]['monto'] += $share;
      $acc[$idT]['sistemas_cobrados'] = (int)$acc[$idT]['sistemas_cobrados'] + 1;
    }
  }

  $trabajadores = array_values($acc);

  foreach ($trabajadores as &$tr) {
    $tr['monto_reembolso'] = round((float)$tr['monto_reembolso'], 2);
    $tr['monto_sistemas'] = round((float)$tr['monto_sistemas'], 2);
    $tr['monto'] = round((float)$tr['monto'], 2);
  }
  unset($tr);

  usort($trabajadores, function ($a, $b) {
    return ($b['monto'] <=> $a['monto']);
  });

  reptra_json_ok([
    'filtros' => [
      'mes'  => $mes > 0 ? $mes : null,
      'anio' => $anio > 0 ? $anio : null,
    ],
    'resumen' => [
      'total_ingresos' => round($totalIngresos, 2),
      'total_egresos_reembolsables' => round($totalEgresosReembolsables, 2),
      'ingreso_limpio' => round($ingresoLimpio, 2),
    ],
    'trabajadores' => $trabajadores,
    'sistemas_sin_asignar' => $sinAsignar,
    'detalle_sistemas' => $detalleSistemas,
  ]);

} catch (Throwable $e) {
  reptra_json_fail('Error en reportes/trabajadores: ' . $e->getMessage());
}