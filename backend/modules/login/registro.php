<?php
// backend/modules/login/registro.php
declare(strict_types=1);

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

require_once __DIR__ . '/../auth/session.php';

function registro_out(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        registro_out(['exito' => false, 'mensaje' => 'Método no permitido.'], 405);
    }

    $caller = auth_require_session($pdo, ['admin']);

    // Crear usuarios es una acción exclusiva del administrador general:
    // debe ser administrador en todas las organizaciones activas.
    $activeOrganizations = $pdo->query("
        SELECT id_organizacion
        FROM organizaciones
        WHERE activo = 1
        ORDER BY id_organizacion
    ")->fetchAll(PDO::FETCH_COLUMN) ?: [];

    $callerAdminIds = [];
    foreach ($caller['organizaciones'] as $organization) {
        if (($organization['rol'] ?? '') === 'admin') {
            $callerAdminIds[(int)$organization['id_organizacion']] = true;
        }
    }

    foreach ($activeOrganizations as $activeOrganizationId) {
        if (!isset($callerAdminIds[(int)$activeOrganizationId])) {
            registro_out([
                'exito' => false,
                'mensaje' => 'La creación de usuarios está reservada al administrador general.',
            ], 403);
        }
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    if (!is_array($data)) {
        $data = $_POST ?? [];
    }

    $nombre = trim((string)($data['nombre'] ?? ''));
    $contrasena = (string)($data['contrasena'] ?? '');
    $alcance = strtolower(trim((string)($data['alcance'] ?? 'balto')));

    if ($nombre === '' || $contrasena === '') {
        registro_out(['exito' => false, 'mensaje' => 'Faltan datos.'], 422);
    }
    if (mb_strlen($nombre) < 4 || mb_strlen($nombre) > 100) {
        registro_out(['exito' => false, 'mensaje' => 'El usuario debe tener entre 4 y 100 caracteres.'], 422);
    }
    if (strlen($contrasena) < 8) {
        registro_out(['exito' => false, 'mensaje' => 'La contraseña debe tener al menos 8 caracteres.'], 422);
    }
    if (!in_array($alcance, ['total', 'balto'], true)) {
        registro_out(['exito' => false, 'mensaje' => 'Tipo de acceso inválido.'], 422);
    }

    $check = $pdo->prepare("
        SELECT idUsuario
        FROM usuarios
        WHERE UPPER(Nombre_Completo) = UPPER(:nombre)
        LIMIT 1
    ");
    $check->execute([':nombre' => $nombre]);
    if ($check->fetchColumn()) {
        registro_out(['exito' => false, 'mensaje' => 'El usuario ya existe.'], 409);
    }

    $targets = [];
    if ($alcance === 'total') {
        // Para crear un administrador total, quien lo crea debe ser admin en todas las organizaciones activas.
        $activeOrganizations = $pdo->query("
            SELECT id_organizacion, codigo, nombre
            FROM organizaciones
            WHERE activo = 1
            ORDER BY id_organizacion
        ")->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $callerAdminIds = [];
        foreach ($caller['organizaciones'] as $org) {
            if (($org['rol'] ?? '') === 'admin') {
                $callerAdminIds[(int)$org['id_organizacion']] = true;
            }
        }

        foreach ($activeOrganizations as $org) {
            $id = (int)$org['id_organizacion'];
            if (!isset($callerAdminIds[$id])) {
                registro_out([
                    'exito' => false,
                    'mensaje' => 'No tenés permisos de administrador en todas las organizaciones.',
                ], 403);
            }
            $targets[] = [
                'id_organizacion' => $id,
                'codigo' => (string)$org['codigo'],
                'nombre' => (string)$org['nombre'],
                'rol' => 'admin',
                'es_predeterminada' => ((string)$org['codigo'] === '3DEVS') ? 1 : 0,
            ];
        }
    } else {
        $stBalto = $pdo->prepare("
            SELECT id_organizacion, codigo, nombre
            FROM organizaciones
            WHERE codigo = 'BALTO' AND activo = 1
            LIMIT 1
        ");
        $stBalto->execute();
        $balto = $stBalto->fetch(PDO::FETCH_ASSOC);
        if (!$balto) {
            registro_out(['exito' => false, 'mensaje' => 'La organización BALTO no está disponible.'], 409);
        }

        $callerCanManageBalto = false;
        foreach ($caller['organizaciones'] as $org) {
            if ((int)$org['id_organizacion'] === (int)$balto['id_organizacion'] && ($org['rol'] ?? '') === 'admin') {
                $callerCanManageBalto = true;
                break;
            }
        }
        if (!$callerCanManageBalto) {
            registro_out(['exito' => false, 'mensaje' => 'No tenés permisos para crear usuarios de BALTO.'], 403);
        }

        $targets[] = [
            'id_organizacion' => (int)$balto['id_organizacion'],
            'codigo' => (string)$balto['codigo'],
            'nombre' => (string)$balto['nombre'],
            'rol' => 'contador',
            'es_predeterminada' => 1,
        ];
    }

    $pdo->beginTransaction();

    $hash = password_hash($contrasena, PASSWORD_BCRYPT);
    $globalRole = $alcance === 'total' ? 'admin' : 'contador';

    $insertUser = $pdo->prepare("
        INSERT INTO usuarios (Nombre_Completo, Hash_Contrasena, rol)
        VALUES (:nombre, :hash, :rol)
    ");
    $insertUser->execute([
        ':nombre' => $nombre,
        ':hash' => $hash,
        ':rol' => $globalRole,
    ]);
    $idUsuario = (int)$pdo->lastInsertId();

    $insertAccess = $pdo->prepare("
        INSERT INTO usuarios_organizaciones
            (id_usuario, id_organizacion, rol, activo, es_predeterminada)
        VALUES
            (:id_usuario, :id_organizacion, :rol, 1, :es_predeterminada)
    ");

    foreach ($targets as $target) {
        $insertAccess->execute([
            ':id_usuario' => $idUsuario,
            ':id_organizacion' => (int)$target['id_organizacion'],
            ':rol' => (string)$target['rol'],
            ':es_predeterminada' => (int)$target['es_predeterminada'],
        ]);
    }

    $pdo->commit();

    registro_out([
        'exito' => true,
        'mensaje' => $alcance === 'total'
            ? 'Usuario con control total creado.'
            : 'Usuario con acceso exclusivo a BALTO creado.',
        'usuario' => [
            'idUsuario' => $idUsuario,
            'Nombre_Completo' => $nombre,
            'rol' => $globalRole,
            'organizaciones' => $targets,
        ],
    ]);
} catch (Throwable $e) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);
    echo json_encode([
        'exito' => false,
        'mensaje' => 'Error del servidor al registrar el usuario.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
