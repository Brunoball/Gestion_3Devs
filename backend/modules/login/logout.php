<?php
// backend/modules/login/logout.php
declare(strict_types=1);

require_once __DIR__ . '/../auth/session.php';

auth_revoke_current_session($pdo);

echo json_encode([
    'exito' => true,
    'mensaje' => 'Sesión cerrada.',
], JSON_UNESCAPED_UNICODE);
exit;
