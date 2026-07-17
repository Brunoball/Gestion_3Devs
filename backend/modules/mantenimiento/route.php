<?php
// backend/modules/mantenimiento/route.php
declare(strict_types=1);

function route_mantenimiento(string $action): bool
{
  if ($action !== 'mantenimiento') return false;

  global $pdo;
  require_once __DIR__ . '/../auth/session.php';
  $GLOBALS['MANTENIMIENTO_AUTH'] = auth_require_session($pdo);
  require_once __DIR__ . '/mantenimiento.php';
  return true;
}
