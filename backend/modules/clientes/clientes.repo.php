<?php
// backend/modules/clientes/clientes.repo.php
declare(strict_types=1);

/* =========================
   CLIENTES
========================= */

function clientes_listar(): void {
  global $pdo;

  try {
    $st = $pdo->query("
      SELECT id_cliente, nombre, notas, activo
      FROM clientes
      ORDER BY nombre ASC
    ");
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
