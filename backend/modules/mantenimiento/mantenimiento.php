<?php
// backend/modules/mantenimiento/mantenimiento.php
declare(strict_types=1);

global $pdo;

$op = $_GET['op'] ?? '';

/* =========================
   Helpers JSON
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

/**
 * Lee body JSON (React fetch) y mergea con $_POST.
 * - Si viene JSON -> lo usa
 * - Si viene form-data/x-www-form-urlencoded -> usa $_POST
 */
function body_params(): array {
  $raw = file_get_contents('php://input');
  $json = [];
  if (is_string($raw) && trim($raw) !== '') {
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) $json = $decoded;
  }
  // prioridad a JSON, pero mergea por si mandan query/body mezclado
  return array_merge($_POST ?? [], $json);
}

function to_int01($v, int $default = 1): int {
  if ($v === null || $v === '') return $default;
  $n = (int)$v;
  return ($n === 1) ? 1 : 0;
}

function sanitize_str($v, int $maxLen = 255): string {
  $s = trim((string)$v);
  if (mb_strlen($s) > $maxLen) $s = mb_substr($s, 0, $maxLen);
  return $s;
}

function parse_monto($v): float {
  // acepta "123.45" o "123,45"
  $s = str_replace(',', '.', trim((string)$v));
  if ($s === '' || !is_numeric($s)) return -1;
  return (float)$s;
}

function is_dup_key(Throwable $e): bool {
  // MySQL: SQLSTATE 23000 para key duplicada
  // driverInfo[1] suele ser 1062
  if (!($e instanceof PDOException)) return false;
  $sqlState = $e->getCode();
  return ($sqlState === '23000');
}

/* =========================
   Guardas básicas
========================= */
if (!isset($pdo) || !($pdo instanceof PDO)) {
  json_fail('DB no inicializada ($pdo). Revisá config/db.php');
}

