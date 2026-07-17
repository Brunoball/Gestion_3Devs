<?php
// backend/modules/clientes/planes_mantenimiento.repo.php
declare(strict_types=1);

function repo_planes_mantenimiento_listar(PDO $pdo, int $idOrganizacion): array
{
  $sql = "
    SELECT id, nombre, descripcion, monto
    FROM planes_mantenimiento
    WHERE id_organizacion = :id_organizacion
      AND activo = 1
    ORDER BY id ASC
  ";

  $st = $pdo->prepare($sql);
  $st->execute([':id_organizacion' => $idOrganizacion]);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  foreach ($rows as &$row) {
    $row['id'] = (int)($row['id'] ?? 0);
    $row['nombre'] = (string)($row['nombre'] ?? '');
    $row['descripcion'] = (string)($row['descripcion'] ?? '');
    $row['monto'] = (float)($row['monto'] ?? 0);
  }
  unset($row);

  return $rows;
}
