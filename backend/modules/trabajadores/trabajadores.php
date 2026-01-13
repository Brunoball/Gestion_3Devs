<?php
// backend/modules/trabajadores/trabajadores.php
declare(strict_types=1);

global $pdo;

$op = $_GET['op'] ?? '';

try {

  switch ($op) {

    /* =========================
       LISTAR (activos o todos)
    ========================== */
    case 'listar': {
      $soloActivos = isset($_GET['activos']) ? (int)$_GET['activos'] : 1;

      $sql = "SELECT id, nombre, apellido, email, rol, alias_pago, activo, fecha_alta
              FROM trabajadores
              " . ($soloActivos ? "WHERE activo = 1" : "") . "
              ORDER BY id DESC";

      $st = $pdo->prepare($sql);
      $st->execute();
      $data = $st->fetchAll(PDO::FETCH_ASSOC);

      echo json_encode(['exito' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
      exit;
    }

    /* =========================
       GET 1
    ========================== */
    case 'get': {
      $id = (int)($_GET['id'] ?? 0);
      if ($id <= 0) {
        echo json_encode(['exito' => false, 'mensaje' => 'ID inválido'], JSON_UNESCAPED_UNICODE);
        exit;
      }

      $st = $pdo->prepare("SELECT id, nombre, apellido, email, rol, alias_pago, activo, fecha_alta
                           FROM trabajadores
                           WHERE id = ? LIMIT 1");
      $st->execute([$id]);
      $row = $st->fetch(PDO::FETCH_ASSOC);

      echo json_encode(['exito' => (bool)$row, 'data' => $row], JSON_UNESCAPED_UNICODE);
      exit;
    }

    /* =========================
       CREAR
    ========================== */
    case 'crear': {
      $body = json_decode(file_get_contents('php://input'), true) ?: [];

      $nombre    = trim((string)($body['nombre'] ?? ''));
      $apellido  = trim((string)($body['apellido'] ?? ''));
      $email     = trim((string)($body['email'] ?? ''));
      $rol       = trim((string)($body['rol'] ?? 'vista'));
      $aliasPago = trim((string)($body['alias_pago'] ?? ''));

      if ($nombre === '' || $apellido === '') {
        echo json_encode(['exito' => false, 'mensaje' => 'Nombre y apellido son obligatorios'], JSON_UNESCAPED_UNICODE);
        exit;
      }

      $rolesValidos = ['admin','desarrollador','soporte','vista'];
      if (!in_array($rol, $rolesValidos, true)) $rol = 'vista';

      $emailDb = ($email === '') ? null : $email;
      $aliasDb = ($aliasPago === '') ? null : $aliasPago;

      $st = $pdo->prepare("INSERT INTO trabajadores (nombre, apellido, email, rol, alias_pago, activo)
                           VALUES (?, ?, ?, ?, ?, 1)");
      $st->execute([$nombre, $apellido, $emailDb, $rol, $aliasDb]);

      echo json_encode(['exito' => true, 'id' => (int)$pdo->lastInsertId()], JSON_UNESCAPED_UNICODE);
      exit;
    }

    /* =========================
       EDITAR
    ========================== */
    case 'editar': {
      $body = json_decode(file_get_contents('php://input'), true) ?: [];

      $id        = (int)($body['id'] ?? 0);
      $nombre    = trim((string)($body['nombre'] ?? ''));
      $apellido  = trim((string)($body['apellido'] ?? ''));
      $email     = trim((string)($body['email'] ?? ''));
      $rol       = trim((string)($body['rol'] ?? 'vista'));
      $aliasPago = trim((string)($body['alias_pago'] ?? ''));
      $activo    = isset($body['activo']) ? (int)!!$body['activo'] : 1;

      if ($id <= 0) {
        echo json_encode(['exito' => false, 'mensaje' => 'ID inválido'], JSON_UNESCAPED_UNICODE);
        exit;
      }
      if ($nombre === '' || $apellido === '') {
        echo json_encode(['exito' => false, 'mensaje' => 'Nombre y apellido son obligatorios'], JSON_UNESCAPED_UNICODE);
        exit;
      }

      $rolesValidos = ['admin','desarrollador','soporte','vista'];
      if (!in_array($rol, $rolesValidos, true)) $rol = 'vista';

      $emailDb = ($email === '') ? null : $email;
      $aliasDb = ($aliasPago === '') ? null : $aliasPago;

      $st = $pdo->prepare("UPDATE trabajadores
                           SET nombre = ?, apellido = ?, email = ?, rol = ?, alias_pago = ?, activo = ?
                           WHERE id = ? LIMIT 1");
      $st->execute([$nombre, $apellido, $emailDb, $rol, $aliasDb, $activo, $id]);

      echo json_encode(['exito' => true], JSON_UNESCAPED_UNICODE);
      exit;
    }

    /* =========================
       BAJA LÓGICA (DAR DE BAJA)
       activo = 0
    ========================== */
    case 'baja': {
      $body = json_decode(file_get_contents('php://input'), true) ?: [];
      $id = (int)($body['id'] ?? 0);

      if ($id <= 0) {
        echo json_encode(['exito' => false, 'mensaje' => 'ID inválido'], JSON_UNESCAPED_UNICODE);
        exit;
      }

      $st = $pdo->prepare("UPDATE trabajadores SET activo = 0 WHERE id = ? LIMIT 1");
      $st->execute([$id]);

      if ($st->rowCount() === 0) {
        echo json_encode(['exito' => false, 'mensaje' => 'No existe el trabajador.'], JSON_UNESCAPED_UNICODE);
        exit;
      }

      echo json_encode(['exito' => true], JSON_UNESCAPED_UNICODE);
      exit;
    }

    /* =========================
       REACTIVAR
       activo = 1
    ========================== */
    case 'reactivar': {
      $body = json_decode(file_get_contents('php://input'), true) ?: [];
      $id = (int)($body['id'] ?? 0);

      if ($id <= 0) {
        echo json_encode(['exito' => false, 'mensaje' => 'ID inválido'], JSON_UNESCAPED_UNICODE);
        exit;
      }

      $st = $pdo->prepare("UPDATE trabajadores SET activo = 1 WHERE id = ? LIMIT 1");
      $st->execute([$id]);

      if ($st->rowCount() === 0) {
        echo json_encode(['exito' => false, 'mensaje' => 'No existe el trabajador.'], JSON_UNESCAPED_UNICODE);
        exit;
      }

      echo json_encode(['exito' => true], JSON_UNESCAPED_UNICODE);
      exit;
    }

    /* =========================
       ELIMINAR PERMANENTE
       (DELETE físico)
    ========================== */
    case 'eliminar': {
      $body = json_decode(file_get_contents('php://input'), true) ?: [];
      $id = (int)($body['id'] ?? 0);

      if ($id <= 0) {
        echo json_encode(['exito' => false, 'mensaje' => 'ID inválido'], JSON_UNESCAPED_UNICODE);
        exit;
      }

      $st = $pdo->prepare("DELETE FROM trabajadores WHERE id = ? LIMIT 1");
      $st->execute([$id]);

      if ($st->rowCount() === 0) {
        echo json_encode(['exito' => false, 'mensaje' => 'No existe el trabajador o ya fue eliminado.'], JSON_UNESCAPED_UNICODE);
        exit;
      }

      echo json_encode(['exito' => true], JSON_UNESCAPED_UNICODE);
      exit;
    }

    default: {
      echo json_encode(['exito' => false, 'mensaje' => 'OP inválida: ' . $op], JSON_UNESCAPED_UNICODE);
      exit;
    }
  }

} catch (PDOException $e) {
  $mysqlCode = isset($e->errorInfo[1]) ? (int)$e->errorInfo[1] : 0;
  $msg = $e->getMessage();

  // ✅ Duplicados (1062)
  if ($mysqlCode === 1062 || str_contains($msg, 'Duplicate entry')) {
    echo json_encode([
      'exito' => false,
      'mensaje' => 'Ya existe un trabajador con ese correo.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // ✅ FK constraint (1451) típico al DELETE
  if ($mysqlCode === 1451 || str_contains($msg, 'a foreign key constraint fails')) {
    echo json_encode([
      'exito' => false,
      'mensaje' => 'No se puede eliminar: el trabajador está referenciado por otros registros.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
  }

  echo json_encode([
    'exito' => false,
    'mensaje' => 'Error de base de datos al operar trabajadores.'
  ], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  echo json_encode([
    'exito' => false,
    'mensaje' => 'Error interno al operar trabajadores.'
  ], JSON_UNESCAPED_UNICODE);
  exit;
}
