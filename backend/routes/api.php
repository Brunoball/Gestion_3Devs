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

/**
 * ✅ Fallback de REPORTES:
 * Si tu módulo reportes todavía no devuelve egresos (o no está implementado),
 * este handler lo resuelve SIN crear archivos extra.
 */
function fallback_reportes(PDO $pdo): void
{
  $op = $_GET['op'] ?? '';

  // GET /api.php?action=reportes&op=anios
  if ($op === 'anios') {
    // Años disponibles basados en egresos (podés sumar ingresos/pagos después si querés)
    $stmt = $pdo->query("
      SELECT DISTINCT YEAR(fecha) AS anio
      FROM egresos
      ORDER BY anio DESC
    ");
    $anios = $stmt->fetchAll(PDO::FETCH_COLUMN);

    echo json_encode([
      'exito' => true,
      'anios' => $anios,
    ], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // GET /api.php?action=reportes&op=movimientos&anio=YYYY&mes=ID_MES
  if ($op === 'movimientos') {

    $anio = isset($_GET['anio']) ? (int)$_GET['anio'] : null;
    $mes  = isset($_GET['mes'])  ? (int)$_GET['mes']  : null;

    // 🔸 EGRESOS
    // Basado en tu tabla egresos: id_egreso, concepto, descripcion, monto, fecha, id_medio_pago...
    // Se asume:
    // - tabla "meses" con columnas: id, mes (como usás en action=listas)
    // - tabla "medios_pago" con columnas: id_medio_pago, nombre
    //
    // Si tu tabla de medios se llama distinto, decime el nombre y lo ajusto 1:1.
    $sqlE = "
      SELECT
        e.id_egreso AS id,
        e.fecha     AS fecha,
        e.concepto  AS concepto,
        UPPER(COALESCE(m.mes, '')) AS categoria,
        COALESCE(mp.nombre, '')    AS medio,
        e.monto     AS monto
      FROM egresos e
      LEFT JOIN meses m
        ON m.id = MONTH(e.fecha)
      LEFT JOIN medios_pago mp
        ON mp.id_medio_pago = e.id_medio_pago
      WHERE 1=1
    ";

    $params = [];

    if ($anio) {
      $sqlE .= " AND YEAR(e.fecha) = :anio ";
      $params[':anio'] = $anio;
    }

    if ($mes) {
      $sqlE .= " AND MONTH(e.fecha) = :mes ";
      $params[':mes'] = $mes;
    }

    $sqlE .= " ORDER BY e.fecha DESC, e.id_egreso DESC ";

    $stE = $pdo->prepare($sqlE);
    $stE->execute($params);
    $egresos = $stE->fetchAll(PDO::FETCH_ASSOC);

    // 👇 Para no romper tu React, devolvemos ambos arrays.
    // Tu frontend ya soporta pagosArr desde data.pagos o data.ingresos.
    echo json_encode([
      'exito'   => true,
      'pagos'   => [],       // si todavía no lo implementaste en módulo
      'egresos' => $egresos,
    ], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // op inválido
  echo json_encode([
    'exito'   => false,
    'mensaje' => 'op no válida en reportes: ' . $op
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

try {

  if (function_exists('route_login') && route_login($action)) exit;
  if (function_exists('route_clientes') && route_clientes($action)) exit;
  if (function_exists('route_trabajadores') && route_trabajadores($action)) exit;
  if (function_exists('route_mantenimiento') && route_mantenimiento($action)) exit;

  // ✅ pagos (incluye action=pagos y action=anios_pagos)
  if (function_exists('route_pagos') && route_pagos($action)) exit;

  // ✅ reportes (action=reportes)
  // Si el módulo reportes no respondió (o no está completo), usamos fallback para egresos.
  if ($action === 'reportes') {
    if (function_exists('route_reportes') && route_reportes($action)) {
      exit;
    }
    fallback_reportes($pdo);
    exit;
  }

  // ✅ listas (action=listas)
  if (function_exists('route_listas') && route_listas($action)) exit;

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
