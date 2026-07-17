<?php
// backend/modules/auth/session.php
declare(strict_types=1);

/**
 * Autenticación por sesión para la aplicación multiempresa.
 *
 * Headers aceptados:
 * - X-Session: token hexadecimal de 64 caracteres
 * - Authorization: Bearer <token> (compatibilidad)
 * - X-Organization: id de la organización seleccionada
 */

function auth_header(string $name): ?string
{
    $wanted = strtolower($name);

    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (is_array($headers)) {
            foreach ($headers as $key => $value) {
                if (strtolower((string)$key) === $wanted) {
                    return trim((string)$value);
                }
            }
        }
    }

    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    if (isset($_SERVER[$serverKey])) {
        return trim((string)$_SERVER[$serverKey]);
    }

    return null;
}

function auth_json_error(string $mensaje, int $status = 401, array $extra = []): never
{
    http_response_code($status);
    echo json_encode(array_merge([
        'exito' => false,
        'mensaje' => $mensaje,
    ], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

function auth_session_key_from_request(): string
{
    $token = trim((string)(auth_header('X-Session') ?? ''));

    if ($token === '') {
        $authorization = trim((string)(auth_header('Authorization') ?? ''));
        if (preg_match('/^Bearer\s+(.+)$/i', $authorization, $m)) {
            $token = trim((string)$m[1]);
        }
    }

    return strtolower($token);
}

function auth_user_organizations(PDO $pdo, int $idUsuario): array
{
    $st = $pdo->prepare("
        SELECT
            o.id_organizacion,
            o.codigo,
            o.nombre,
            LOWER(uo.rol) AS rol,
            uo.es_predeterminada
        FROM usuarios_organizaciones uo
        INNER JOIN organizaciones o
            ON o.id_organizacion = uo.id_organizacion
        WHERE uo.id_usuario = :id_usuario
          AND uo.activo = 1
          AND o.activo = 1
        ORDER BY uo.es_predeterminada DESC, o.id_organizacion ASC
    ");
    $st->execute([':id_usuario' => $idUsuario]);

    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    foreach ($rows as &$row) {
        $row['id_organizacion'] = (int)$row['id_organizacion'];
        $row['codigo'] = (string)$row['codigo'];
        $row['nombre'] = (string)$row['nombre'];
        $rol = strtolower((string)($row['rol'] ?? 'vista'));
        $row['rol'] = in_array($rol, ['admin', 'contador', 'vista'], true) ? $rol : 'vista';
        $row['es_predeterminada'] = (int)$row['es_predeterminada'];
    }
    unset($row);

    return $rows;
}

function auth_highest_role(array $organizations): string
{
    $weight = ['vista' => 1, 'contador' => 2, 'admin' => 3];
    $best = 'vista';

    foreach ($organizations as $organization) {
        $role = strtolower((string)($organization['rol'] ?? 'vista'));
        if (($weight[$role] ?? 0) > ($weight[$best] ?? 0)) {
            $best = $role;
        }
    }

    return $best;
}

function auth_create_session(PDO $pdo, int $idUsuario, int $idOrganizacion, int $ttlSeconds = 43200): array
{
    $sessionKey = bin2hex(random_bytes(32));
    $expiresAt = (new DateTimeImmutable('now'))
        ->modify('+' . max(900, $ttlSeconds) . ' seconds')
        ->format('Y-m-d H:i:s');

    $st = $pdo->prepare("
        INSERT INTO sesiones_usuarios
            (session_key, id_usuario, id_organizacion_activa, expires_at, last_activity_at)
        VALUES
            (:session_key, :id_usuario, :id_organizacion, :expires_at, NOW())
    ");
    $st->execute([
        ':session_key' => $sessionKey,
        ':id_usuario' => $idUsuario,
        ':id_organizacion' => $idOrganizacion,
        ':expires_at' => $expiresAt,
    ]);

    return [
        'session_key' => $sessionKey,
        'expires_at' => $expiresAt,
    ];
}

function auth_requested_organization_id(): int
{
    $raw = auth_header('X-Organization');
    if ($raw !== null && ctype_digit(trim($raw))) {
        return (int)$raw;
    }

    // Compatibilidad limitada para pruebas manuales por query string.
    if (isset($_GET['id_organizacion']) && is_numeric($_GET['id_organizacion'])) {
        return (int)$_GET['id_organizacion'];
    }

    return 0;
}

/**
 * Requiere una sesión válida y resuelve una organización autorizada.
 *
 * @param string[]|null $allowedRoles Roles permitidos dentro de la organización activa.
 */
function auth_require_session(PDO $pdo, ?array $allowedRoles = null): array
{
    $sessionKey = auth_session_key_from_request();
    if (!preg_match('/^[a-f0-9]{64}$/', $sessionKey)) {
        auth_json_error('Sesión requerida.', 401, ['codigo' => 'SESSION_REQUIRED']);
    }

    $st = $pdo->prepare("
        SELECT
            s.session_key,
            s.id_usuario,
            s.id_organizacion_activa,
            s.expires_at,
            u.Nombre_Completo,
            LOWER(u.rol) AS rol_global
        FROM sesiones_usuarios s
        INNER JOIN usuarios u ON u.idUsuario = s.id_usuario
        WHERE s.session_key = :session_key
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
        LIMIT 1
    ");
    $st->execute([':session_key' => $sessionKey]);
    $session = $st->fetch(PDO::FETCH_ASSOC);

    if (!$session) {
        auth_json_error('La sesión venció o no es válida.', 401, ['codigo' => 'SESSION_EXPIRED']);
    }

    $idUsuario = (int)$session['id_usuario'];
    $organizations = auth_user_organizations($pdo, $idUsuario);
    if (!$organizations) {
        auth_json_error('El usuario no tiene organizaciones habilitadas.', 403, ['codigo' => 'NO_ORGANIZATIONS']);
    }

    $requestedId = auth_requested_organization_id();
    $activeId = $requestedId > 0
        ? $requestedId
        : (int)($session['id_organizacion_activa'] ?? 0);

    $selected = null;
    foreach ($organizations as $organization) {
        if ((int)$organization['id_organizacion'] === $activeId) {
            $selected = $organization;
            break;
        }
    }

    if ($selected === null && $requestedId > 0) {
        auth_json_error('No tenés acceso a la organización solicitada.', 403, ['codigo' => 'ORGANIZATION_FORBIDDEN']);
    }

    if ($selected === null) {
        $selected = $organizations[0];
        $activeId = (int)$selected['id_organizacion'];
    }

    $role = strtolower((string)($selected['rol'] ?? 'vista'));
    if ($allowedRoles !== null && !in_array($role, $allowedRoles, true)) {
        auth_json_error('No tenés permisos para realizar esta acción.', 403, ['codigo' => 'ROLE_FORBIDDEN']);
    }

    $touch = $pdo->prepare("
        UPDATE sesiones_usuarios
        SET last_activity_at = NOW(), id_organizacion_activa = :id_organizacion
        WHERE session_key = :session_key
    ");
    $touch->execute([
        ':id_organizacion' => $activeId,
        ':session_key' => $sessionKey,
    ]);

    return [
        'session_key' => $sessionKey,
        'id_usuario' => $idUsuario,
        'nombre' => (string)$session['Nombre_Completo'],
        'rol_global' => auth_highest_role($organizations),
        'id_organizacion' => $activeId,
        'organizacion_codigo' => (string)$selected['codigo'],
        'organizacion_nombre' => (string)$selected['nombre'],
        'rol_organizacion' => $role,
        'organizaciones' => $organizations,
        'expires_at' => (string)$session['expires_at'],
    ];
}

function auth_revoke_current_session(PDO $pdo): void
{
    $sessionKey = auth_session_key_from_request();
    if (!preg_match('/^[a-f0-9]{64}$/', $sessionKey)) {
        return;
    }

    $st = $pdo->prepare("
        UPDATE sesiones_usuarios
        SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE session_key = :session_key
    ");
    $st->execute([':session_key' => $sessionKey]);
}
