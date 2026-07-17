<?php
// backend/modules/reportes/common.php
declare(strict_types=1);

/**
 * Contexto común y obligatorio del módulo Reportes.
 * Todas las consultas quedan limitadas a la organización seleccionada en sesión.
 */

require_once __DIR__ . '/../auth/session.php';

function reportes_auth(): array
{
    global $pdo;

    if (isset($GLOBALS['REPORTES_AUTH']) && is_array($GLOBALS['REPORTES_AUTH'])) {
        return $GLOBALS['REPORTES_AUTH'];
    }

    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible para autenticar Reportes.');
    }

    $GLOBALS['REPORTES_AUTH'] = auth_require_session($pdo);
    return $GLOBALS['REPORTES_AUTH'];
}

function reportes_org_id(): int
{
    return (int)(reportes_auth()['id_organizacion'] ?? 0);
}

function reportes_org_code(): string
{
    return strtoupper(trim((string)(reportes_auth()['organizacion_codigo'] ?? '')));
}

function reportes_role(): string
{
    return strtolower(trim((string)(reportes_auth()['rol_organizacion'] ?? 'vista')));
}

function reportes_can_write(): bool
{
    return in_array(reportes_role(), ['admin', 'contador'], true);
}

function reportes_require_write(): array
{
    $auth = reportes_auth();
    if (!reportes_can_write()) {
        auth_json_error('No tenés permisos para modificar Reportes en esta entidad.', 403, [
            'codigo' => 'ROLE_FORBIDDEN',
        ]);
    }
    return $auth;
}
