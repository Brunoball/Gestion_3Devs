<?php
// backend/modules/mantenimiento/mantenimiento.php
declare(strict_types=1);

global $pdo;

$op = $_GET['op'] ?? '';

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

if (!isset($pdo) || !($pdo instanceof PDO)) {
  json_fail('DB no inicializada ($pdo). Revisá config/db.php');
}

switch ($op) {

  // ✅ Ejemplo: GET /?action=mantenimiento&op=ping
  case 'ping':
    json_ok(['modulo' => 'mantenimiento', 'ok' => true]);
    break;

  // ✅ Endpoint sugerido para tu React:
  // GET /routes/api.php?action=mantenimiento&op=planes
  case 'planes':
    // Para que sea "funcional" desde ya:
    // - si existe tabla planes_mantenimiento -> devuelve lista
    // - si no existe -> devuelve vacío, sin romper
    try {
      $stmt = $pdo->query("SELECT id, nombre, descripcion, monto, activo, fecha_creacion
                           FROM planes_mantenimiento
                           ORDER BY id DESC");
      $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
      json_ok(['planes' => $rows]);
    } catch (Throwable $e) {
      // Si el amigo todavía no creó la tabla o está en progreso:
      json_ok(['planes' => [], 'nota' => 'tabla no disponible o error: ' . $e->getMessage()]);
    }
    break;

  // ✅ placeholders para CRUD a futuro
  case 'crear_plan':
  case 'editar_plan':
  case 'eliminar_plan':
    json_fail("OP pendiente de implementar: $op", [
      'modulo' => 'mantenimiento',
      'op' => $op
    ]);
    break;

  default:
    json_fail('OP no válida en mantenimiento', [
      'modulo' => 'mantenimiento',
      'op_recibida' => $op
    ]);
}
