<?php
// backend/modules/login/route.php
declare(strict_types=1);

function route_login(string $action): bool
{
    global $pdo;

    switch ($action) {
        case 'inicio':
            require __DIR__ . '/inicio.php';
            return true;

        case 'registro':
            require __DIR__ . '/registro.php';
            return true;

        case 'logout':
            require __DIR__ . '/logout.php';
            return true;

        case 'sesion_actual':
            require __DIR__ . '/sesion_actual.php';
            return true;

        default:
            return false;
    }
}
