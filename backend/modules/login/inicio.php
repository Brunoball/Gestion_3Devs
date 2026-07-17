<?php
// backend/modules/login/inicio.php
declare(strict_types=1);

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

require_once __DIR__ . '/../auth/session.php';

const DEBUG_LOGIN = false;

function login_ok(array $payload): never
{
    http_response_code(200);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function login_fail(string $message, int $status = 401): never
{
    http_response_code($status);
    echo json_encode([
        'exito' => false,
        'mensaje' => $message,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        login_fail('Método no permitido.', 405);
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    if (!is_array($data)) {
        $data = $_POST ?? [];
    }

    $nombre = trim((string)($data['nombre'] ?? $data['usuario'] ?? ''));
    $contrasena = (string)($data['contrasena'] ?? $data['password'] ?? '');

    if ($nombre === '' || $contrasena === '') {
        login_fail('Completá usuario y contraseña.', 422);
    }

    $stmt = $pdo->prepare("
        SELECT
            idUsuario,
            Nombre_Completo,
            Hash_Contrasena
        FROM usuarios
        WHERE UPPER(Nombre_Completo) = UPPER(:nombre)
        ORDER BY idUsuario ASC
        LIMIT 1
    ");
    $stmt->execute([':nombre' => $nombre]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        login_fail('Credenciales incorrectas.');
    }

    $stored = trim((string)$user['Hash_Contrasena']);
    $verified = false;
    $wasPlainText = false;

    if ($stored !== '' && hash_equals($stored, $contrasena)) {
        $verified = true;
        $wasPlainText = true;
    } elseif ($stored !== '' && password_verify($contrasena, $stored)) {
        $verified = true;
    }

    if (!$verified) {
        login_fail('Credenciales incorrectas.');
    }

    $idUsuario = (int)$user['idUsuario'];
    $organizations = auth_user_organizations($pdo, $idUsuario);
    if (!$organizations) {
        login_fail('Tu cuenta no tiene acceso habilitado a ninguna organización.', 403);
    }

    // Migra silenciosamente contraseñas antiguas en texto plano.
    if ($wasPlainText || password_needs_rehash($stored, PASSWORD_BCRYPT)) {
        $newHash = password_hash($contrasena, PASSWORD_BCRYPT);
        $upgrade = $pdo->prepare("
            UPDATE usuarios
            SET Hash_Contrasena = :hash
            WHERE idUsuario = :id_usuario
        ");
        $upgrade->execute([
            ':hash' => $newHash,
            ':id_usuario' => $idUsuario,
        ]);
    }

    $activeOrganization = $organizations[0];
    $session = auth_create_session(
        $pdo,
        $idUsuario,
        (int)$activeOrganization['id_organizacion'],
        12 * 60 * 60
    );

    login_ok([
        'exito' => true,
        'token' => $session['session_key'],
        'session_key' => $session['session_key'],
        'expires_at' => $session['expires_at'],
        'usuario' => [
            'idUsuario' => $idUsuario,
            'Nombre_Completo' => (string)$user['Nombre_Completo'],
            'rol' => auth_highest_role($organizations),
            'organizaciones' => $organizations,
            'organizacion_activa' => $activeOrganization,
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito' => false,
        'mensaje' => 'Error del servidor al iniciar sesión.',
        'detalle' => DEBUG_LOGIN ? $e->getMessage() : null,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
