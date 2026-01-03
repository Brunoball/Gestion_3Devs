<?php
// backend/modules/Global/route.php
declare(strict_types=1);

/**
 * Router del módulo LISTAS (Global).
 * Ejemplo:
 *   /routes/api.php?action=listas
 */
function route_listas(string $action): bool
{
  if ($action !== 'listas') return false;

  global $pdo; // viene de routes/api.php
  require_once __DIR__ . '/obtener_listas.php';
  return true;
}
