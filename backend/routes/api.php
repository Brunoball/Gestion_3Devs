<?php
// backend/routes/api.php
declare(strict_types=1);

// --- CORS mínimo y JSON ---
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: $origin");
header("Vary: Origin");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(200);
  echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
  exit;
}

date_default_timezone_set('America/Argentina/Cordoba');
mb_internal_encoding('UTF-8');

$action = $_GET['action'] ?? '';

// ✅ DB UNA SOLA VEZ (define $pdo)
require_once __DIR__ . '/../config/db.php';

// 👉 Routers de módulos
require_once __DIR__ . '/../modules/login/route.php';
require_once __DIR__ . '/../modules/clientes/route.php';
require_once __DIR__ . '/../modules/trabajadores/route.php';
require_once __DIR__ . '/../modules/mantenimiento/route.php';
require_once __DIR__ . '/../modules/pagos/route.php';
require_once __DIR__ . '/../modules/reportes/route.php';

/**
 * ✅ LISTAS (OJO: tu carpeta real es "Global" con G mayúscula)
 * Ruta real del archivo:
 *   backend/modules/Global/obtener_listas.php
 *
 * Entonces el router debe estar en:
 *   backend/modules/Global/route.php
 */
require_once __DIR__ . '/../modules/Global/route.php';

try {

  if (route_login($action)) exit;
  if (route_clientes($action)) exit;
  if (route_trabajadores($action)) exit;
  if (route_mantenimiento($action)) exit;

  // ✅ pagos (incluye action=pagos y action=anios_pagos)
  if (route_pagos($action)) exit;

  // ✅ reportes (action=reportes)
  if (route_reportes($action)) exit;

  // ✅ listas (action=listas) -> backend/modules/Global/obtener_listas.php
  // (El router lo llamamos route_listas para que coincida con action=listas)
  if (route_listas($action)) exit;

  http_response_code(200);
  echo json_encode([
    'exito'   => false,
    'mensaje' => 'Acción no válida: ' . $action
  ], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  http_response_code(200);
  echo json_encode([
    'exito'   => false,
    'mensaje' => 'Error en router: ' . $e->getMessage()
  ], JSON_UNESCAPED_UNICODE);
  exit;
}
