<?php
// backend/modules/clientes/clientes.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php'; // debe definir $pdo (PDO)

function json_out(array $arr): void {
  http_response_code(200);
  echo json_encode($arr, JSON_UNESCAPED_UNICODE);
  exit;
}

function read_json(): array {
  $raw = file_get_contents('php://input');
  $in = json_decode($raw ?: '[]', true);
  return is_array($in) ? $in : [];
}

/* =========================
   CLIENTES
========================= */

function clientes_listar(): void {
  global $pdo;
  try {
    $st = $pdo->query("SELECT id_cliente, nombre, notas, activo FROM clientes ORDER BY nombre ASC");
    json_out(['exito' => true, 'clientes' => $st->fetchAll(PDO::FETCH_ASSOC)]);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error listando clientes: ' . $e->getMessage()]);
  }
}

function clientes_crear(): void {
  global $pdo;
  $in = read_json();

  $nombre = trim((string)($in['nombre'] ?? ''));
  $notas  = trim((string)($in['notas'] ?? ''));

  if ($nombre === '') json_out(['exito' => false, 'mensaje' => 'Nombre requerido']);

  try {
    $st = $pdo->prepare("INSERT INTO clientes (nombre, notas) VALUES (:n, :no)");
    $st->execute([
      ':n'  => $nombre,
      ':no' => ($notas === '' ? null : $notas),
    ]);
    json_out(['exito' => true, 'mensaje' => 'Cliente creado']);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error creando cliente: ' . $e->getMessage()]);
  }
}

function clientes_actualizar(): void {
  global $pdo;
  $in = read_json();

  $id_cliente = (int)($in['id_cliente'] ?? 0);
  $nombre     = trim((string)($in['nombre'] ?? ''));
  $notas      = trim((string)($in['notas'] ?? ''));

  if ($id_cliente <= 0) json_out(['exito' => false, 'mensaje' => 'id_cliente inválido']);
  if ($nombre === '') json_out(['exito' => false, 'mensaje' => 'Nombre requerido']);

  try {
    $st = $pdo->prepare("UPDATE clientes SET nombre=:n, notas=:no WHERE id_cliente=:id");
    $st->execute([
      ':n'  => $nombre,
      ':no' => ($notas === '' ? null : $notas),
      ':id' => $id_cliente,
    ]);
    json_out(['exito' => true, 'mensaje' => 'Cliente actualizado']);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error actualizando cliente: ' . $e->getMessage()]);
  }
}

function clientes_eliminar(): void {
  global $pdo;
  $in = read_json();

  $id_cliente = (int)($in['id_cliente'] ?? 0);
  if ($id_cliente <= 0) json_out(['exito' => false, 'mensaje' => 'id_cliente inválido']);

  try {
    $st = $pdo->prepare("DELETE FROM clientes WHERE id_cliente=:id");
    $st->execute([':id' => $id_cliente]);
    json_out(['exito' => true, 'mensaje' => 'Cliente eliminado']);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error eliminando cliente: ' . $e->getMessage()]);
  }
}

/* =========================
   SISTEMAS POR CLIENTE
========================= */

