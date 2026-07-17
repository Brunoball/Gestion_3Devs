<?php
// backend/modules/reportes/registro.php
declare(strict_types=1);

global $pdo;
require_once __DIR__ . '/common.php';
require_once __DIR__ . '/../reparto/reparto.service.php';
require_once __DIR__ . '/periodos.service.php';

$op = strtolower(trim((string)($_GET['op'] ?? '')));

if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');

function repreg_ok(array $extra = []): never
{
    http_response_code(200);
    echo json_encode(array_merge(['exito' => true], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

function repreg_fail(string $mensaje, array $extra = []): never
{
    http_response_code(200);
    echo json_encode(array_merge(['exito' => false, 'mensaje' => $mensaje], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

function repreg_method(): string
{
    return strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
}

function repreg_is_multipart(): bool
{
    $contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? ''));
    return str_contains($contentType, 'multipart/form-data');
}

function repreg_json_body(): array
{
    $raw = trim((string)file_get_contents('php://input'));
    if ($raw === '') return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function repreg_int_query(string $key): int
{
    $value = $_GET[$key] ?? null;
    return ($value !== null && $value !== '' && is_numeric($value)) ? (int)$value : 0;
}

function repreg_column_exists(PDO $pdo, string $table, string $column): bool
{
    static $cache = [];
    $key = $table . '.' . $column;
    if (array_key_exists($key, $cache)) return (bool)$cache[$key];

    $st = $pdo->prepare("
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = :tabla
          AND COLUMN_NAME = :columna
    ");
    $st->execute([':tabla' => $table, ':columna' => $column]);
    $cache[$key] = (int)$st->fetchColumn() > 0;
    return (bool)$cache[$key];
}


function repreg_table_exists(PDO $pdo, string $table): bool
{
    static $cache = [];
    if (array_key_exists($table, $cache)) return (bool)$cache[$table];

    $st = $pdo->prepare("
        SELECT COUNT(*)
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = :tabla
    ");
    $st->execute([':tabla' => $table]);
    $cache[$table] = (int)$st->fetchColumn() > 0;
    return (bool)$cache[$table];
}

function repreg_eligible_payer_worker_ids(PDO $pdo, int $org): array
{
    $ids = [];

    $st = $pdo->prepare("
        SELECT tro.id_trabajador
        FROM trabajadores_organizaciones tro
        INNER JOIN trabajadores t ON t.id = tro.id_trabajador
        WHERE tro.id_organizacion = :org
          AND tro.activo = 1
          AND t.activo = 1
    ");
    $st->execute([':org' => $org]);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) ?: [] as $workerId) {
        $id = (int)$workerId;
        if ($id > 0) $ids[$id] = true;
    }

    foreach (reparto_expandir_organizacion($pdo, $org) as $item) {
        if (($item['tipo_beneficiario'] ?? '') !== 'trabajador') continue;
        $id = (int)($item['id_trabajador'] ?? 0);
        if ($id > 0) $ids[$id] = true;
    }

    return array_keys($ids);
}

function repreg_validate_payer_worker(PDO $pdo, int $org, ?int $id): int
{
    if ($id === null || $id <= 0) repreg_fail('Seleccioná la persona que pagó el egreso.');
    if (!in_array($id, repreg_eligible_payer_worker_ids($pdo, $org), true)) {
        repreg_fail('La persona seleccionada no participa del reparto de la entidad activa.');
    }
    return $id;
}

function repreg_validate_payer_organization(PDO $pdo, int $org, ?int $id): int
{
    if ($id === null || $id <= 0) repreg_fail('Seleccioná la organización que pagó el egreso.');

    foreach (reparto_items_organizacion($pdo, $org) as $item) {
        if (($item['tipo_beneficiario'] ?? '') !== 'organizacion') continue;
        if ((int)($item['id_organizacion_beneficiaria'] ?? 0) === $id) return $id;
    }

    repreg_fail('La organización seleccionada no participa del reparto de la entidad activa.');
}

function repreg_expense_payers_from_body(PDO $pdo, int $org, array $body, float $amount): array
{
    $mode = strtolower(trim((string)($body['tipo_pagador'] ?? '')));

    // Compatibilidad con formularios anteriores.
    if ($mode === '') {
        $legacyWorker = repreg_nullable_uint($body['id_trabajador'] ?? null, 'id_trabajador');
        if ($legacyWorker === null) return [];
        $worker = repreg_validate_payer_worker($pdo, $org, $legacyWorker);
        return [[
            'tipo_pagador' => 'trabajador',
            'id_trabajador' => $worker,
            'id_organizacion_pagadora' => null,
            'monto' => round($amount, 2),
        ]];
    }

    if (!in_array($mode, ['general', 'persona', 'organizacion', 'mixto'], true)) {
        repreg_fail('La forma de pago del egreso es inválida.');
    }
    if ($mode === 'general') return [];

    if (!repreg_table_exists($pdo, 'egresos_pagadores')) {
        repreg_fail('Falta ejecutar la migración de pagadores de egresos.');
    }

    $workerId = repreg_nullable_uint(
        $body['id_trabajador_pagador'] ?? $body['id_trabajador'] ?? null,
        'id_trabajador_pagador'
    );
    $organizationId = repreg_nullable_uint(
        $body['id_organizacion_pagadora'] ?? null,
        'id_organizacion_pagadora'
    );

    $totalCents = (int)round($amount * 100);
    if ($totalCents <= 0) repreg_fail('El monto debe ser mayor a cero.');

    if ($mode === 'persona') {
        $worker = repreg_validate_payer_worker($pdo, $org, $workerId);
        return [[
            'tipo_pagador' => 'trabajador',
            'id_trabajador' => $worker,
            'id_organizacion_pagadora' => null,
            'monto' => $totalCents / 100,
        ]];
    }

    if ($mode === 'organizacion') {
        $organization = repreg_validate_payer_organization($pdo, $org, $organizationId);
        return [[
            'tipo_pagador' => 'organizacion',
            'id_trabajador' => null,
            'id_organizacion_pagadora' => $organization,
            'monto' => $totalCents / 100,
        ]];
    }

    $worker = repreg_validate_payer_worker($pdo, $org, $workerId);
    $organization = repreg_validate_payer_organization($pdo, $org, $organizationId);
    $workerCents = intdiv($totalCents + 1, 2);
    $organizationCents = $totalCents - $workerCents;

    return [
        [
            'tipo_pagador' => 'trabajador',
            'id_trabajador' => $worker,
            'id_organizacion_pagadora' => null,
            'monto' => $workerCents / 100,
        ],
        [
            'tipo_pagador' => 'organizacion',
            'id_trabajador' => null,
            'id_organizacion_pagadora' => $organization,
            'monto' => $organizationCents / 100,
        ],
    ];
}

function repreg_legacy_worker_from_payers(array $payers, float $expenseAmount): ?int
{
    if (count($payers) !== 1) return null;
    $payer = $payers[0];
    if (($payer['tipo_pagador'] ?? '') !== 'trabajador') return null;
    if (abs((float)($payer['monto'] ?? 0) - $expenseAmount) > 0.009) return null;
    $id = (int)($payer['id_trabajador'] ?? 0);
    return $id > 0 ? $id : null;
}

function repreg_save_expense_payers(PDO $pdo, int $expenseId, array $payers): void
{
    if (!repreg_table_exists($pdo, 'egresos_pagadores')) {
        if ($payers) throw new RuntimeException('Falta ejecutar la migración de pagadores de egresos.');
        return;
    }

    $delete = $pdo->prepare('DELETE FROM egresos_pagadores WHERE id_egreso = :expense');
    $delete->execute([':expense' => $expenseId]);

    if (!$payers) return;

    $insert = $pdo->prepare("
        INSERT INTO egresos_pagadores
            (id_egreso, tipo_pagador, id_trabajador, id_organizacion_pagadora, monto)
        VALUES
            (:expense, :type, :worker, :organization, :amount)
    ");
    foreach ($payers as $payer) {
        $insert->execute([
            ':expense' => $expenseId,
            ':type' => (string)$payer['tipo_pagador'],
            ':worker' => $payer['id_trabajador'] ?? null,
            ':organization' => $payer['id_organizacion_pagadora'] ?? null,
            ':amount' => round((float)$payer['monto'], 2),
        ]);
    }
}

function repreg_load_expense_payers(PDO $pdo, array $expenseIds): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $expenseIds), static fn(int $id): bool => $id > 0)));
    if (!$ids || !repreg_table_exists($pdo, 'egresos_pagadores')) return [];

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $st = $pdo->prepare("
        SELECT
            ep.id_egreso, ep.tipo_pagador, ep.id_trabajador,
            ep.id_organizacion_pagadora, ep.monto,
            COALESCE(CONCAT(t.apellido, ' ', t.nombre), '') AS trabajador_nombre,
            COALESCE(o.nombre, '') AS organizacion_nombre,
            COALESCE(o.codigo, '') AS organizacion_codigo
        FROM egresos_pagadores ep
        LEFT JOIN trabajadores t ON t.id = ep.id_trabajador
        LEFT JOIN organizaciones o ON o.id_organizacion = ep.id_organizacion_pagadora
        WHERE ep.id_egreso IN ({$placeholders})
        ORDER BY ep.id_egreso, ep.id_pagador
    ");
    $st->execute($ids);

    $result = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
        $expenseId = (int)$row['id_egreso'];
        $result[$expenseId][] = [
            'tipo_pagador' => (string)$row['tipo_pagador'],
            'id_trabajador' => $row['id_trabajador'] !== null ? (int)$row['id_trabajador'] : null,
            'id_organizacion_pagadora' => $row['id_organizacion_pagadora'] !== null
                ? (int)$row['id_organizacion_pagadora'] : null,
            'monto' => round((float)$row['monto'], 2),
            'trabajador_nombre' => (string)$row['trabajador_nombre'],
            'organizacion_nombre' => (string)$row['organizacion_nombre'],
            'organizacion_codigo' => (string)$row['organizacion_codigo'],
        ];
    }
    return $result;
}

function repreg_valid_date(string $value, string $label = 'fecha'): string
{
    $date = trim($value);
    $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    if (!$dt || $dt->format('Y-m-d') !== $date) {
        repreg_fail("{$label} inválida. Usá el formato AAAA-MM-DD.");
    }
    return $date;
}

function repreg_nullable_uint(mixed $value, string $label): ?int
{
    if ($value === null || $value === '') return null;
    if (!is_numeric($value)) repreg_fail("El campo {$label} debe ser numérico.");
    $number = (int)$value;
    return $number > 0 ? $number : null;
}

function repreg_validate_payment_method(PDO $pdo, int $org, ?int $id, bool $required): ?int
{
    if ($id === null) {
        if ($required) repreg_fail('El medio de pago es obligatorio.');
        return null;
    }

    $st = $pdo->prepare("
        SELECT 1
        FROM medios_pago
        WHERE id_organizacion = :org
          AND id_medio_pago = :id
          AND activo = 1
        LIMIT 1
    ");
    $st->execute([':org' => $org, ':id' => $id]);
    if (!$st->fetchColumn()) repreg_fail('El medio de pago no pertenece a la entidad activa.');
    return $id;
}

function repreg_validate_worker(PDO $pdo, int $org, ?int $id): ?int
{
    if ($id === null) return null;

    $st = $pdo->prepare("
        SELECT 1
        FROM trabajadores_organizaciones tro
        INNER JOIN trabajadores t ON t.id = tro.id_trabajador
        WHERE tro.id_organizacion = :org
          AND tro.id_trabajador = :id
          AND tro.activo = 1
          AND t.activo = 1
        LIMIT 1
    ");
    $st->execute([':org' => $org, ':id' => $id]);
    if (!$st->fetchColumn()) {
        repreg_fail('El trabajador no pertenece o no está activo en la entidad seleccionada.');
    }
    return $id;
}

function repreg_api_root(): string
{
    $root = realpath(__DIR__ . '/../../');
    return rtrim($root ?: (__DIR__ . '/../../'), DIRECTORY_SEPARATOR);
}

function repreg_public_api_base(): string
{
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $scheme = $https ? 'https' : 'http';
    $host = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    $script = (string)($_SERVER['SCRIPT_NAME'] ?? '');
    $position = strpos($script, '/api/');
    $basePath = $position !== false ? substr($script, 0, $position + 4) : rtrim(dirname($script), '/');
    if ($basePath === '' || str_ends_with($basePath, '/api/routes')) $basePath = '/api';
    return $scheme . '://' . $host . $basePath;
}

function repreg_extract_upload_relative(?string $pathOrUrl): string
{
    $value = trim((string)$pathOrUrl);
    if ($value === '') return '';

    if (preg_match('~^https?://~i', $value)) {
        $path = (string)(parse_url($value, PHP_URL_PATH) ?? '');
        $position = stripos($path, '/uploads/');
        return $position === false ? '' : ltrim(substr($path, $position + 1), '/');
    }

    $value = ltrim($value, '/');
    $position = stripos($value, 'uploads/');
    return $position === false ? '' : substr($value, $position);
}

function repreg_delete_upload(?string $pathOrUrl): void
{
    $relative = repreg_extract_upload_relative($pathOrUrl);
    if ($relative === '') return;

    $absolute = repreg_api_root() . DIRECTORY_SEPARATOR
        . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $relative);
    if (is_file($absolute)) @unlink($absolute);
}

function repreg_upload(string $subdir, string $field = 'comprobante'): ?string
{
    if (!isset($_FILES[$field])) return null;
    $file = $_FILES[$field];
    if (!is_array($file)) return null;

    $error = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error === UPLOAD_ERR_NO_FILE) return null;
    if ($error !== UPLOAD_ERR_OK) throw new RuntimeException('Error subiendo archivo. Código: ' . $error);

    $tmp = (string)($file['tmp_name'] ?? '');
    $original = (string)($file['name'] ?? 'comprobante');
    $size = (int)($file['size'] ?? 0);
    if ($tmp === '' || !is_uploaded_file($tmp)) throw new RuntimeException('Archivo inválido.');
    if ($size <= 0 || $size > 8 * 1024 * 1024) throw new RuntimeException('El archivo debe pesar como máximo 8MB.');

    $extension = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    if ($extension === 'jpeg') $extension = 'jpg';
    if (!in_array($extension, ['pdf', 'jpg', 'png', 'webp'], true)) {
        throw new RuntimeException('Solo se permiten PDF, JPG, PNG o WEBP.');
    }

    $mime = function_exists('mime_content_type') ? (string)(mime_content_type($tmp) ?: '') : '';
    if ($mime !== '' && !in_array($mime, ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], true)) {
        throw new RuntimeException('Tipo de archivo no permitido.');
    }

    $safeBase = trim((string)preg_replace('/[^a-zA-Z0-9_-]+/', '_', pathinfo($original, PATHINFO_FILENAME)), '_');
    if ($safeBase === '') $safeBase = 'comprobante';
    $safeBase = function_exists('mb_substr') ? mb_substr($safeBase, 0, 80) : substr($safeBase, 0, 80);
    $filename = date('Ymd_His') . '_' . bin2hex(random_bytes(5)) . '_' . $safeBase . '.' . $extension;
    $cleanSubdir = trim($subdir, '/\\');
    $destinationDir = repreg_api_root() . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR
        . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $cleanSubdir);

    if (!is_dir($destinationDir) && !mkdir($destinationDir, 0775, true) && !is_dir($destinationDir)) {
        throw new RuntimeException('No se pudo crear la carpeta de comprobantes.');
    }

    $destination = $destinationDir . DIRECTORY_SEPARATOR . $filename;
    if (!move_uploaded_file($tmp, $destination)) throw new RuntimeException('No se pudo guardar el archivo.');

    return repreg_public_api_base() . '/uploads/' . $cleanSubdir . '/' . $filename;
}

