<?php
// backend/modules/mantenimiento/route.php
declare(strict_types=1);

/**
 * Router del módulo MANTENIMIENTO.
 * URL ejemplo:
 * /routes/api.php?action=mantenimiento&op=planes
 */
function route_mantenimiento(string $action): bool
{
  if ($action !== 'mantenimiento') return false;

  global $pdo;

  require_once __DIR__ . '/mantenimiento.php';
  return true;
}
