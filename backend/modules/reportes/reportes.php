<?php
// backend/modules/reportes/reportes.php
declare(strict_types=1);

global $pdo;

/**
 * IMPORTANTE:
 * - El router (route.php) solo incluye este archivo.
 * - Tu equipo SOLO debería tocar este archivo: agregar ops / queries / formatos.
 */

$op = $_GET['op'] ?? '';

/* =========================
   Helpers JSON (estándar)
========================= */
function json_ok(array $extra = []): void {
  http_response_code(200);
  echo json_encode(array_merge(['exito' => true], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

function json_fail(string $mensaje, array $extra = []): void {
  http_response_code(200);
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $mensaje], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

/* =========================
   Helpers request
========================= */
function req_method(): string {
  return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function read_json_body(): array {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function int_param(string $key, int $default = 0): int {
  $v = $_GET[$key] ?? null;
  if ($v === null || $v === '') return $default;
  return (int)$v;
}

function str_param(string $key, string $default = ''): string {
  $v = $_GET[$key] ?? null;
  if ($v === null) return $default;
  return trim((string)$v);
}

/* =========================
   Dispatch de operaciones
========================= */
try {
  if ($op === '') {
    json_fail('Falta parámetro op en reportes');
  }

  switch ($op) {

    /* =========================================================
       ✅ EJEMPLO 1: ping
       GET /api.php?action=reportes&op=ping
    ========================================================= */
    case 'ping': {
      json_ok([
        'modulo' => 'reportes',
        'op' => 'ping',
        'ts' => date('c'),
      ]);
    }

    /* =========================================================
       ✅ EJEMPLO 2: catálogo de reportes disponibles
       GET /api.php?action=reportes&op=lista
    ========================================================= */
    case 'lista': {
      json_ok([
        'reportes' => [
          // Tu backend puede mantener esta lista acá y que el front la lea
          // ['id' => 'pagos_resumen', 'nombre' => 'Resumen de pagos', 'metodo' => 'GET'],
        ]
      ]);
    }

    /* =========================================================
       ✅ PLANTILLA: reporte tipo tabla (GET)
       GET /api.php?action=reportes&op=xxx&desde=2026-01-01&hasta=2026-01-31
       - Armá tu query y devolvé rows
    ========================================================= */
    case 'reporte_ejemplo_get': {
      $method = req_method();
      if ($method !== 'GET') json_fail('Método no permitido. Se esperaba GET');

      $desde = str_param('desde', '');
      $hasta = str_param('hasta', '');

      // Validaciones mínimas (ajustá según necesites)
      if ($desde === '' || $hasta === '') {
        json_fail('Parámetros requeridos: desde, hasta (YYYY-MM-DD)');
      }

      // ✅ Ejemplo de query (reemplazar por una real)
      // $stmt = $pdo->prepare("SELECT ... WHERE fecha BETWEEN ? AND ? ORDER BY fecha ASC");
      // $stmt->execute([$desde, $hasta]);
      // $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

      $rows = []; // placeholder

      json_ok([
        'filtros' => ['desde' => $desde, 'hasta' => $hasta],
        'rows' => $rows,
      ]);
    }

    /* =========================================================
       ✅ PLANTILLA: reporte con body JSON (POST)
       POST /api.php?action=reportes&op=xxx
       Body: { ... }
    ========================================================= */
    case 'reporte_ejemplo_post': {
      $method = req_method();
      if ($method !== 'POST') json_fail('Método no permitido. Se esperaba POST');

      $body = read_json_body();

      // ejemplo de lectura
      $anio = (int)($body['anio'] ?? 0);
      if ($anio <= 0) json_fail('Campo requerido: anio');

      // ✅ Acá tu equipo arma la query real
      // $stmt = $pdo->prepare("SELECT ... WHERE YEAR(fecha)=?");
      // $stmt->execute([$anio]);
      // $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

      $rows = []; // placeholder

      json_ok([
        'filtros' => ['anio' => $anio],
        'rows' => $rows,
      ]);
    }

    /* =========================================================
       ❌ op desconocida
    ========================================================= */
    default: {
      json_fail('op no válida en reportes: ' . $op);
    }
  }

} catch (Throwable $e) {
  json_fail('Error en reportes: ' . $e->getMessage());
}