function clientes_sistemas_listar(): void {
  global $pdo;
  $id_cliente = (int)($_GET['id_cliente'] ?? 0);
  if ($id_cliente <= 0) json_out(['exito' => false, 'mensaje' => 'id_cliente inválido']);

  try {
    $st = $pdo->prepare("
      SELECT
        id_sistema, id_cliente, nombre, descripcion,
        plan, monto_desarrollo, monto_mensual, estado, fecha_inicio
      FROM clientes_sistemas
      WHERE id_cliente=:id
      ORDER BY nombre ASC
    ");
    $st->execute([':id' => $id_cliente]);
    json_out(['exito' => true, 'sistemas' => $st->fetchAll(PDO::FETCH_ASSOC)]);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error listando sistemas: ' . $e->getMessage()]);
  }
}

function clientes_sistemas_crear(): void {
  global $pdo;
  $in = read_json();

  $id_cliente = (int)($in['id_cliente'] ?? 0);
  $nombre     = trim((string)($in['nombre'] ?? ''));
  $descripcion= trim((string)($in['descripcion'] ?? ''));
  $plan       = trim((string)($in['plan'] ?? 'mensual'));

  $monto_desarrollo = (float)($in['monto_desarrollo'] ?? 0);
  $monto_mensual    = (float)($in['monto_mensual'] ?? 0);

  $estado     = trim((string)($in['estado'] ?? 'activo'));
  $fecha_inicio = trim((string)($in['fecha_inicio'] ?? ''));

  if ($id_cliente <= 0) json_out(['exito' => false, 'mensaje' => 'id_cliente inválido']);
  if ($nombre === '') json_out(['exito' => false, 'mensaje' => 'Nombre del sistema requerido']);

  $allowedPlan = ['mensual','anual','soporte','proyecto'];
  if (!in_array($plan, $allowedPlan, true)) $plan = 'mensual';

  $allowedEstado = ['activo','pausado','finalizado'];
  if (!in_array($estado, $allowedEstado, true)) $estado = 'activo';

  $fi = null;
  if ($fecha_inicio !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_inicio)) {
    $fi = $fecha_inicio;
  }

  try {
    $st = $pdo->prepare("
      INSERT INTO clientes_sistemas
        (id_cliente, nombre, descripcion, plan, monto_desarrollo, monto_mensual, estado, fecha_inicio)
      VALUES
        (:idc, :n, :d, :p, :md, :mm, :e, :fi)
    ");
    $st->execute([
      ':idc' => $id_cliente,
      ':n'   => $nombre,
      ':d'   => ($descripcion === '' ? null : $descripcion),
      ':p'   => $plan,
      ':md'  => $monto_desarrollo,
      ':mm'  => $monto_mensual,
      ':e'   => $estado,
      ':fi'  => $fi,
    ]);

    json_out(['exito' => true, 'mensaje' => 'Sistema agregado']);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error agregando sistema: ' . $e->getMessage()]);
  }
}

function clientes_sistemas_actualizar(): void {
  global $pdo;
  $in = read_json();

  $id_sistema = (int)($in['id_sistema'] ?? 0);
  $nombre     = trim((string)($in['nombre'] ?? ''));
  $descripcion= trim((string)($in['descripcion'] ?? ''));
  $plan       = trim((string)($in['plan'] ?? 'mensual'));

  $monto_desarrollo = (float)($in['monto_desarrollo'] ?? 0);
  $monto_mensual    = (float)($in['monto_mensual'] ?? 0);

  $estado     = trim((string)($in['estado'] ?? 'activo'));
  $fecha_inicio = trim((string)($in['fecha_inicio'] ?? ''));

  if ($id_sistema <= 0) json_out(['exito' => false, 'mensaje' => 'id_sistema inválido']);
  if ($nombre === '') json_out(['exito' => false, 'mensaje' => 'Nombre requerido']);

  $allowedPlan = ['mensual','anual','soporte','proyecto'];
  if (!in_array($plan, $allowedPlan, true)) $plan = 'mensual';

  $allowedEstado = ['activo','pausado','finalizado'];
  if (!in_array($estado, $allowedEstado, true)) $estado = 'activo';

  $fi = null;
  if ($fecha_inicio !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_inicio)) {
    $fi = $fecha_inicio;
  }

  try {
    $st = $pdo->prepare("
      UPDATE clientes_sistemas
      SET
        nombre=:n,
        descripcion=:d,
        plan=:p,
        monto_desarrollo=:md,
        monto_mensual=:mm,
        estado=:e,
        fecha_inicio=:fi
      WHERE id_sistema=:id
    ");
    $st->execute([
      ':n'  => $nombre,
      ':d'  => ($descripcion === '' ? null : $descripcion),
      ':p'  => $plan,
      ':md' => $monto_desarrollo,
      ':mm' => $monto_mensual,
      ':e'  => $estado,
      ':fi' => $fi,
      ':id' => $id_sistema,
    ]);

    json_out(['exito' => true, 'mensaje' => 'Sistema actualizado']);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error actualizando sistema: ' . $e->getMessage()]);
  }
}

function clientes_sistemas_eliminar(): void {
  global $pdo;
  $in = read_json();

  $id_sistema = (int)($in['id_sistema'] ?? 0);
  if ($id_sistema <= 0) json_out(['exito' => false, 'mensaje' => 'id_sistema inválido']);

  try {
    $st = $pdo->prepare("DELETE FROM clientes_sistemas WHERE id_sistema=:id");
    $st->execute([':id' => $id_sistema]);
    json_out(['exito' => true, 'mensaje' => 'Sistema eliminado']);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error eliminando sistema: ' . $e->getMessage()]);
  }
}
