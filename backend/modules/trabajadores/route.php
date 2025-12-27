<?php
// backend/modules/trabajadores/route.php
declare(strict_types=1);

/**
 * Router del módulo TRABAJADORES.
 * Mantenerlo liviano: delega en trabajadores.php según "op".
 *
 * URL ejemplo:
 * /routes/api.php?action=trabajadores&op=listar
 */
function route_trabajadores(string $action): bool
{
  if ($action !== 'trabajadores') return false;

  // ✅ trae $pdo al scope de esta función (porque vamos a require dentro)
  global $pdo;

  require_once __DIR__ . '/trabajadores.php';
  return true;
}
