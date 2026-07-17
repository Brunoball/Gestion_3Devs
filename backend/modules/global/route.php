<?php
// backend/modules/global/route.php
declare(strict_types=1);

require_once __DIR__ . '/../auth/session.php';

function route_global(string $action): bool
{
  global $pdo;

  if ($action === 'listas') {
    $GLOBALS['GLOBAL_AUTH'] = auth_require_session($pdo);
    require __DIR__ . '/obtener_listas.php';
    return true;
  }

  if ($action === 'dolar_oficial') {
    // También exige sesión; no contiene datos de una empresa, pero evita uso público.
    $GLOBALS['GLOBAL_AUTH'] = auth_require_session($pdo);
    require __DIR__ . '/obtener_dolar.php';
    return true;
  }

  return false;
}

function route_listas(string $action): bool
{
  return route_global($action);
}
