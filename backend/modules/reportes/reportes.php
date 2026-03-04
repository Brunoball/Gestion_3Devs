<?php
// ✅ REEMPLAZAR COMPLETO
// backend/modules/reportes/reportes.php
declare(strict_types=1);

global $pdo;

$op = $_GET['op'] ?? '';

/* =========================
   Headers + Helpers JSON
========================= */
if (!headers_sent()) {
  header('Content-Type: application/json; charset=utf-8');
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

if (!function_exists('rep_json_ok')) {
  function rep_json_ok(array $extra = []): void {
    http_response_code(200);
    if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['exito' => true], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('rep_json_fail')) {
  function rep_json_fail(string $mensaje, array $extra = []): void {
    http_response_code(200);
    if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['exito' => false, 'mensaje' => $mensaje], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('rep_req_method')) {
  function rep_req_method(): string {
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
  }
}

try {
  if (!($pdo instanceof PDO)) rep_json_fail('Conexión PDO no disponible.');

  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  if ($op === '') rep_json_fail('Falta parámetro op en reportes');

  switch ($op) {

    case 'ping': {
      rep_json_ok([
        'modulo' => 'reportes',
        'op' => 'ping',
        'ts' => date('c'),
      ]);
    }

    case 'lista': {
      rep_json_ok([
        'reportes' => [
          ['id' => 'movimientos', 'nombre' => 'Movimientos (Pagos + Egresos)', 'metodo' => 'GET'],
          ['id' => 'anios', 'nombre' => 'Años disponibles', 'metodo' => 'GET'],
          ['id' => 'crear_egreso', 'nombre' => 'Crear egreso', 'metodo' => 'POST'],
          ['id' => 'editar_movimiento', 'nombre' => 'Editar movimiento', 'metodo' => 'POST'],
          ['id' => 'eliminar_egreso', 'nombre' => 'Eliminar egreso', 'metodo' => 'POST'],
          ['id' => 'pago_comprobante', 'nombre' => 'Subir/eliminar comprobante de pago', 'metodo' => 'POST'],
        ]
      ]);
    }

    /* =========================================================
       ✅ AÑOS DISPONIBLES
       GET /api.php?action=reportes&op=anios
    ========================================================= */
    case 'anios': {
      if (rep_req_method() !== 'GET') rep_json_fail('Método no permitido. Se esperaba GET');

      $sql = "
        SELECT anio FROM (
          SELECT DISTINCT YEAR(p.fecha_pago) AS anio
          FROM pagos p
          WHERE p.fecha_pago IS NOT NULL

          UNION

          SELECT DISTINCT YEAR(e.fecha) AS anio
          FROM egresos e
          WHERE e.fecha IS NOT NULL
        ) t
        WHERE anio IS NOT NULL
        ORDER BY anio DESC
      ";

      $st = $pdo->prepare($sql);
      $st->execute();
      $anios = $st->fetchAll(PDO::FETCH_COLUMN);

      $out = [];
      foreach ($anios as $y) {
        $yi = (int)$y;
        if ($yi > 0) $out[] = $yi;
      }

      rep_json_ok(['anios' => $out]);
    }

    /* =========================================================
       ✅ MOVIMIENTOS (Pagos + Egresos)
       GET /api.php?action=reportes&op=movimientos&anio=YYYY&mes=MM
       -> lo resuelve registro.php
    ========================================================= */
    case 'movimientos': {
      require __DIR__ . '/registro.php'; // ✅ FIX: era registros.php
      exit;
    }

    /* =========================================================
       ✅ CREAR EGRESO
       POST /api.php?action=reportes&op=crear_egreso
       -> lo resuelve registro.php
    ========================================================= */
    case 'crear_egreso': {
      require __DIR__ . '/registro.php'; // ✅ FIX: era registros.php
      exit;
    }

    /* =========================================================
       ✅ EDITAR MOVIMIENTO
       POST /api.php?action=reportes&op=editar_movimiento
       -> lo resuelve registro.php
    ========================================================= */
    case 'editar_movimiento': {
      require __DIR__ . '/registro.php';
      exit;
    }

    /* =========================================================
       ✅ ELIMINAR EGRESO
       POST /api.php?action=reportes&op=eliminar_egreso
       -> lo resuelve registro.php
    ========================================================= */
    case 'eliminar_egreso': {
      require __DIR__ . '/registro.php';
      exit;
    }

    /* =========================================================
       ✅ COMPROBANTE DE PAGO (subir/eliminar)
       POST multipart /api.php?action=reportes&op=pago_comprobante
       -> lo resuelve registro.php
    ========================================================= */
    case 'pago_comprobante': {
      require __DIR__ . '/registro.php';
      exit;
    }

    default:
      rep_json_fail('op no válida en reportes: ' . $op);
  }

} catch (Throwable $e) {
  rep_json_fail('Error en reportes: ' . $e->getMessage());
}