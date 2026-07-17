<?php
// backend/modules/clientes/trabajadores.repo.php
declare(strict_types=1);

function trabajadores_listar_simple(): void
{
  global $pdo;
  $idOrganizacion = clientes_org_id();

  try {
    $st = $pdo->prepare("
      SELECT
        t.id,
        t.nombre,
        t.apellido,
        tro.rol_en_organizacion AS rol
      FROM trabajadores_organizaciones tro
      INNER JOIN trabajadores t ON t.id = tro.id_trabajador
      WHERE tro.id_organizacion = :id_organizacion
        AND tro.activo = 1
        AND t.activo = 1
      ORDER BY t.apellido, t.nombre
    ");
    $st->execute([':id_organizacion' => $idOrganizacion]);

    json_out(['exito' => true, 'trabajadores' => $st->fetchAll(PDO::FETCH_ASSOC)]);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error listando trabajadores.'], 500);
  }
}
