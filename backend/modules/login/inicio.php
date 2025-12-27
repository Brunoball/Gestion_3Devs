<?php
// backend/modules/login/inicio.php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../config/db.php'; // Debe definir $pdo

define('DEBUG_LOGIN', false);

/* ----------------- Helpers ----------------- */
function ok($arr) {
    echo json_encode($arr, JSON_UNESCAPED_UNICODE);
    exit;
}
function fail($msg, $code200 = true) {
    if (!$code200) http_response_code(400);
    echo json_encode(['exito' => false, 'mensaje' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido.']);
        exit;
    }

    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) $data = $_POST ?? [];

    $nombre     = trim((string)($data['nombre'] ?? $data['usuario'] ?? ''));
    $contrasena = (string)($data['contrasena'] ?? $data['password'] ?? '');

    if ($nombre === '' || $contrasena === '') {
        fail('Faltan datos.');
    }

    // 👇 Aseguramos esquema + tabla
    $sql = "
        SELECT
            idUsuario,
            Nombre_Completo,
            Hash_Contrasena,
            LOWER(rol) AS rol
        FROM usuarios
        WHERE Nombre_Completo = :nombre
        LIMIT 1
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':nombre' => $nombre]);

    $u = $stmt->fetch(PDO::FETCH_ASSOC);

    if (DEBUG_LOGIN) {
        // SOLO PARA PROBAR: ver si trae algo
        // NO DEJAR EN PRODUCCIÓN
        // ok(['debug_usuario' => $u, 'input_nombre' => $nombre, 'input_pass' => $contrasena]);
    }

    if (!$u) {
        fail('Credenciales incorrectas.');
    }

    $guardado = trim((string)$u['Hash_Contrasena']);

    // --- VERIFICACIÓN MUY SIMPLE POR AHORA (TEXTO PLANO) ---
    $ok = false;

    // 1) plain text directo (para tu caso actual '1234')
    if ($guardado !== '' && $guardado === $contrasena) {
        $ok = true;
    }

    // 2) si más adelante usás password_hash, también te va a servir:
    if (!$ok && password_verify($contrasena, $guardado)) {
        $ok = true;
    }

    if (!$ok) {
        fail('Credenciales incorrectas.');
    }

    // Normalización de rol
    $rol = $u['rol'] ?? 'vista';
    $rol = in_array($rol, ['admin', 'vista'], true) ? $rol : 'vista';

    $respUsuario = [
        'idUsuario'       => (int)$u['idUsuario'],
        'Nombre_Completo' => (string)$u['Nombre_Completo'],
        'rol'             => $rol,
    ];

    ok([
        'exito'   => true,
        'usuario' => $respUsuario,
    ]);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error del servidor.',
        'detalle' => DEBUG_LOGIN ? $e->getMessage() : null,
    ], JSON_UNESCAPED_UNICODE);
}
