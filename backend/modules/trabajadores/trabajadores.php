<?php
// backend/modules/trabajadores/trabajadores.php
declare(strict_types=1);

require_once __DIR__ . '/../reparto/reparto.service.php';

global $pdo;
$op = strtolower(trim((string)($_GET['op'] ?? '')));

if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
}

function trab_ok(array $extra = []): never
{
    http_response_code(200);
    echo json_encode(array_merge(['exito' => true], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

function trab_fail(string $mensaje, int $status = 200, array $extra = []): never
{
    http_response_code($status);
    echo json_encode(array_merge(['exito' => false, 'mensaje' => $mensaje], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

function trab_body(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? $data : [];
}

function trab_method(string $expected): void
{
    if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== strtoupper($expected)) {
        trab_fail("Método no permitido. Se esperaba $expected.", 405);
    }
}

function trab_auth(): array
{
    $ctx = $GLOBALS['TRABAJADORES_AUTH'] ?? null;
    if (!is_array($ctx) || empty($ctx['id_organizacion'])) {
        trab_fail('No se pudo resolver la organización activa.', 401);
    }
    return $ctx;
}

function trab_org_id(): int
{
    return (int)trab_auth()['id_organizacion'];
}

function trab_require_write(): array
{
    $ctx = trab_auth();
    if (!in_array((string)($ctx['rol_organizacion'] ?? 'vista'), ['admin', 'contador'], true)) {
        trab_fail('No tenés permisos para modificar trabajadores en esta entidad.', 403);
    }
    return $ctx;
}

function trab_table_exists(PDO $pdo, string $table): bool
{
    static $cache = [];
    if (array_key_exists($table, $cache)) return $cache[$table];

    $st = $pdo->prepare("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t");
    $st->execute([':t' => $table]);
    return $cache[$table] = ((int)$st->fetchColumn() > 0);
}

function trab_membership_exists(PDO $pdo, int $org, int $worker, bool $activeOnly = false): bool
{
    $sql = "SELECT 1 FROM trabajadores_organizaciones WHERE id_organizacion = :org AND id_trabajador = :worker";
    if ($activeOnly) $sql .= " AND activo = 1";
    $sql .= " LIMIT 1";
    $st = $pdo->prepare($sql);
    $st->execute([':org' => $org, ':worker' => $worker]);
    return (bool)$st->fetchColumn();
}

function trab_worker_row(PDO $pdo, int $org, int $worker): ?array
{
    $st = $pdo->prepare("
        SELECT
            t.id, t.nombre, t.apellido, t.email, t.alias_pago,
            tro.rol_en_organizacion AS rol,
            tro.activo,
            tro.fecha_desde,
            tro.fecha_hasta,
            t.fecha_alta
        FROM trabajadores_organizaciones tro
        INNER JOIN trabajadores t ON t.id = tro.id_trabajador
        WHERE tro.id_organizacion = :org
          AND tro.id_trabajador = :worker
        LIMIT 1
    ");
    $st->execute([':org' => $org, ':worker' => $worker]);
    return $st->fetch(PDO::FETCH_ASSOC) ?: null;
}

function trab_api_root(): string
{
    $root = realpath(__DIR__ . '/../../');
    return rtrim($root ?: (__DIR__ . '/../../'), DIRECTORY_SEPARATOR);
}

function trab_public_api_base(): string
{
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $scheme = $https ? 'https' : 'http';
    $host = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    $script = (string)($_SERVER['SCRIPT_NAME'] ?? '');
    $pos = strpos($script, '/api/');
    $basePath = $pos !== false ? substr($script, 0, $pos + 4) : '/api';
    return $scheme . '://' . $host . rtrim($basePath, '/');
}

function trab_upload(string $subdir): array
{
    if (!isset($_FILES['comprobante']) || !is_array($_FILES['comprobante'])) {
        throw new RuntimeException('No llegó ningún archivo comprobante.');
    }

    $f = $_FILES['comprobante'];
    $error = (int)($f['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error !== UPLOAD_ERR_OK) throw new RuntimeException('Error subiendo archivo. Código: ' . $error);

    $tmp = (string)($f['tmp_name'] ?? '');
    $name = (string)($f['name'] ?? 'comprobante');
    $size = (int)($f['size'] ?? 0);
    if ($tmp === '' || !is_uploaded_file($tmp)) throw new RuntimeException('Archivo inválido.');
    if ($size <= 0 || $size > 8 * 1024 * 1024) throw new RuntimeException('El archivo debe pesar como máximo 8 MB.');

    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if ($ext === 'jpeg') $ext = 'jpg';
    if (!in_array($ext, ['pdf', 'jpg', 'png', 'webp'], true)) {
        throw new RuntimeException('Solo se permiten PDF, JPG, PNG o WEBP.');
    }

    $safe = preg_replace('/[^a-zA-Z0-9_-]+/', '_', pathinfo($name, PATHINFO_FILENAME)) ?: 'comprobante';
    $file = date('Ymd_His') . '_' . bin2hex(random_bytes(5)) . '_' . trim($safe, '_') . '.' . $ext;
    $relative = 'uploads/' . trim($subdir, '/\\');
    $dir = trab_api_root() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException('No se pudo crear la carpeta de comprobantes.');
    }

    $dest = $dir . DIRECTORY_SEPARATOR . $file;
    if (!move_uploaded_file($tmp, $dest)) throw new RuntimeException('No se pudo guardar el archivo.');

    $mime = function_exists('mime_content_type') ? (mime_content_type($dest) ?: null) : null;
    return [
        'archivo_url' => trab_public_api_base() . '/' . $relative . '/' . $file,
        'archivo_nombre' => $name,
        'archivo_tipo' => $mime,
        'archivo_size' => $size,
    ];
}

try {
    if (!($pdo instanceof PDO)) trab_fail('Conexión PDO no disponible.', 500);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('SET NAMES utf8mb4');

    $org = trab_org_id();

    switch ($op) {
        case 'listar': {
            $soloActivos = isset($_GET['activos']) ? (int)$_GET['activos'] : 1;
            $sql = "
                SELECT
                    t.id, t.nombre, t.apellido, t.email, t.alias_pago,
                    tro.rol_en_organizacion AS rol,
                    tro.activo,
                    tro.fecha_desde,
                    tro.fecha_hasta,
                    t.fecha_alta,
                    (
                        SELECT GROUP_CONCAT(o2.codigo ORDER BY o2.codigo SEPARATOR ',')
                        FROM trabajadores_organizaciones tro2
                        INNER JOIN organizaciones o2 ON o2.id_organizacion = tro2.id_organizacion
                        WHERE tro2.id_trabajador = t.id
                          AND tro2.activo = 1
                    ) AS entidades_codigos,
                    (
                        SELECT tc.archivo_url
                        FROM trabajadores_comprobantes tc
                        WHERE tc.id_organizacion = tro.id_organizacion
                          AND tc.id_trabajador = t.id
                        ORDER BY tc.created_at DESC, tc.id DESC
                        LIMIT 1
                    ) AS comprobante_pago,
                    (
                        SELECT tc.created_at
                        FROM trabajadores_comprobantes tc
                        WHERE tc.id_organizacion = tro.id_organizacion
                          AND tc.id_trabajador = t.id
                        ORDER BY tc.created_at DESC, tc.id DESC
                        LIMIT 1
                    ) AS comprobante_pago_fecha
                FROM trabajadores_organizaciones tro
                INNER JOIN trabajadores t ON t.id = tro.id_trabajador
                WHERE tro.id_organizacion = :org
            ";
            if ($soloActivos === 1) $sql .= ' AND tro.activo = 1';
            if ($soloActivos === 0) $sql .= ' AND tro.activo = 0';
            $sql .= ' ORDER BY t.apellido, t.nombre, t.id';

            $st = $pdo->prepare($sql);
            $st->execute([':org' => $org]);
            trab_ok(['data' => $st->fetchAll(PDO::FETCH_ASSOC)]);
        }

        case 'disponibles': {
            $st = $pdo->prepare("
                SELECT t.id, t.nombre, t.apellido, t.email, t.alias_pago, t.rol,
                       (
                         SELECT GROUP_CONCAT(o2.codigo ORDER BY o2.codigo SEPARATOR ',')
                         FROM trabajadores_organizaciones tro2
                         INNER JOIN organizaciones o2 ON o2.id_organizacion=tro2.id_organizacion
                         WHERE tro2.id_trabajador=t.id AND tro2.activo=1
                       ) AS entidades_codigos
                FROM trabajadores t
                WHERE t.activo = 1
                  AND NOT EXISTS (
                      SELECT 1 FROM trabajadores_organizaciones tro
                      WHERE tro.id_organizacion = :org
                        AND tro.id_trabajador = t.id
                  )
                ORDER BY t.apellido, t.nombre
            ");
            $st->execute([':org' => $org]);
            trab_ok(['data' => $st->fetchAll(PDO::FETCH_ASSOC)]);
        }

        case 'get': {
            $id = (int)($_GET['id'] ?? 0);
            if ($id <= 0) trab_fail('ID inválido.', 422);
            $row = trab_worker_row($pdo, $org, $id);
            trab_ok(['data' => $row, 'encontrado' => (bool)$row]);
        }

        case 'crear': {
            trab_method('POST');
            trab_require_write();
            $body = trab_body();

            $existingId = (int)($body['id_trabajador_existente'] ?? 0);
            $role = strtolower(trim((string)($body['rol'] ?? 'vista')));
            $validRoles = ['admin', 'contador', 'desarrollador', 'soporte', 'vista'];
            if (!in_array($role, $validRoles, true)) $role = 'vista';

            if ($existingId > 0) {
                $st = $pdo->prepare('SELECT id FROM trabajadores WHERE id = :id AND activo = 1 LIMIT 1');
                $st->execute([':id' => $existingId]);
                if (!$st->fetchColumn()) trab_fail('El trabajador seleccionado no existe o está inactivo.', 404);

                $link = $pdo->prepare("
                    INSERT INTO trabajadores_organizaciones
                        (id_organizacion, id_trabajador, rol_en_organizacion, activo, fecha_desde, fecha_hasta)
                    VALUES (:org, :worker, :role, 1, CURRENT_DATE, NULL)
                    ON DUPLICATE KEY UPDATE
                        rol_en_organizacion = VALUES(rol_en_organizacion),
                        activo = 1,
                        fecha_hasta = NULL,
                        updated_at = NOW()
                ");
                $link->execute([':org' => $org, ':worker' => $existingId, ':role' => $role]);
                trab_ok(['id' => $existingId, 'vinculado' => true, 'mensaje' => 'Trabajador vinculado a la entidad.']);
            }

            $name = trim((string)($body['nombre'] ?? ''));
            $last = trim((string)($body['apellido'] ?? ''));
            $email = trim((string)($body['email'] ?? ''));
            $alias = trim((string)($body['alias_pago'] ?? ''));
            if ($name === '' || $last === '') trab_fail('Nombre y apellido son obligatorios.', 422);
            if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) trab_fail('El email no es válido.', 422);

            $pdo->beginTransaction();
            $workerId = 0;

            if ($email !== '') {
                $find = $pdo->prepare('SELECT id FROM trabajadores WHERE LOWER(email) = LOWER(:email) LIMIT 1');
                $find->execute([':email' => $email]);
                $workerId = (int)($find->fetchColumn() ?: 0);
            }

            if ($workerId <= 0) {
                $ins = $pdo->prepare("
                    INSERT INTO trabajadores
                        (id_organizacion, nombre, apellido, email, rol, alias_pago, activo)
                    VALUES (:org, :nombre, :apellido, :email, :rol, :alias, 1)
                ");
                $legacyRole = in_array($role, ['admin', 'desarrollador', 'soporte', 'vista'], true) ? $role : 'vista';
                $ins->execute([
                    ':org' => $org,
                    ':nombre' => $name,
                    ':apellido' => $last,
                    ':email' => $email !== '' ? $email : null,
                    ':rol' => $legacyRole,
                    ':alias' => $alias !== '' ? $alias : null,
                ]);
                $workerId = (int)$pdo->lastInsertId();
            }

            $link = $pdo->prepare("
                INSERT INTO trabajadores_organizaciones
                    (id_organizacion, id_trabajador, rol_en_organizacion, activo, fecha_desde, fecha_hasta)
                VALUES (:org, :worker, :role, 1, CURRENT_DATE, NULL)
                ON DUPLICATE KEY UPDATE
                    rol_en_organizacion = VALUES(rol_en_organizacion),
                    activo = 1,
                    fecha_hasta = NULL,
                    updated_at = NOW()
            ");
            $link->execute([':org' => $org, ':worker' => $workerId, ':role' => $role]);
            $pdo->commit();

            trab_ok([
                'id' => $workerId,
                'reutilizado' => $email !== '' && trab_membership_exists($pdo, $org, $workerId, true),
                'mensaje' => 'Trabajador guardado y vinculado a la entidad.',
            ]);
        }

        case 'editar': {
            trab_method('POST');
            trab_require_write();
            $body = trab_body();
            $id = (int)($body['id'] ?? 0);
            if ($id <= 0 || !trab_membership_exists($pdo, $org, $id)) trab_fail('Trabajador inexistente en esta entidad.', 404);

            $name = trim((string)($body['nombre'] ?? ''));
            $last = trim((string)($body['apellido'] ?? ''));
            $email = trim((string)($body['email'] ?? ''));
            $alias = trim((string)($body['alias_pago'] ?? ''));
            $role = strtolower(trim((string)($body['rol'] ?? 'vista')));
            $validRoles = ['admin', 'contador', 'desarrollador', 'soporte', 'vista'];
            if (!in_array($role, $validRoles, true)) $role = 'vista';
            if ($name === '' || $last === '') trab_fail('Nombre y apellido son obligatorios.', 422);
            if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) trab_fail('El email no es válido.', 422);

            $pdo->beginTransaction();
            $upd = $pdo->prepare('UPDATE trabajadores SET nombre=:n, apellido=:a, email=:e, alias_pago=:alias WHERE id=:id');
            $upd->execute([':n' => $name, ':a' => $last, ':e' => $email !== '' ? $email : null, ':alias' => $alias !== '' ? $alias : null, ':id' => $id]);

            $active = array_key_exists('activo', $body) ? (int)(bool)$body['activo'] : 1;
            $updMem = $pdo->prepare("
                UPDATE trabajadores_organizaciones
                SET rol_en_organizacion = :role,
                    activo = :active,
                    fecha_hasta = CASE WHEN :active2 = 1 THEN NULL ELSE COALESCE(fecha_hasta, CURRENT_DATE) END,
                    updated_at = NOW()
                WHERE id_organizacion = :org AND id_trabajador = :worker
            ");
            $updMem->execute([':role' => $role, ':active' => $active, ':active2' => $active, ':org' => $org, ':worker' => $id]);
            $pdo->commit();
            trab_ok(['mensaje' => 'Trabajador actualizado.']);
        }

        case 'baja': {
            trab_method('POST');
            trab_require_write();
            $id = (int)(trab_body()['id'] ?? 0);
            if ($id <= 0) trab_fail('ID inválido.', 422);
            $st = $pdo->prepare("
                UPDATE trabajadores_organizaciones
                SET activo = 0, fecha_hasta = CURRENT_DATE, updated_at = NOW()
                WHERE id_organizacion = :org AND id_trabajador = :worker AND activo = 1
            ");
            $st->execute([':org' => $org, ':worker' => $id]);
            if ($st->rowCount() === 0) trab_fail('El trabajador no está activo en esta entidad.', 404);
            trab_ok(['mensaje' => 'Trabajador dado de baja solamente en esta entidad.']);
        }

        case 'reactivar': {
            trab_method('POST');
            trab_require_write();
            $id = (int)(trab_body()['id'] ?? 0);
            if ($id <= 0) trab_fail('ID inválido.', 422);
            $st = $pdo->prepare("
                UPDATE trabajadores_organizaciones
                SET activo = 1, fecha_hasta = NULL, fecha_desde = COALESCE(fecha_desde, CURRENT_DATE), updated_at = NOW()
                WHERE id_organizacion = :org AND id_trabajador = :worker
            ");
            $st->execute([':org' => $org, ':worker' => $id]);
            if ($st->rowCount() === 0 && !trab_membership_exists($pdo, $org, $id)) trab_fail('Trabajador inexistente en esta entidad.', 404);
            trab_ok(['mensaje' => 'Trabajador reactivado en esta entidad.']);
        }

        case 'eliminar': {
            trab_method('POST');
            trab_require_write();
            $id = (int)(trab_body()['id'] ?? 0);
            if ($id <= 0) trab_fail('ID inválido.', 422);

            $references = $pdo->prepare("
                SELECT
                  (SELECT COUNT(*) FROM sistemas_trabajadores WHERE id_organizacion=:org1 AND id_trabajador=:worker1) AS sistemas,
                  (SELECT COUNT(*) FROM egresos WHERE id_organizacion=:org2 AND id_trabajador=:worker2) AS egresos,
                  (SELECT COUNT(*) FROM trabajadores_comprobantes WHERE id_organizacion=:org3 AND id_trabajador=:worker3) AS comprobantes,
                  (SELECT COUNT(*) FROM organizaciones_reparto WHERE id_organizacion=:org4 AND id_trabajador=:worker4) AS repartos
            ");
            $references->execute([
                ':org1' => $org, ':worker1' => $id,
                ':org2' => $org, ':worker2' => $id,
                ':org3' => $org, ':worker3' => $id,
                ':org4' => $org, ':worker4' => $id,
            ]);
            $refsInOrg = $references->fetch(PDO::FETCH_ASSOC) ?: [];
            if (array_sum(array_map('intval', $refsInOrg)) > 0) {
                trab_fail('No se puede desvincular porque tiene asignaciones o registros históricos en esta entidad. Usá Dar de baja para conservar el historial.', 409);
            }

            $pdo->beginTransaction();
            $del = $pdo->prepare('DELETE FROM trabajadores_organizaciones WHERE id_organizacion=:org AND id_trabajador=:worker');
            $del->execute([':org' => $org, ':worker' => $id]);
            if ($del->rowCount() === 0) {
                $pdo->rollBack();
                trab_fail('El trabajador no pertenece a esta entidad.', 404);
            }

            $members = $pdo->prepare('SELECT COUNT(*) FROM trabajadores_organizaciones WHERE id_trabajador=:worker');
            $members->execute([':worker' => $id]);
            $deletedGlobal = false;
            if ((int)$members->fetchColumn() === 0) {
                $refs = $pdo->prepare("
                    SELECT
                      (SELECT COUNT(*) FROM sistemas_trabajadores WHERE id_trabajador=:w1) +
                      (SELECT COUNT(*) FROM egresos WHERE id_trabajador=:w2) +
                      (SELECT COUNT(*) FROM trabajadores_comprobantes WHERE id_trabajador=:w3) +
                      (SELECT COUNT(*) FROM organizaciones_reparto WHERE id_trabajador=:w4) AS refs
                ");
                $refs->execute([':w1' => $id, ':w2' => $id, ':w3' => $id, ':w4' => $id]);
                if ((int)$refs->fetchColumn() === 0) {
                    $pdo->prepare('DELETE FROM trabajadores WHERE id=:id')->execute([':id' => $id]);
                    $deletedGlobal = true;
                }
            }
            $pdo->commit();
            trab_ok(['mensaje' => $deletedGlobal ? 'Trabajador eliminado definitivamente.' : 'Trabajador desvinculado de esta entidad.', 'eliminado_global' => $deletedGlobal]);
        }

        case 'subir_comprobante': {
            trab_method('POST');
            trab_require_write();
            $id = (int)($_POST['id_trabajador'] ?? 0);
            $idMes = isset($_POST['id_mes']) && is_numeric($_POST['id_mes']) ? (int)$_POST['id_mes'] : null;
            $anio = isset($_POST['anio']) && is_numeric($_POST['anio']) ? (int)$_POST['anio'] : null;
            if ($id <= 0 || !trab_membership_exists($pdo, $org, $id, true)) trab_fail('Trabajador inexistente o inactivo en esta entidad.', 404);

            $file = trab_upload('trabajadores_comprobantes/' . $org . '/' . $id);
            $st = $pdo->prepare("
                INSERT INTO trabajadores_comprobantes
                  (id_organizacion, id_trabajador, id_mes, anio, archivo_url, archivo_nombre, archivo_tipo, archivo_size)
                VALUES
                  (:org, :worker, :mes, :anio, :url, :nombre, :tipo, :size)
            ");
            $st->execute([
                ':org' => $org, ':worker' => $id, ':mes' => $idMes, ':anio' => $anio,
                ':url' => $file['archivo_url'], ':nombre' => $file['archivo_nombre'],
                ':tipo' => $file['archivo_tipo'], ':size' => $file['archivo_size'],
            ]);
            trab_ok(['id' => (int)$pdo->lastInsertId(), 'comprobante' => $file]);
        }

        case 'comprobante_latest':
        case 'comprobantes_listar': {
            $id = (int)($_GET['id'] ?? 0);
            if ($id <= 0 || !trab_membership_exists($pdo, $org, $id)) trab_fail('Trabajador inexistente en esta entidad.', 404);
            $limit = $op === 'comprobante_latest' ? ' LIMIT 1' : '';
            $st = $pdo->prepare("
                SELECT id, id_trabajador, id_mes, anio, archivo_url, archivo_nombre, archivo_tipo, archivo_size, created_at
                FROM trabajadores_comprobantes
                WHERE id_organizacion=:org AND id_trabajador=:worker
                ORDER BY created_at DESC, id DESC $limit
            ");
            $st->execute([':org' => $org, ':worker' => $id]);
            $data = $op === 'comprobante_latest' ? ($st->fetch(PDO::FETCH_ASSOC) ?: null) : $st->fetchAll(PDO::FETCH_ASSOC);
            trab_ok(['data' => $data]);
        }

        case 'reparto_listar': {
            $orgConfig = reparto_organizacion_config($pdo, $org);
            if (!trab_table_exists($pdo, 'organizaciones_reparto')) trab_fail('Falta ejecutar la migración de reparto contable.', 409);

            $st = $pdo->prepare("
                SELECT
                    r.id_reparto,
                    r.tipo_beneficiario,
                    r.id_trabajador,
                    r.id_organizacion_beneficiaria,
                    r.porcentaje,
                    r.fecha_desde,
                    r.fecha_hasta,
                    CASE
                        WHEN r.tipo_beneficiario='trabajador' THEN CONCAT(t.apellido, ', ', t.nombre)
                        ELSE ob.nombre
                    END AS beneficiario_nombre
                FROM organizaciones_reparto r
                LEFT JOIN trabajadores t ON t.id = r.id_trabajador
                LEFT JOIN organizaciones ob ON ob.id_organizacion = r.id_organizacion_beneficiaria
                WHERE r.id_organizacion=:org AND r.activo=1 AND r.fecha_hasta IS NULL
                ORDER BY r.tipo_beneficiario, beneficiario_nombre
            ");
            $st->execute([':org' => $org]);

            $workers = $pdo->prepare("
                SELECT t.id, t.nombre, t.apellido, tro.rol_en_organizacion AS rol
                FROM trabajadores_organizaciones tro
                INNER JOIN trabajadores t ON t.id=tro.id_trabajador
                WHERE tro.id_organizacion=:org AND tro.activo=1
                ORDER BY t.apellido, t.nombre
            ");
            $workers->execute([':org' => $org]);

            $orgs = $pdo->prepare('SELECT id_organizacion, codigo, nombre FROM organizaciones WHERE activo=1 AND id_organizacion<>:org ORDER BY nombre');
            $orgs->execute([':org' => $org]);

            trab_ok([
                'modelo_reparto' => $orgConfig['modelo_reparto'],
                'organizacion' => $orgConfig,
                'items' => $st->fetchAll(PDO::FETCH_ASSOC),
                'trabajadores' => $workers->fetchAll(PDO::FETCH_ASSOC),
                'organizaciones' => $orgs->fetchAll(PDO::FETCH_ASSOC),
            ]);
        }

        case 'reparto_guardar': {
            trab_method('POST');
            $ctx = trab_require_write();
            $items = trab_body()['items'] ?? [];
            $orgConfig = reparto_organizacion_config($pdo, $org);
            if (!is_array($items) || count($items) === 0) trab_fail('Agregá al menos un beneficiario.', 422);

            $normalized = [];
            $total = 0.0;
            $seen = [];
            foreach ($items as $item) {
                $type = strtolower(trim((string)($item['tipo_beneficiario'] ?? '')));
                $pct = round((float)($item['porcentaje'] ?? 0), 4);
                if (!in_array($type, ['trabajador', 'organizacion'], true) || $pct <= 0 || $pct > 100) {
                    trab_fail('Hay un beneficiario o porcentaje inválido.', 422);
                }

                $worker = $type === 'trabajador' ? (int)($item['id_trabajador'] ?? 0) : null;
                $benefOrg = $type === 'organizacion' ? (int)($item['id_organizacion_beneficiaria'] ?? 0) : null;
                $key = $type . ':' . ($worker ?: $benefOrg);
                if (isset($seen[$key])) trab_fail('No se puede repetir el mismo beneficiario.', 422);
                $seen[$key] = true;

                if ($type === 'trabajador') {
                    if ($worker <= 0 || !trab_membership_exists($pdo, $org, $worker, true)) {
                        trab_fail('El trabajador beneficiario no está activo en esta entidad.', 422);
                    }
                } else {
                    if ($orgConfig['modelo_reparto'] === 'por_sistema') {
                        trab_fail('El reparto interno de esta entidad solo admite trabajadores.', 422);
                    }
                    if ($benefOrg <= 0 || $benefOrg === $org) trab_fail('La organización beneficiaria es inválida.', 422);
                    $check = $pdo->prepare('SELECT 1 FROM organizaciones WHERE id_organizacion=:id AND activo=1');
                    $check->execute([':id' => $benefOrg]);
                    if (!$check->fetchColumn()) trab_fail('La organización beneficiaria no existe.', 422);
                }

                $total += $pct;
                $normalized[] = compact('type', 'pct', 'worker', 'benefOrg');
            }

            if (abs($total - 100.0) > 0.0001) trab_fail('El reparto debe sumar exactamente 100%. Actualmente suma ' . number_format($total, 4, ',', '.') . '%.', 422);

            $pdo->beginTransaction();
            $close = $pdo->prepare('UPDATE organizaciones_reparto SET activo=0, fecha_hasta=NOW(), updated_at=NOW() WHERE id_organizacion=:org AND activo=1 AND fecha_hasta IS NULL');
            $close->execute([':org' => $org]);

            $ins = $pdo->prepare("
                INSERT INTO organizaciones_reparto
                  (id_organizacion, tipo_beneficiario, id_trabajador, id_organizacion_beneficiaria, porcentaje, fecha_desde, fecha_hasta, activo, created_by)
                VALUES
                  (:org, :type, :worker, :benef_org, :pct, NOW(), NULL, 1, :user)
            ");
            foreach ($normalized as $n) {
                $ins->execute([
                    ':org' => $org,
                    ':type' => $n['type'],
                    ':worker' => $n['worker'],
                    ':benef_org' => $n['benefOrg'],
                    ':pct' => $n['pct'],
                    ':user' => (int)$ctx['id_usuario'],
                ]);
            }
            $pdo->commit();
            trab_ok(['mensaje' => 'Reparto contable guardado.', 'total' => 100]);
        }

        default:
            trab_fail('OP inválida: ' . $op, 404);
    }
} catch (PDOException $e) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
    $mysqlCode = (int)($e->errorInfo[1] ?? 0);
    if ($mysqlCode === 1062) trab_fail('Ya existe una persona con ese correo o vínculo.', 409);
    if ($mysqlCode === 1451) trab_fail('No se puede eliminar porque el trabajador tiene registros relacionados.', 409);
    trab_fail('Error de base de datos al operar trabajadores.', 500, ['detalle' => $e->getMessage()]);
} catch (Throwable $e) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
    trab_fail($e->getMessage() ?: 'Error interno al operar trabajadores.', 500);
}