try {
    if (!($pdo instanceof PDO)) repreg_fail('Conexión PDO no disponible.');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('SET NAMES utf8mb4');

    $org = reportes_org_id();

    if (!in_array($op, [
        'movimientos', 'registros', 'crear_egreso', 'editar_movimiento',
        'eliminar_egreso', 'pago_comprobante',
    ], true)) {
        repreg_fail('op no válida en reportes/registro: ' . $op);
    }

    if ($op === 'pago_comprobante') {
        reportes_require_write();
        if (repreg_method() !== 'POST' || !repreg_is_multipart()) {
            repreg_fail('Se esperaba POST multipart/form-data.');
        }
        if (!repreg_column_exists($pdo, 'pagos', 'comprobante')) {
            repreg_fail('Falta ejecutar la migración de Reportes que agrega pagos.comprobante.');
        }

        $idPago = (int)($_POST['id'] ?? $_POST['id_pago'] ?? 0);
        if ($idPago <= 0) repreg_fail('ID de pago inválido.');

        $st = $pdo->prepare('SELECT comprobante FROM pagos WHERE id_organizacion=:org AND id_pago=:id LIMIT 1');
        $st->execute([':org' => $org, ':id' => $idPago]);
        $current = $st->fetch(PDO::FETCH_ASSOC);
        if (!$current) repreg_fail('El pago no existe en la entidad seleccionada.');

        $oldPath = trim((string)($current['comprobante'] ?? ''));
        $delete = in_array(strtolower(trim((string)($_POST['delete_comprobante'] ?? '0'))), ['1', 'true'], true);
        $uploaded = repreg_upload('pagos/' . $org . '/' . $idPago, 'comprobante');
        if (!$delete && !$uploaded) repreg_fail('No se recibió un archivo.');

        $newPath = $delete ? null : ($oldPath !== '' ? $oldPath : null);
        if ($uploaded) $newPath = $uploaded;

        try {
            $up = $pdo->prepare('UPDATE pagos SET comprobante=:path WHERE id_organizacion=:org AND id_pago=:id');
            $up->execute([':path' => $newPath, ':org' => $org, ':id' => $idPago]);
        } catch (Throwable $e) {
            // Si la base rechaza la actualización, no dejar un archivo huérfano.
            if ($uploaded) repreg_delete_upload($uploaded);
            throw $e;
        }

        if (($delete || $uploaded) && $oldPath !== '' && $oldPath !== (string)$newPath) {
            repreg_delete_upload($oldPath);
        }
        repreg_ok(['mensaje' => 'Comprobante de pago actualizado.', 'comprobante' => $newPath ?? '']);
    }

    if ($op === 'crear_egreso') {
        reportes_require_write();
        if (repreg_method() !== 'POST') repreg_fail('Método no permitido. Se esperaba POST.');
        $body = repreg_is_multipart() ? ($_POST ?? []) : repreg_json_body();

        $fecha = repreg_valid_date((string)($body['fecha'] ?? ''));
        [$expenseMonth, $expenseYear] = reportes_periodo_desde_fecha($fecha);
        try { reportes_periodo_assert_abierto($pdo, $org, $expenseMonth, $expenseYear); }
        catch (Throwable $e) { repreg_fail($e->getMessage()); }
        $concepto = trim((string)($body['concepto'] ?? ''));
        $descripcion = trim((string)($body['descripcion'] ?? ''));
        $monto = is_numeric($body['monto'] ?? null) ? round((float)$body['monto'], 2) : 0.0;
        if ($concepto === '') repreg_fail('El concepto es obligatorio.');
        if ($monto <= 0) repreg_fail('El monto debe ser mayor a cero.');

        $medio = repreg_validate_payment_method(
            $pdo,
            $org,
            repreg_nullable_uint($body['id_medio_pago'] ?? null, 'id_medio_pago'),
            false
        );
        $payers = repreg_expense_payers_from_body($pdo, $org, $body, $monto);
        $legacyWorker = repreg_legacy_worker_from_payers($payers, $monto);
        $proof = repreg_is_multipart() ? repreg_upload('egresos/' . $org, 'comprobante') : null;

        $expenseId = 0;
        $pdo->beginTransaction();
        try {
            $st = $pdo->prepare("
                INSERT INTO egresos
                    (id_organizacion, fecha, concepto, descripcion, monto,
                     id_medio_pago, id_trabajador, comprobante)
                VALUES
                    (:org, :fecha, :concepto, :descripcion, :monto,
                     :medio, :trabajador, :comprobante)
            ");
            $st->execute([
                ':org' => $org,
                ':fecha' => $fecha,
                ':concepto' => $concepto,
                ':descripcion' => $descripcion !== '' ? $descripcion : null,
                ':monto' => $monto,
                ':medio' => $medio,
                ':trabajador' => $legacyWorker,
                ':comprobante' => $proof,
            ]);
            $expenseId = (int)$pdo->lastInsertId();
            repreg_save_expense_payers($pdo, $expenseId, $payers);
            reparto_resumen_egreso($pdo, $org, $expenseId, $payers, true);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if ($proof) repreg_delete_upload($proof);
            throw $e;
        }

        repreg_ok([
            'id' => $expenseId,
            'comprobante' => $proof,
            'id_trabajador' => $legacyWorker,
            'pagadores' => $payers,
            'mensaje' => 'Egreso creado correctamente.',
        ]);
    }

    if ($op === 'editar_movimiento') {
        reportes_require_write();
        if (repreg_method() !== 'POST') repreg_fail('Método no permitido. Se esperaba POST.');
        $multipart = repreg_is_multipart();
        $body = $multipart ? ($_POST ?? []) : repreg_json_body();
        $type = strtolower(trim((string)($body['tipo'] ?? '')));
        $id = (int)($body['id'] ?? 0);
        if ($id <= 0) repreg_fail('ID inválido.');

        if ($type === 'egreso') {
            $fecha = repreg_valid_date((string)($body['fecha'] ?? ''));
            [$newExpenseMonth, $newExpenseYear] = reportes_periodo_desde_fecha($fecha);
            try { reportes_periodo_assert_abierto($pdo, $org, $newExpenseMonth, $newExpenseYear); }
            catch (Throwable $e) { repreg_fail($e->getMessage()); }
            $concepto = trim((string)($body['concepto'] ?? ''));
            $descripcion = trim((string)($body['descripcion'] ?? ''));
            $monto = is_numeric($body['monto'] ?? null) ? round((float)$body['monto'], 2) : 0.0;
            if ($concepto === '') repreg_fail('El concepto es obligatorio.');
            if ($monto <= 0) repreg_fail('El monto debe ser mayor a cero.');

            $medio = repreg_validate_payment_method(
                $pdo, $org,
                repreg_nullable_uint($body['id_medio_pago'] ?? null, 'id_medio_pago'),
                false
            );
            $payers = repreg_expense_payers_from_body($pdo, $org, $body, $monto);
            $legacyWorker = repreg_legacy_worker_from_payers($payers, $monto);

            $cur = $pdo->prepare('SELECT fecha, comprobante FROM egresos WHERE id_organizacion=:org AND id_egreso=:id LIMIT 1');
            $cur->execute([':org' => $org, ':id' => $id]);
            $row = $cur->fetch(PDO::FETCH_ASSOC);
            if (!$row) repreg_fail('El egreso no existe en la entidad seleccionada.');
            [$oldExpenseMonth, $oldExpenseYear] = reportes_periodo_desde_fecha((string)$row['fecha']);
            try { reportes_periodo_assert_abierto($pdo, $org, $oldExpenseMonth, $oldExpenseYear); }
            catch (Throwable $e) { repreg_fail($e->getMessage()); }

            $oldPath = trim((string)($row['comprobante'] ?? ''));
            $delete = in_array(strtolower(trim((string)($body['delete_comprobante'] ?? '0'))), ['1', 'true'], true);
            $uploaded = $multipart ? repreg_upload('egresos/' . $org, 'comprobante') : null;
            $newPath = $delete ? null : ($oldPath !== '' ? $oldPath : null);
            if ($uploaded) $newPath = $uploaded;

            $pdo->beginTransaction();
            try {
                reparto_egreso_snapshot_eliminar($pdo, $org, $id);
                $up = $pdo->prepare("
                    UPDATE egresos
                    SET fecha=:fecha, concepto=:concepto, descripcion=:descripcion,
                        monto=:monto, id_medio_pago=:medio, id_trabajador=:trabajador,
                        comprobante=:comprobante
                    WHERE id_organizacion=:org AND id_egreso=:id
                ");
                $up->execute([
                    ':fecha' => $fecha,
                    ':concepto' => $concepto,
                    ':descripcion' => $descripcion !== '' ? $descripcion : null,
                    ':monto' => $monto,
                    ':medio' => $medio,
                    ':trabajador' => $legacyWorker,
                    ':comprobante' => $newPath,
                    ':org' => $org,
                    ':id' => $id,
                ]);
                repreg_save_expense_payers($pdo, $id, $payers);
                reparto_resumen_egreso($pdo, $org, $id, $payers, true);
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                if ($uploaded) repreg_delete_upload($uploaded);
                throw $e;
            }

            if (($delete || $uploaded) && $oldPath !== '' && $oldPath !== (string)$newPath) {
                repreg_delete_upload($oldPath);
            }
            repreg_ok([
                'mensaje' => 'Egreso actualizado.',
                'comprobante' => $newPath ?? '',
                'pagadores' => $payers,
            ]);
        }

        if ($type === 'pago') {
            $fecha = repreg_valid_date((string)($body['fecha'] ?? ''), 'Fecha de pago');
            $monto = is_numeric($body['monto'] ?? null) ? round((float)$body['monto'], 2) : 0.0;
            if ($monto <= 0) repreg_fail('El monto debe ser mayor a cero.');
            $medio = repreg_validate_payment_method(
                $pdo, $org,
                repreg_nullable_uint($body['id_medio_pago'] ?? null, 'id_medio_pago'),
                true
            );

            $exists = $pdo->prepare('SELECT id_mes, anio_periodo FROM pagos WHERE id_organizacion=:org AND id_pago=:id LIMIT 1');
            $exists->execute([':org' => $org, ':id' => $id]);
            $paymentPeriod = $exists->fetch(PDO::FETCH_ASSOC);
            if (!$paymentPeriod) repreg_fail('El pago no existe en la entidad seleccionada.');
            try { reportes_periodo_assert_abierto($pdo, $org, (int)$paymentPeriod['id_mes'], (int)$paymentPeriod['anio_periodo']); }
            catch (Throwable $e) { repreg_fail($e->getMessage()); }

            $pdo->beginTransaction();
            try {
                reparto_pago_snapshot_eliminar($pdo, $org, $id);
                $up = $pdo->prepare("
                    UPDATE pagos
                    SET fecha_pago=:fecha, monto=:monto, id_medio_pago=:medio
                    WHERE id_organizacion=:org AND id_pago=:id
                ");
                $up->execute([
                    ':fecha' => $fecha,
                    ':monto' => $monto,
                    ':medio' => $medio,
                    ':org' => $org,
                    ':id' => $id,
                ]);
                reparto_resumen_pago($pdo, $org, $id, true);
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $e;
            }
            repreg_ok(['mensaje' => 'Pago actualizado correctamente.']);
        }

        repreg_fail('Tipo de movimiento inválido.');
    }

    if ($op === 'eliminar_egreso') {
        reportes_require_write();
        if (repreg_method() !== 'POST') repreg_fail('Método no permitido. Se esperaba POST.');
        $body = repreg_json_body();
        $id = (int)($body['id'] ?? 0);
        if ($id <= 0) repreg_fail('ID inválido.');

        $st = $pdo->prepare('SELECT fecha, comprobante FROM egresos WHERE id_organizacion=:org AND id_egreso=:id LIMIT 1');
        $st->execute([':org' => $org, ':id' => $id]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if (!$row) repreg_fail('El egreso no existe o ya fue eliminado.');
        [$deleteMonth, $deleteYear] = reportes_periodo_desde_fecha((string)$row['fecha']);
        try { reportes_periodo_assert_abierto($pdo, $org, $deleteMonth, $deleteYear); }
        catch (Throwable $e) { repreg_fail($e->getMessage()); }

        $del = $pdo->prepare('DELETE FROM egresos WHERE id_organizacion=:org AND id_egreso=:id');
        $del->execute([':org' => $org, ':id' => $id]);
        if ($del->rowCount() < 1) repreg_fail('No se pudo eliminar el egreso.');
        repreg_delete_upload((string)($row['comprobante'] ?? ''));
        repreg_ok(['mensaje' => 'Egreso eliminado correctamente.']);
    }

    if (repreg_method() !== 'GET') repreg_fail('Método no permitido. Se esperaba GET.');

    $anio = repreg_int_query('anio');
    $mes = repreg_int_query('mes');
    if ($anio !== 0 && ($anio < 2000 || $anio > 2100)) repreg_fail('Año inválido.');
    if ($mes !== 0 && ($mes < 1 || $mes > 12)) repreg_fail('Mes inválido.');

    $proofExpr = repreg_column_exists($pdo, 'pagos', 'comprobante')
        ? "COALESCE(p.comprobante, '')"
        : "''";

    $sqlPayments = "
        SELECT
            p.id_pago AS id,
            p.id_pago,
            p.id_sistema,
            p.fecha_pago AS fecha,
            p.fecha_pago,
            p.anio_periodo,
            p.id_mes,
            c.nombre AS cliente_nombre,
            cs.nombre AS sistema_nombre,
            CONCAT(c.nombre, ' - ', cs.nombre) AS concepto,
            COALESCE(m.mes, '') AS categoria,
            COALESCE(mp.nombre, '') AS medio,
            p.id_medio_pago,
            COALESCE(p.monto, 0) AS monto,
            {$proofExpr} AS comprobante,
            COALESCE(f.pdf_path, '') AS factura_pdf,
            p.id_factura
        FROM pagos p
        INNER JOIN clientes_sistemas cs
            ON cs.id_organizacion = p.id_organizacion
           AND cs.id_sistema = p.id_sistema
        INNER JOIN clientes c
            ON c.id_organizacion = cs.id_organizacion
           AND c.id_cliente = cs.id_cliente
        INNER JOIN meses m ON m.id_mes = p.id_mes
        LEFT JOIN medios_pago mp
            ON mp.id_organizacion = p.id_organizacion
           AND mp.id_medio_pago = p.id_medio_pago
        LEFT JOIN facturas f
            ON f.id_organizacion = p.id_organizacion
           AND f.id_factura = p.id_factura
        WHERE p.id_organizacion = :org
    ";
    $paramsPayments = [':org' => $org];
    if ($anio > 0) {
        $sqlPayments .= ' AND p.anio_periodo = :anio';
        $paramsPayments[':anio'] = $anio;
    }
    if ($mes > 0) {
        $sqlPayments .= ' AND p.id_mes = :mes';
        $paramsPayments[':mes'] = $mes;
    }
    $sqlPayments .= ' ORDER BY p.anio_periodo DESC, p.id_mes DESC, p.fecha_pago DESC, p.id_pago DESC';

    $stPayments = $pdo->prepare($sqlPayments);
    $stPayments->execute($paramsPayments);
    $payments = $stPayments->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $sqlExpenses = "
        SELECT
            e.id_egreso AS id,
            e.id_egreso,
            e.fecha,
            e.concepto,
            COALESCE(e.descripcion, '') AS descripcion,
            COALESCE(m.mes, '') AS categoria,
            COALESCE(mp.nombre, '') AS medio,
            e.id_medio_pago,
            e.id_trabajador,
            COALESCE(CONCAT(t.apellido, ' ', t.nombre), '') AS trabajador,
            COALESCE(e.monto, 0) AS monto,
            COALESCE(e.comprobante, '') AS comprobante,
            CASE WHEN e.id_trabajador IS NULL THEN 'general' ELSE 'reembolso' END AS tipo_egreso
        FROM egresos e
        LEFT JOIN meses m ON m.id_mes = MONTH(e.fecha)
        LEFT JOIN medios_pago mp
            ON mp.id_organizacion = e.id_organizacion
           AND mp.id_medio_pago = e.id_medio_pago
        LEFT JOIN trabajadores t ON t.id = e.id_trabajador
        WHERE e.id_organizacion = :org
    ";
    $paramsExpenses = [':org' => $org];
    if ($anio > 0) {
        $sqlExpenses .= ' AND YEAR(e.fecha) = :anio';
        $paramsExpenses[':anio'] = $anio;
    }
    if ($mes > 0) {
        $sqlExpenses .= ' AND MONTH(e.fecha) = :mes';
        $paramsExpenses[':mes'] = $mes;
    }
    $sqlExpenses .= ' ORDER BY e.fecha DESC, e.id_egreso DESC';

    $stExpenses = $pdo->prepare($sqlExpenses);
    $stExpenses->execute($paramsExpenses);
    $expenses = $stExpenses->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $payerMap = repreg_load_expense_payers(
        $pdo,
        array_map(static fn(array $row): int => (int)$row['id_egreso'], $expenses)
    );
    $reimbursements = 0.0;
    foreach ($expenses as &$expense) {
        $expenseId = (int)$expense['id_egreso'];
        $payers = $payerMap[$expenseId] ?? [];

        // Compatibilidad si todavía existen registros anteriores sin migrar.
        if (!$payers && $expense['id_trabajador'] !== null) {
            $payers[] = [
                'tipo_pagador' => 'trabajador',
                'id_trabajador' => (int)$expense['id_trabajador'],
                'id_organizacion_pagadora' => null,
                'monto' => round((float)$expense['monto'], 2),
                'trabajador_nombre' => (string)$expense['trabajador'],
                'organizacion_nombre' => '',
                'organizacion_codigo' => '',
            ];
        }

        $labels = [];
        foreach ($payers as $payer) {
            $amount = round((float)($payer['monto'] ?? 0), 2);
            $reimbursements += $amount;
            if (($payer['tipo_pagador'] ?? '') === 'trabajador') {
                $name = trim((string)($payer['trabajador_nombre'] ?? ''));
                if ($name !== '') $labels[] = $name;
            } else {
                $name = trim((string)($payer['organizacion_nombre'] ?? $payer['organizacion_codigo'] ?? ''));
                if ($name !== '') $labels[] = $name;
            }
        }

        $expense['pagadores'] = $payers;
        $expense['pagador'] = implode(' + ', array_values(array_unique($labels)));
        $expense['trabajador'] = $expense['pagador'];
        $expense['tipo_egreso'] = !$payers
            ? 'general'
            : (count($payers) > 1 ? 'compartido' : (string)$payers[0]['tipo_pagador']);
    }
    unset($expense);

    $totalPayments = array_sum(array_map(static fn(array $r): float => (float)$r['monto'], $payments));
    $totalExpenses = array_sum(array_map(static fn(array $r): float => (float)$r['monto'], $expenses));
    $periodClosed = $anio > 0 && $mes > 0
        ? reportes_periodo_cerrado($pdo, $org, $mes, $anio) !== null
        : false;

    repreg_ok([
        'organizacion' => [
            'id_organizacion' => $org,
            'codigo' => reportes_org_code(),
        ],
        'filtros' => ['anio' => $anio ?: null, 'mes' => $mes ?: null],
        'periodo_cerrado' => $periodClosed,
        'resumen' => [
            'total_ingresos' => round($totalPayments, 2),
            'total_egresos' => round($totalExpenses, 2),
            'egresos_generales' => round($totalExpenses - $reimbursements, 2),
            'reembolsos' => round($reimbursements, 2),
            'balance' => round($totalPayments - $totalExpenses, 2),
            'periodo_cerrado' => $periodClosed,
        ],
        'pagos' => $payments,
        'egresos' => $expenses,
    ]);
} catch (Throwable $e) {
    repreg_fail('Error en reportes/registro: ' . $e->getMessage());
}
