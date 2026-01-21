<?php
// backend/modules/global/route.php
declare(strict_types=1);

/**
 * Router GLOBAL:
 * - action=listas
 * - action=dolar_oficial
 */
function route_global(string $action): bool
{
  if ($action === 'listas') {
    require_once __DIR__ . '/obtener_listas.php';
    return true;
  }

  if ($action === 'dolar_oficial') {
    require_once __DIR__ . '/obtener_dolar.php';
    return true;
  }

  return false;
}

/**
 * ✅ Alias de compatibilidad (para no romper tu api.php viejo ni el frontend)
 * - mantiene funcionando: action=listas usando route_listas()
 */
function route_listas(string $action): bool
{
  if ($action !== 'listas') return false;

  require_once __DIR__ . '/obtener_listas.php';
  return true;
}
