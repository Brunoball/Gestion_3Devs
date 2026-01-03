<?php
// backend/modules/reportes/route.php
declare(strict_types=1);

/**
 * Router del módulo REPORTES.
 * Ejemplo:
 *   /routes/api.php?action=reportes&op=...
 */
function route_reportes(string $action): bool
{
  if ($action !== 'reportes') return false;

  global $pdo; // ya viene definido desde routes/api.php
  require_once __DIR__ . '/reportes.php';
  return true;
}
