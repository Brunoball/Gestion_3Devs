<?php
// backend/modules/reportes/reportes.php
declare(strict_types=1);

global $pdo;

$op = $_GET['op'] ?? '';

/* =========================
   Helpers JSON
========================= */
if (!function_exists('rep_json_ok')) {
  function rep_json_ok(array $extra = []): void {
    http_response_code(200);
    echo json_encode(array_merge(['exito' => true], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}
if (!function_exists('rep_json_fail')) {
  function rep_json_fail(string $mensaje, array $extra = []): void {
    http_response_code(200);
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
        ]
      ]);
    }

    /* =========================================================
       ✅ AÑOS DISPONIBLES
       Ideal: unir años de pagos + egresos.
       GET /api.php?action=reportes&op=anios
       -> { exito:true, anios:[2026,2025,...] }
    ========================================================= */
    case 'anios': {
      if (rep_req_method() !== 'GET') rep_json_fail('Método no permitido. Se esperaba GET');

      // ✅ Une años de pagos y egresos (sin romper si una tabla está vacía)
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

      // normaliza a int
      $out = [];
      foreach ($anios as $y) {
        $yi = (int)$y;
        if ($yi > 0) $out[] = $yi;
      }

      rep_json_ok(['anios' => $out]);
    }

    // (si después querés) case 'estadisticas': ...

    default:
      rep_json_fail('op no válida en reportes: ' . $op);
  }

} catch (Throwable $e) {
  rep_json_fail('Error en reportes: ' . $e->getMessage());
}
