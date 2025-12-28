<?php
// backend/modules/trabajadores/trabajadores.php
declare(strict_types=1);

global $pdo;

$op = $_GET['op'] ?? '';

try {

  switch ($op) {

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

    case 'eliminar': {
      $body = json_decode(file_get_contents('php://input'), true) ?: [];
      $id = (int)($body['id'] ?? 0);

      if ($id <= 0) {
        echo json_encode(['exito' => false, 'mensaje' => 'ID inválido'], JSON_UNESCAPED_UNICODE);
        exit;
      }

      // Baja lógica
      $st = $pdo->prepare("UPDATE trabajadores SET activo = 0 WHERE id = ? LIMIT 1");
      $st->execute([$id]);

      echo json_encode(['exito' => true], JSON_UNESCAPED_UNICODE);
      exit;
    }

    default: {
      echo json_encode(['exito' => false, 'mensaje' => 'OP inválida: ' . $op], JSON_UNESCAPED_UNICODE);
      exit;
    }
  }

} catch (Throwable $e) {
  // duplicado email (unique) suele ser 1062
  echo json_encode([
    'exito' => false,
    'mensaje' => 'Error trabajadores: ' . $e->getMessage()
  ], JSON_UNESCAPED_UNICODE);
  exit;
}
