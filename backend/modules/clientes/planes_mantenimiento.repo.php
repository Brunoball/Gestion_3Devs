<?php
// backend/modules/clientes/planes_mantenimiento.repo.php
declare(strict_types=1);

function repo_planes_mantenimiento_listar(PDO $pdo): array
{
  $sql = "SELECT 
            id,
            nombre,
            descripcion,
            monto
          FROM planes_mantenimiento
          WHERE activo = 1
          ORDER BY id ASC";

  $st = $pdo->prepare($sql);
  $st->execute();

  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  foreach ($rows as &$r) {
    $r['id'] = (int)($r['id'] ?? 0);
    $r['nombre'] = (string)($r['nombre'] ?? '');
    $r['descripcion'] = (string)($r['descripcion'] ?? '');
    $r['monto'] = (float)($r['monto'] ?? 0);
  }
  unset($r);

  return $rows;
}
