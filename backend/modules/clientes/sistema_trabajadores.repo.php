<?php
// backend/modules/clientes/repos/sistema_trabajadores.repo.php
declare(strict_types=1);

/* =========================
   SISTEMA <-> TRABAJADORES
========================= */

function sistema_trabajadores_listar(): void {
  global $pdo;
  $id_sistema = (int)($_GET['id_sistema'] ?? 0);
  if ($id_sistema <= 0) json_out(['exito' => false, 'mensaje' => 'id_sistema inválido']);

  try {
    $st = $pdo->prepare("
      SELECT
        t.id,
        t.nombre,
        t.apellido,
        t.rol,
        st.fecha_asignacion
      FROM sistemas_trabajadores st
      INNER JOIN trabajadores t ON t.id = st.id_trabajador
      WHERE st.id_sistema = :id
      ORDER BY t.apellido, t.nombre
    ");
    $st->execute([':id' => $id_sistema]);
    json_out(['exito' => true, 'asignados' => $st->fetchAll(PDO::FETCH_ASSOC)]);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error listando asignados: ' . $e->getMessage()]);
  }
}

function sistema_trabajadores_agregar(): void {
  global $pdo;
  $in = read_json();

  $id_sistema = (int)($in['id_sistema'] ?? 0);
  $id_trabajador = (int)($in['id_trabajador'] ?? 0);

  if ($id_sistema <= 0) json_out(['exito' => false, 'mensaje' => 'id_sistema inválido']);
  if ($id_trabajador <= 0) json_out(['exito' => false, 'mensaje' => 'id_trabajador inválido']);

  try {
    $chk = $pdo->prepare("SELECT COUNT(*) FROM trabajadores WHERE id=:id AND activo=1");
    $chk->execute([':id' => $id_trabajador]);
    if ((int)$chk->fetchColumn() <= 0) {
      json_out(['exito' => false, 'mensaje' => 'Trabajador inexistente o inactivo']);
    }

    $st = $pdo->prepare("
      INSERT INTO sistemas_trabajadores (id_sistema, id_trabajador)
      VALUES (:s, :t)
      ON DUPLICATE KEY UPDATE fecha_asignacion = fecha_asignacion
    ");
    $st->execute([':s' => $id_sistema, ':t' => $id_trabajador]);

    json_out(['exito' => true, 'mensaje' => 'Trabajador asignado']);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error asignando trabajador: ' . $e->getMessage()]);
  }
}

function sistema_trabajadores_quitar(): void {
  global $pdo;
  $in = read_json();

  $id_sistema = (int)($in['id_sistema'] ?? 0);
  $id_trabajador = (int)($in['id_trabajador'] ?? 0);

  if ($id_sistema <= 0) json_out(['exito' => false, 'mensaje' => 'id_sistema inválido']);
  if ($id_trabajador <= 0) json_out(['exito' => false, 'mensaje' => 'id_trabajador inválido']);

  try {
    $st = $pdo->prepare("
      DELETE FROM sistemas_trabajadores
      WHERE id_sistema = :s AND id_trabajador = :t
      LIMIT 1
    ");
    $st->execute([':s' => $id_sistema, ':t' => $id_trabajador]);

    json_out(['exito' => true, 'mensaje' => 'Trabajador quitado']);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error quitando trabajador: ' . $e->getMessage()]);
  }
}
