<?php
// backend/modules/clientes/repos/trabajadores.repo.php
declare(strict_types=1);

/* =========================
   TRABAJADORES (para dropdown)
========================= */

function trabajadores_listar_simple(): void {
  global $pdo;
  try {
    $st = $pdo->query("
      SELECT id, nombre, apellido, rol
      FROM trabajadores
      WHERE activo = 1
      ORDER BY apellido, nombre
    ");
    json_out(['exito' => true, 'trabajadores' => $st->fetchAll(PDO::FETCH_ASSOC)]);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error listando trabajadores: ' . $e->getMessage()]);
  }
}
