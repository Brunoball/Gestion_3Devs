<?php
// backend/modules/reportes/trabajadores.php
declare(strict_types=1);

global $pdo;

$op = $_GET['op'] ?? '';

/* =========================
   Helpers JSON
========================= */
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

  if ($op !== 'trabajadores') reptra_json_fail('op no válida en trabajadores: ' . $op);
  if (reptra_req_method() !== 'GET') reptra_json_fail('Método no permitido. Se esperaba GET');

  // Filtros que vienen desde Reportes.jsx
  // mes: 1..12 (selección del selector)
  // anio: YYYY
  $mes  = reptra_int('mes', 0);
  $anio = reptra_int('anio', 0);

  /* =========================================================
     1) Sistemas con pagos en el período (usar MES REAL de fecha_pago)
  ========================================================= */
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

  // ✅ FIX: antes era p.id_mes = :mes (si id_mes está mal cargado, rompe)
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

  // Acumulador por trabajador
  $acc = [];

  // Para debug/admin: sistemas con pagos pero sin trabajadores asignados
  $sinAsignar = [];

  /* =========================================================
     2) Por cada sistema con pagos:
        - buscar trabajadores asignados
        - dividir total del sistema por cantidad de trabajadores
        - acumular en cada trabajador
  ========================================================= */
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
    $totalMonto = (float)($sys['total_monto'] ?? 0);

    if ($idSistema <= 0 || $totalMonto <= 0) continue;

    $stTrab->execute([':id_sistema' => $idSistema]);
    $trabDelSistema = $stTrab->fetchAll(PDO::FETCH_ASSOC);

    $cantTrab = count($trabDelSistema);

    if ($cantTrab === 0) {
      $sinAsignar[] = [
        'id_sistema' => $idSistema,
        'sistema' => $sistemaNombre,
        'total_monto' => $totalMonto,
        'motivo' => 'Sin trabajadores asignados en sistemas_trabajadores',
      ];
      continue;
    }

    $share = $totalMonto / $cantTrab;

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
          'monto' => 0.0,
        ];
      }

      $acc[$idT]['monto'] = (float)$acc[$idT]['monto'] + (float)$share;
      $acc[$idT]['sistemas_cobrados'] = (int)$acc[$idT]['sistemas_cobrados'] + 1;
    }
  }

  $trabajadores = array_values($acc);

  usort($trabajadores, function ($a, $b) {
    return ($b['monto'] <=> $a['monto']);
  });

  reptra_json_ok([
    'filtros' => [
      'mes'  => $mes > 0 ? $mes : null,
      'anio' => $anio > 0 ? $anio : null,
    ],
    'trabajadores' => $trabajadores,
    'sistemas_sin_asignar' => $sinAsignar,
  ]);

} catch (Throwable $e) {
  reptra_json_fail('Error en reportes/trabajadores: ' . $e->getMessage());
}