/* =========================
   Router ops
========================= */
switch ($op) {

  /* ========= Ping ========= */
  case 'ping':
    json_ok(['modulo' => 'mantenimiento', 'ok' => true]);
    break;

  /* =========================================================
     PLANES (tabla: planes_mantenimiento)
     Campos: id, nombre(UNIQUE), descripcion(NULL), monto, activo, fecha_creacion
  ========================================================= */

  // LISTAR PLANES
  // GET /routes/api.php?action=mantenimiento&op=planes&ver_inactivos=1
  case 'planes': {
    $verInactivos = to_int01($_GET['ver_inactivos'] ?? 0, 0);

    $sql = "SELECT id, nombre, descripcion, monto, activo, fecha_creacion
            FROM planes_mantenimiento
            " . ($verInactivos ? "" : "WHERE activo = 1") . "
            ORDER BY id DESC";

    try {
      $stmt = $pdo->prepare($sql);
      $stmt->execute();
      $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
      json_ok(['planes' => $rows]);
    } catch (Throwable $e) {
      json_fail('Error listando planes', ['detalle' => $e->getMessage()]);
    }
    break;
  }

  // OBTENER 1 PLAN
  // GET /routes/api.php?action=mantenimiento&op=plan_get&id=3
  case 'plan_get': {
    $id = (int)($_GET['id'] ?? 0);
    if ($id <= 0) json_fail('ID inválido');

    try {
      $stmt = $pdo->prepare("SELECT id, nombre, descripcion, monto, activo, fecha_creacion
                             FROM planes_mantenimiento
                             WHERE id = :id
                             LIMIT 1");
      $stmt->execute([':id' => $id]);
      $row = $stmt->fetch(PDO::FETCH_ASSOC);
      if (!$row) json_fail('Plan no encontrado');
      json_ok(['plan' => $row]);
    } catch (Throwable $e) {
      json_fail('Error obteniendo plan', ['detalle' => $e->getMessage()]);
    }
    break;
  }

  // CREAR PLAN
  // POST /routes/api.php?action=mantenimiento&op=crear_plan
  // body JSON: { "nombre":"PLAN A", "descripcion":"...", "monto": 15000, "activo":1 }
  case 'crear_plan': {
    $p = body_params();

    $nombre = sanitize_str($p['nombre'] ?? '', 80);
    $descripcion = isset($p['descripcion']) ? sanitize_str($p['descripcion'], 255) : null;
    $monto = parse_monto($p['monto'] ?? '');
    $activo = to_int01($p['activo'] ?? 1, 1);

    if ($nombre === '') json_fail('El nombre es obligatorio');
    if ($monto < 0) json_fail('El monto es inválido');

    try {
      $stmt = $pdo->prepare("INSERT INTO planes_mantenimiento (nombre, descripcion, monto, activo)
                             VALUES (:nombre, :descripcion, :monto, :activo)");
      $stmt->execute([
        ':nombre' => $nombre,
        ':descripcion' => ($descripcion === '' ? null : $descripcion),
        ':monto' => $monto,
        ':activo' => $activo,
      ]);

      json_ok([
        'mensaje' => 'Plan creado',
        'id' => (int)$pdo->lastInsertId(),
      ]);
    } catch (Throwable $e) {
      if (is_dup_key($e)) json_fail('Ya existe un plan con ese nombre');
      json_fail('Error creando plan', ['detalle' => $e->getMessage()]);
    }
    break;
  }

  // EDITAR PLAN
  // POST /routes/api.php?action=mantenimiento&op=editar_plan
  // body JSON: { "id": 3, "nombre":"PLAN B", "descripcion":"...", "monto": 20000, "activo":1 }
  case 'editar_plan': {
    $p = body_params();

    $id = (int)($p['id'] ?? 0);
    if ($id <= 0) json_fail('ID inválido');

    $nombre = sanitize_str($p['nombre'] ?? '', 80);
    $descripcion = array_key_exists('descripcion', $p) ? sanitize_str($p['descripcion'], 255) : null;
    $monto = array_key_exists('monto', $p) ? parse_monto($p['monto']) : null;
    $activo = array_key_exists('activo', $p) ? to_int01($p['activo'], 1) : null;

    if ($nombre === '') json_fail('El nombre es obligatorio');
    if ($monto !== null && $monto < 0) json_fail('El monto es inválido');

    try {
      // aseguramos que exista
      $chk = $pdo->prepare("SELECT id FROM planes_mantenimiento WHERE id = :id LIMIT 1");
      $chk->execute([':id' => $id]);
      if (!$chk->fetchColumn()) json_fail('Plan no encontrado');

      $stmt = $pdo->prepare("UPDATE planes_mantenimiento
                             SET nombre = :nombre,
                                 descripcion = :descripcion,
                                 monto = :monto,
                                 activo = :activo
                             WHERE id = :id");
      $stmt->execute([
        ':id' => $id,
        ':nombre' => $nombre,
        ':descripcion' => ($descripcion === '' ? null : $descripcion),
        ':monto' => ($monto ?? 0),      // si querés “parcial”, decime y te lo hago por campos
        ':activo' => ($activo ?? 1),
      ]);

      json_ok(['mensaje' => 'Plan actualizado']);
    } catch (Throwable $e) {
      if (is_dup_key($e)) json_fail('Ya existe un plan con ese nombre');
      json_fail('Error editando plan', ['detalle' => $e->getMessage()]);
    }
    break;
  }

  // ELIMINAR PLAN (soft delete por activo=0)
  // POST /routes/api.php?action=mantenimiento&op=eliminar_plan
  // body JSON: { "id": 3, "hard": 0 }
  case 'eliminar_plan': {
    $p = body_params();
    $id = (int)($p['id'] ?? 0);
    if ($id <= 0) json_fail('ID inválido');

    $hard = to_int01($p['hard'] ?? 0, 0);

    try {
      if ($hard === 1) {
        $stmt = $pdo->prepare("DELETE FROM planes_mantenimiento WHERE id = :id");
        $stmt->execute([':id' => $id]);
        if ($stmt->rowCount() === 0) json_fail('Plan no encontrado');
        json_ok(['mensaje' => 'Plan eliminado (hard)']);
      } else {
        $stmt = $pdo->prepare("UPDATE planes_mantenimiento SET activo = 0 WHERE id = :id");
        $stmt->execute([':id' => $id]);
        if ($stmt->rowCount() === 0) json_fail('Plan no encontrado');
        json_ok(['mensaje' => 'Plan eliminado (baja lógica)']);
      }
    } catch (Throwable $e) {
      json_fail('Error eliminando plan', ['detalle' => $e->getMessage()]);
    }
    break;
  }


  /* =========================================================
     CLIENTES (tabla: clientes)
     Campos: id_cliente, nombre(UNIQUE), notas(NULL), activo, created_at, updated_at
  ========================================================= */

  // LISTAR CLIENTES
  // GET /routes/api.php?action=mantenimiento&op=clientes&ver_inactivos=1
  case 'clientes': {
    $verInactivos = to_int01($_GET['ver_inactivos'] ?? 0, 0);

    $sql = "SELECT id_cliente, nombre, notas, activo, created_at, updated_at
            FROM clientes
            " . ($verInactivos ? "" : "WHERE activo = 1") . "
            ORDER BY id_cliente DESC";

    try {
      $stmt = $pdo->prepare($sql);
      $stmt->execute();
      $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
      json_ok(['clientes' => $rows]);
    } catch (Throwable $e) {
      json_fail('Error listando clientes', ['detalle' => $e->getMessage()]);
    }
    break;
  }

  // OBTENER 1 CLIENTE
  // GET /routes/api.php?action=mantenimiento&op=cliente_get&id_cliente=5
  case 'cliente_get': {
    $id = (int)($_GET['id_cliente'] ?? 0);
    if ($id <= 0) json_fail('ID inválido');

    try {
      $stmt = $pdo->prepare("SELECT id_cliente, nombre, notas, activo, created_at, updated_at
                             FROM clientes
                             WHERE id_cliente = :id
                             LIMIT 1");
      $stmt->execute([':id' => $id]);
      $row = $stmt->fetch(PDO::FETCH_ASSOC);
      if (!$row) json_fail('Cliente no encontrado');
      json_ok(['cliente' => $row]);
    } catch (Throwable $e) {
      json_fail('Error obteniendo cliente', ['detalle' => $e->getMessage()]);
    }
    break;
  }

  // CREAR CLIENTE
  // POST /routes/api.php?action=mantenimiento&op=crear_cliente
  // body JSON: { "nombre":"ACME", "notas":"...", "activo":1 }
  case 'crear_cliente': {
    $p = body_params();

    $nombre = sanitize_str($p['nombre'] ?? '', 120);
    $notas = isset($p['notas']) ? trim((string)$p['notas']) : null;
    $activo = to_int01($p['activo'] ?? 1, 1);

    if ($nombre === '') json_fail('El nombre es obligatorio');

    try {
      $stmt = $pdo->prepare("INSERT INTO clientes (nombre, notas, activo)
                             VALUES (:nombre, :notas, :activo)");
      $stmt->execute([
        ':nombre' => $nombre,
        ':notas' => ($notas === '' ? null : $notas),
        ':activo' => $activo,
      ]);

      json_ok([
        'mensaje' => 'Cliente creado',
        'id_cliente' => (int)$pdo->lastInsertId(),
      ]);
    } catch (Throwable $e) {
      if (is_dup_key($e)) json_fail('Ya existe un cliente con ese nombre');
      json_fail('Error creando cliente', ['detalle' => $e->getMessage()]);
    }
    break;
  }

  // EDITAR CLIENTE
  // POST /routes/api.php?action=mantenimiento&op=editar_cliente
  // body JSON: { "id_cliente": 5, "nombre":"ACME SRL", "notas":"...", "activo":1 }
  case 'editar_cliente': {
    $p = body_params();

    $id = (int)($p['id_cliente'] ?? 0);
    if ($id <= 0) json_fail('ID inválido');

    $nombre = sanitize_str($p['nombre'] ?? '', 120);
    $notas = array_key_exists('notas', $p) ? trim((string)$p['notas']) : null;
    $activo = array_key_exists('activo', $p) ? to_int01($p['activo'], 1) : null;

    if ($nombre === '') json_fail('El nombre es obligatorio');

    try {
      $chk = $pdo->prepare("SELECT id_cliente FROM clientes WHERE id_cliente = :id LIMIT 1");
      $chk->execute([':id' => $id]);
      if (!$chk->fetchColumn()) json_fail('Cliente no encontrado');

      $stmt = $pdo->prepare("UPDATE clientes
                             SET nombre = :nombre,
                                 notas = :notas,
                                 activo = :activo
                             WHERE id_cliente = :id");
      $stmt->execute([
        ':id' => $id,
        ':nombre' => $nombre,
        ':notas' => ($notas === '' ? null : $notas),
        ':activo' => ($activo ?? 1),
      ]);

      json_ok(['mensaje' => 'Cliente actualizado']);
    } catch (Throwable $e) {
      if (is_dup_key($e)) json_fail('Ya existe un cliente con ese nombre');
      json_fail('Error editando cliente', ['detalle' => $e->getMessage()]);
    }
    break;
  }

  // ELIMINAR CLIENTE (soft delete)
  // POST /routes/api.php?action=mantenimiento&op=eliminar_cliente
  // body JSON: { "id_cliente": 5, "hard": 0 }
  case 'eliminar_cliente': {
    $p = body_params();
    $id = (int)($p['id_cliente'] ?? 0);
    if ($id <= 0) json_fail('ID inválido');

    $hard = to_int01($p['hard'] ?? 0, 0);

    try {
      if ($hard === 1) {
        $stmt = $pdo->prepare("DELETE FROM clientes WHERE id_cliente = :id");
        $stmt->execute([':id' => $id]);
        if ($stmt->rowCount() === 0) json_fail('Cliente no encontrado');
        json_ok(['mensaje' => 'Cliente eliminado (hard)']);
      } else {
        $stmt = $pdo->prepare("UPDATE clientes SET activo = 0 WHERE id_cliente = :id");
        $stmt->execute([':id' => $id]);
        if ($stmt->rowCount() === 0) json_fail('Cliente no encontrado');
        json_ok(['mensaje' => 'Cliente eliminado (baja lógica)']);
      }
    } catch (Throwable $e) {
      json_fail('Error eliminando cliente', ['detalle' => $e->getMessage()]);
    }
    break;
  }

  default:
    json_fail('OP no válida en mantenimiento', [
      'modulo' => 'mantenimiento',
      'op_recibida' => $op
    ]);
}
