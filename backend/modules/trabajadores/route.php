<?php
// backend/modules/trabajadores/route.php
declare(strict_types=1);

function route_trabajadores(string $action): bool
{
    if ($action !== 'trabajadores') return false;

    global $pdo;
    require_once __DIR__ . '/../auth/session.php';

    $GLOBALS['TRABAJADORES_AUTH'] = auth_require_session($pdo);
    require_once __DIR__ . '/trabajadores.php';
    return true;
}
