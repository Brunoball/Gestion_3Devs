<?php
// backend/modules/login/sesion_actual.php
declare(strict_types=1);

require_once __DIR__ . '/../auth/session.php';

$ctx = auth_require_session($pdo);

$active = null;
foreach ($ctx['organizaciones'] as $organization) {
    if ((int)$organization['id_organizacion'] === (int)$ctx['id_organizacion']) {
        $active = $organization;
        break;
    }
}

echo json_encode([
    'exito' => true,
    'usuario' => [
        'idUsuario' => (int)$ctx['id_usuario'],
        'Nombre_Completo' => (string)$ctx['nombre'],
        'rol' => (string)$ctx['rol_global'],
        'organizaciones' => $ctx['organizaciones'],
        'organizacion_activa' => $active,
    ],
    'expires_at' => $ctx['expires_at'],
], JSON_UNESCAPED_UNICODE);
exit;
