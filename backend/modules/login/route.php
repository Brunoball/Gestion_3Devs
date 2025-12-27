<?php
// backend/modules/login/route.php
declare(strict_types=1);

/**
 * Router del módulo LOGIN.
 * OJO: se ejecuta dentro de una función, por eso hay que traer $pdo con global
 */
function route_login(string $action): bool
{
    // ✅ Importantísimo: traer el $pdo global al scope de esta función,
    // así los requires (inicio.php / registro.php) lo ven.
    global $pdo;

    switch ($action) {
        case 'inicio':
            require __DIR__ . '/inicio.php';
            return true;

        case 'registro':
            require __DIR__ . '/registro.php';
            return true;

        default:
            return false;
    }
}
