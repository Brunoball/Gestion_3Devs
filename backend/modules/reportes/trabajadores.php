<?php
// backend/modules/reportes/trabajadores.php
declare(strict_types=1);

global $pdo;
require_once __DIR__ . '/common.php';
require_once __DIR__ . '/../reparto/reparto.service.php';

$op = strtolower(trim((string)($_GET['op'] ?? '')));
if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');

function reptra_ok(array $extra = []): never
{
    http_response_code(200);
    echo json_encode(array_merge(['exito' => true], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

function reptra_fail(string $mensaje, array $extra = []): never
{
    http_response_code(200);
    echo json_encode(array_merge(['exito' => false, 'mensaje' => $mensaje], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

function reptra_method(): string
{
    return strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
}

function reptra_table_exists(PDO $pdo, string $table): bool
{
    static $cache = [];
    if (array_key_exists($table, $cache)) return (bool)$cache[$table];
    $st = $pdo->prepare("
        SELECT COUNT(*)
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tabla
    ");
    $st->execute([':tabla' => $table]);
    $cache[$table] = (int)$st->fetchColumn() > 0;
    return (bool)$cache[$table];
}

function reptra_column_exists(PDO $pdo, string $table, string $column): bool
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

function reptra_period(array $source): array
{
    $month = (int)($source['id_mes'] ?? $source['mes'] ?? 0);
    $year = (int)($source['anio'] ?? 0);
    if ($month < 1 || $month > 12) throw new RuntimeException('Seleccioná un mes puntual.');
    if ($year < 2000 || $year > 2100) throw new RuntimeException('Seleccioná un año válido.');
    return [$month, $year];
}

function reptra_api_root(): string
{
    $root = realpath(__DIR__ . '/../../');
    return rtrim($root ?: (__DIR__ . '/../../'), DIRECTORY_SEPARATOR);
}

function reptra_public_api_base(): string
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

function reptra_delete_upload(?string $pathOrUrl): void
{
    $value = trim((string)$pathOrUrl);
    if ($value === '') return;

    if (preg_match('~^https?://~i', $value)) {
        $value = (string)(parse_url($value, PHP_URL_PATH) ?? '');
    }
    $position = stripos($value, '/uploads/');
    if ($position !== false) {
        $value = substr($value, $position + 1);
    } else {
        $value = ltrim($value, '/');
        $position = stripos($value, 'uploads/');
        if ($position === false) return;
        $value = substr($value, $position);
    }

    $absolute = reptra_api_root() . DIRECTORY_SEPARATOR
        . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $value);
    if (is_file($absolute)) @unlink($absolute);
}

function reptra_upload(string $subdir, string $field = 'comprobante'): array
{
    if (!isset($_FILES[$field]) || !is_array($_FILES[$field])) {
        throw new RuntimeException('No llegó ningún comprobante.');
    }
    $file = $_FILES[$field];
    $error = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error === UPLOAD_ERR_NO_FILE) throw new RuntimeException('No llegó ningún comprobante.');
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
    $dir = reptra_api_root() . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR
        . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $cleanSubdir);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException('No se pudo crear la carpeta de comprobantes.');
    }
    if (!move_uploaded_file($tmp, $dir . DIRECTORY_SEPARATOR . $filename)) {
        throw new RuntimeException('No se pudo guardar el comprobante.');
    }

    return [
        'archivo_url' => reptra_public_api_base() . '/uploads/' . $cleanSubdir . '/' . $filename,
        'archivo_nombre' => $original,
        'archivo_tipo' => $mime !== '' ? $mime : null,
        'archivo_size' => $size,
    ];
}

function reptra_worker_metadata(
    PDO $pdo,
    int $org,
    array $workerIds,
    int $month = 0,
    int $year = 0
): array {
    $workerIds = array_values(array_unique(array_filter(array_map('intval', $workerIds), static fn(int $id): bool => $id > 0)));
    if (!$workerIds) return [];

    $params = [':org' => $org];
    $placeholders = [];
    foreach ($workerIds as $index => $workerId) {
        $key = ':worker_' . $index;
        $placeholders[] = $key;
        $params[$key] = $workerId;
    }

    $membershipExpression = 'CASE WHEN tro.id_trabajador IS NOT NULL THEN 1 ELSE 0 END';
    if ($month >= 1 && $month <= 12 && $year >= 2000 && $year <= 2100) {
        $periodStart = sprintf('%04d-%02d-01', $year, $month);
        $periodEnd = (new DateTimeImmutable($periodStart))->format('Y-m-t');
        $membershipExpression = "CASE WHEN tro.id_trabajador IS NOT NULL
            AND tro.fecha_desde <= :period_end
            AND (tro.fecha_hasta IS NULL OR tro.fecha_hasta >= :period_start)
            THEN 1 ELSE 0 END";
        $params[':period_start'] = $periodStart;
        $params[':period_end'] = $periodEnd;
    }

    $st = $pdo->prepare("
        SELECT
            t.id, t.nombre, t.apellido, t.email, t.rol AS rol_global, t.alias_pago,
            tro.rol_en_organizacion,
            {$membershipExpression} AS miembro_organizacion
        FROM trabajadores t
        LEFT JOIN trabajadores_organizaciones tro
          ON tro.id_organizacion = :org
         AND tro.id_trabajador = t.id
        WHERE t.id IN (" . implode(',', $placeholders) . ")
    ");
    $st->execute($params);

    $result = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
        $result[(int)$row['id']] = $row;
    }
    return $result;
}
try {
    if (!($pdo instanceof PDO)) reptra_fail('Conexión PDO no disponible.');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('SET NAMES utf8mb4');

    $org = reportes_org_id();
    if (!in_array($op, [
        'trabajadores', 'trabajadores_activos', 'trabajador_subir_comprobante',
        'trabajador_comprobante_latest', 'trabajador_comprobantes_listar',
    ], true)) {
        reptra_fail('op no válida en reportes/trabajadores: ' . $op);
    }

    if ($op === 'trabajador_subir_comprobante') {
        reportes_require_write();
        if (reptra_method() !== 'POST') reptra_fail('Método no permitido. Se esperaba POST.');
        if (!reptra_table_exists($pdo, 'trabajadores_comprobantes')
            || !reptra_column_exists($pdo, 'trabajadores_comprobantes', 'id_organizacion')) {
            reptra_fail('Falta ejecutar la migración de comprobantes de trabajadores.');
        }

        try {
            [$month, $year] = reptra_period($_POST);
        } catch (Throwable $e) {
            reptra_fail($e->getMessage());
        }
        $workerId = (int)($_POST['id_trabajador'] ?? 0);
        if ($workerId <= 0) reptra_fail('ID de trabajador inválido.');

        // Los comprobantes se cargan solo para trabajadores que pertenecían
        // directamente a la entidad durante el período liquidado.
        $periodStart = sprintf('%04d-%02d-01', $year, $month);
        $periodEnd = (new DateTimeImmutable($periodStart))->format('Y-m-t');
        $member = $pdo->prepare("
            SELECT 1
            FROM trabajadores_organizaciones tro
            INNER JOIN trabajadores t ON t.id = tro.id_trabajador
            WHERE tro.id_organizacion = :org
              AND tro.id_trabajador = :worker
              AND tro.fecha_desde <= :period_end
              AND (tro.fecha_hasta IS NULL OR tro.fecha_hasta >= :period_start)
            LIMIT 1
        ");
        $member->execute([
            ':org' => $org,
            ':worker' => $workerId,
            ':period_start' => $periodStart,
            ':period_end' => $periodEnd,
        ]);
        if (!$member->fetchColumn()) {
            reptra_fail('La liquidación es indirecta y se paga mediante otra entidad; no admite comprobante directo aquí.');
        }

        $file = reptra_upload("trabajadores_comprobantes/{$org}/{$workerId}/{$year}/{$month}");
        try {
            $st = $pdo->prepare("
                INSERT INTO trabajadores_comprobantes
                    (id_organizacion, id_trabajador, id_mes, anio,
                     archivo_url, archivo_nombre, archivo_tipo, archivo_size)
                VALUES
                    (:org, :worker, :month, :year, :url, :name, :type, :size)
            ");
            $st->execute([
                ':org' => $org,
                ':worker' => $workerId,
                ':month' => $month,
                ':year' => $year,
                ':url' => $file['archivo_url'],
                ':name' => $file['archivo_nombre'],
                ':type' => $file['archivo_tipo'],
                ':size' => $file['archivo_size'],
            ]);
        } catch (Throwable $e) {
            reptra_delete_upload($file['archivo_url'] ?? null);
            throw $e;
        }
        $id = (int)$pdo->lastInsertId();
        reptra_ok(['comprobante' => array_merge(['id' => $id, 'id_trabajador' => $workerId, 'id_mes' => $month, 'anio' => $year], $file)]);
    }

    if ($op === 'trabajador_comprobante_latest' || $op === 'trabajador_comprobantes_listar') {
        if (reptra_method() !== 'GET') reptra_fail('Método no permitido. Se esperaba GET.');
        $workerId = (int)($_GET['id'] ?? 0);
        if ($workerId <= 0) reptra_fail('ID de trabajador inválido.');
        if (!reptra_table_exists($pdo, 'trabajadores_comprobantes')) {
            reptra_ok(['data' => $op === 'trabajador_comprobante_latest' ? null : []]);
        }

        $params = [':org' => $org, ':worker' => $workerId];
        $periodWhere = '';
        $month = (int)($_GET['id_mes'] ?? $_GET['mes'] ?? 0);
        $year = (int)($_GET['anio'] ?? 0);
        if ($op === 'trabajador_comprobante_latest') {
            try {
                [$month, $year] = reptra_period($_GET);
            } catch (Throwable $e) {
                reptra_fail($e->getMessage());
            }
        }
        if ($month >= 1 && $month <= 12 && $year >= 2000 && $year <= 2100) {
            $periodWhere = ' AND id_mes = :month AND anio = :year';
            $params[':month'] = $month;
            $params[':year'] = $year;
        }

        $limit = $op === 'trabajador_comprobante_latest' ? ' LIMIT 1' : '';
        $st = $pdo->prepare("
            SELECT id, id_organizacion, id_trabajador, id_mes, anio,
                   archivo_url, archivo_nombre, archivo_tipo, archivo_size, created_at
            FROM trabajadores_comprobantes
            WHERE id_organizacion = :org
              AND id_trabajador = :worker
              {$periodWhere}
            ORDER BY anio DESC, id_mes DESC, created_at DESC, id DESC
            {$limit}
        ");
        $st->execute($params);
        reptra_ok(['data' => $op === 'trabajador_comprobante_latest'
            ? ($st->fetch(PDO::FETCH_ASSOC) ?: null)
            : ($st->fetchAll(PDO::FETCH_ASSOC) ?: [])]);
    }

    if (reptra_method() !== 'GET') reptra_fail('Método no permitido. Se esperaba GET.');

    if ($op === 'trabajadores_activos') {
        $st = $pdo->prepare("
            SELECT
                t.id, t.nombre, t.apellido, t.email,
                COALESCE(tro.rol_en_organizacion, t.rol) AS rol,
                t.alias_pago
            FROM trabajadores_organizaciones tro
            INNER JOIN trabajadores t ON t.id = tro.id_trabajador
            WHERE tro.id_organizacion = :org
              AND tro.activo = 1
              AND t.activo = 1
            ORDER BY t.apellido, t.nombre, t.id
        ");
        $st->execute([':org' => $org]);
        reptra_ok(['trabajadores' => $st->fetchAll(PDO::FETCH_ASSOC) ?: []]);
    }

    $month = isset($_GET['mes']) && is_numeric($_GET['mes']) ? (int)$_GET['mes'] : 0;
    $year = isset($_GET['anio']) && is_numeric($_GET['anio']) ? (int)$_GET['anio'] : 0;
    if ($month !== 0 && ($month < 1 || $month > 12)) reptra_fail('Mes inválido.');
    if ($year !== 0 && ($year < 2000 || $year > 2100)) reptra_fail('Año inválido.');

    $sqlPayments = "
        SELECT
            p.id_pago, p.id_sistema, p.id_mes, p.anio_periodo,
            p.fecha_pago, p.monto,
            cs.nombre AS sistema_nombre,
            c.id_cliente, c.nombre AS cliente_nombre
        FROM pagos p
        INNER JOIN clientes_sistemas cs
          ON cs.id_organizacion = p.id_organizacion
         AND cs.id_sistema = p.id_sistema
        INNER JOIN clientes c
          ON c.id_organizacion = cs.id_organizacion
         AND c.id_cliente = cs.id_cliente
        WHERE p.id_organizacion = :org
    ";
    $paymentParams = [':org' => $org];
    if ($year > 0) {
        $sqlPayments .= ' AND p.anio_periodo = :year';
        $paymentParams[':year'] = $year;
    }
    if ($month > 0) {
        $sqlPayments .= ' AND p.id_mes = :month';
        $paymentParams[':month'] = $month;
    }
    $sqlPayments .= ' ORDER BY p.anio_periodo, p.id_mes, p.fecha_pago, p.id_pago';
    $stPayments = $pdo->prepare($sqlPayments);
    $stPayments->execute($paymentParams);
    $payments = $stPayments->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $sqlExpenses = "
        SELECT e.id_egreso, e.fecha, e.concepto, e.monto, e.id_trabajador
        FROM egresos e
        WHERE e.id_organizacion = :org
    ";
    $expenseParams = [':org' => $org];
    if ($year > 0) {
        $sqlExpenses .= ' AND YEAR(e.fecha) = :year';
        $expenseParams[':year'] = $year;
    }
    if ($month > 0) {
        $sqlExpenses .= ' AND MONTH(e.fecha) = :month';
        $expenseParams[':month'] = $month;
    }
    $sqlExpenses .= ' ORDER BY e.fecha, e.id_egreso';
    $stExpenses = $pdo->prepare($sqlExpenses);
    $stExpenses->execute($expenseParams);
    $expenses = $stExpenses->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $totalIncome = round(array_sum(array_map(static fn(array $row): float => (float)$row['monto'], $payments)), 2);
    $totalExpenses = round(array_sum(array_map(static fn(array $row): float => (float)$row['monto'], $expenses)), 2);
    $reimbursementsByWorker = [];
    $totalReimbursements = 0.0;
    foreach ($expenses as $expense) {
        $workerId = (int)($expense['id_trabajador'] ?? 0);
        if ($workerId <= 0) continue;
        $amount = (float)$expense['monto'];
        $reimbursementsByWorker[$workerId] = ($reimbursementsByWorker[$workerId] ?? 0.0) + $amount;
        $totalReimbursements += $amount;
    }
    $totalReimbursements = round($totalReimbursements, 2);
    $generalExpenses = round($totalExpenses - $totalReimbursements, 2);
    $distributableBase = round(max(0.0, $totalIncome - $totalExpenses), 2);
    $operatingDeficit = round(max(0.0, $totalExpenses - $totalIncome), 2);

    $details = [];
    $warnings = [];
    $paymentsWithoutSnapshot = 0;
    $invalidPayments = 0;

    foreach ($payments as $payment) {
        $paymentAmount = (float)$payment['monto'];
        try {
            $distribution = reparto_resumen_pago($pdo, $org, (int)$payment['id_pago']);
            $origin = (string)($distribution['origen'] ?? 'regla_actual_sin_snapshot');
            if ($origin !== 'snapshot_pago') $paymentsWithoutSnapshot++;
            $items = is_array($distribution['items'] ?? null) ? $distribution['items'] : [];
            $totalPct = (float)($distribution['total_porcentaje'] ?? 0.0);
            $legacyEqualFallback = $origin !== 'snapshot_pago'
                && !$distribution['configurado']
                && $items
                && abs($totalPct - 100.0) <= 0.0001;

            if ((!$distribution['configurado'] && !$legacyEqualFallback)
                || abs($totalPct - 100.0) > 0.0001
                || !$items) {
                throw new RuntimeException('Distribución incompleta o distinta de 100%.');
            }

            if ($legacyEqualFallback) {
                $warnings[] = 'Pago #' . (int)$payment['id_pago']
                    . ': el equipo histórico no tenía porcentajes guardados; se aplicó reparto igualitario entre sus integrantes.';
            }
        } catch (Throwable $e) {
            $invalidPayments++;
            $origin = 'sin_distribucion';
            $items = [[
                'tipo_beneficiario' => 'organizacion',
                'id_organizacion_beneficiaria' => $org,
                'beneficiario_nombre' => 'SIN DISTRIBUCIÓN CONFIGURADA',
                'porcentaje' => 100.0,
                'monto_estimado' => $paymentAmount,
                'rutas' => [reportes_org_code()],
            ]];
            $warnings[] = 'Pago #' . (int)$payment['id_pago'] . ': ' . $e->getMessage();
        }

        foreach ($items as $item) {
            $gross = round((float)($item['monto_estimado'] ?? 0), 2);
            if ($gross <= 0) continue;
            $details[] = [
                'tipo_beneficiario' => (string)($item['tipo_beneficiario'] ?? 'organizacion'),
                'id_trabajador' => isset($item['id_trabajador']) ? (int)$item['id_trabajador'] : null,
                'id_organizacion_beneficiaria' => isset($item['id_organizacion_beneficiaria'])
                    ? (int)$item['id_organizacion_beneficiaria'] : null,
                'beneficiario_nombre' => trim((string)($item['beneficiario_nombre'] ?? 'Beneficiario')),
                'alias_pago_snapshot' => $item['alias_pago'] ?? null,
                'rol_snapshot' => $item['rol'] ?? null,
                'rutas' => array_values(array_unique(array_filter(array_map('strval', $item['rutas'] ?? [])))),
                'id_pago' => (int)$payment['id_pago'],
                'id_sistema' => (int)$payment['id_sistema'],
                'sistema' => (string)$payment['sistema_nombre'],
                'sistema_nombre' => (string)$payment['sistema_nombre'],
                'id_cliente' => (int)$payment['id_cliente'],
                'cliente' => (string)$payment['cliente_nombre'],
                'cliente_nombre' => (string)$payment['cliente_nombre'],
                'id_mes' => (int)$payment['id_mes'],
                'anio' => (int)$payment['anio_periodo'],
                'fecha_pago' => (string)$payment['fecha_pago'],
                'monto_pago' => round($paymentAmount, 2),
                'porcentaje_pago' => round((float)($item['porcentaje'] ?? 0), 4),
                'monto_bruto' => $gross,
                'monto_neto' => 0.0,
                'origen' => $origin,
            ];
        }
    }

    // Asigna la base neta centavo a centavo sobre todos los beneficiarios.
    $allocationRows = [];
    foreach ($details as $index => $detail) {
        $allocationRows[] = [
            'detail_index' => $index,
            'porcentaje' => $totalIncome > 0 ? ((float)$detail['monto_bruto'] / $totalIncome) * 100.0 : 0.0,
        ];
    }
    if ($allocationRows && $distributableBase > 0) {
        $allocationRows = reparto_aplicar_montos_exactos($allocationRows, $distributableBase);
        foreach ($allocationRows as $allocated) {
            $index = (int)$allocated['detail_index'];
            $details[$index]['monto_neto'] = round((float)($allocated['monto_estimado'] ?? 0), 2);
        }
    }

    $workerAcc = [];
    $nonWorkerAcc = [];
    foreach ($details as $detail) {
        $workerId = (int)($detail['id_trabajador'] ?? 0);
        if ($detail['tipo_beneficiario'] === 'trabajador' && $workerId > 0) {
            if (!isset($workerAcc[$workerId])) {
                $workerAcc[$workerId] = [
                    'id' => $workerId,
                    'monto_bruto' => 0.0,
                    'monto_neto' => 0.0,
                    'detalle' => [],
                    'sistemas' => [],
                    'snapshot_nombre' => $detail['beneficiario_nombre'],
                    'snapshot_alias' => $detail['alias_pago_snapshot'],
                    'snapshot_rol' => $detail['rol_snapshot'],
                    'usa_fallback_historico' => false,
                ];
            }
            $workerAcc[$workerId]['monto_bruto'] += (float)$detail['monto_bruto'];
            $workerAcc[$workerId]['monto_neto'] += (float)$detail['monto_neto'];
            $workerAcc[$workerId]['detalle'][] = $detail;
            $workerAcc[$workerId]['sistemas'][(int)$detail['id_sistema']] = true;
            if ($detail['origen'] !== 'snapshot_pago') $workerAcc[$workerId]['usa_fallback_historico'] = true;
        } else {
            $key = 'o:' . (int)($detail['id_organizacion_beneficiaria'] ?? 0) . ':' . $detail['beneficiario_nombre'];
            if (!isset($nonWorkerAcc[$key])) {
                $nonWorkerAcc[$key] = [
                    'beneficiario' => $detail['beneficiario_nombre'],
                    'id_organizacion_beneficiaria' => $detail['id_organizacion_beneficiaria'],
                    'monto_bruto' => 0.0,
                    'monto_neto' => 0.0,
                    'rutas' => [],
                ];
            }
            $nonWorkerAcc[$key]['monto_bruto'] += (float)$detail['monto_bruto'];
            $nonWorkerAcc[$key]['monto_neto'] += (float)$detail['monto_neto'];
            foreach ($detail['rutas'] as $route) $nonWorkerAcc[$key]['rutas'][] = $route;
        }
    }

    foreach ($reimbursementsByWorker as $workerId => $amount) {
        if (!isset($workerAcc[$workerId])) {
            $workerAcc[$workerId] = [
                'id' => (int)$workerId,
                'monto_bruto' => 0.0,
                'monto_neto' => 0.0,
                'detalle' => [],
                'sistemas' => [],
                'snapshot_nombre' => '',
                'snapshot_alias' => null,
                'snapshot_rol' => null,
                'usa_fallback_historico' => false,
            ];
        }
    }

    $metadata = reptra_worker_metadata($pdo, $org, array_keys($workerAcc), $month, $year);
    $proofs = [];
    if ($month > 0 && $year > 0 && reptra_table_exists($pdo, 'trabajadores_comprobantes') && $workerAcc) {
        $workerIds = array_values(array_map('intval', array_keys($workerAcc)));
        $placeholders = implode(',', array_fill(0, count($workerIds), '?'));
        $stProof = $pdo->prepare("
            SELECT id_trabajador, id_mes, anio, archivo_url, archivo_nombre, archivo_tipo, created_at
            FROM trabajadores_comprobantes
            WHERE id_organizacion = ?
              AND id_trabajador IN ({$placeholders})
              AND id_mes = ?
              AND anio = ?
            ORDER BY id_trabajador, created_at DESC, id DESC
        ");
        $stProof->execute(array_merge([$org], $workerIds, [$month, $year]));
        foreach ($stProof->fetchAll(PDO::FETCH_ASSOC) ?: [] as $proof) {
            $workerId = (int)$proof['id_trabajador'];
            if (!isset($proofs[$workerId])) $proofs[$workerId] = $proof;
        }
    }

    $workers = [];
    foreach ($workerAcc as $workerId => $acc) {
        $meta = $metadata[(int)$workerId] ?? [];
        $gross = round((float)$acc['monto_bruto'], 2);
        $net = round((float)$acc['monto_neto'], 2);
        $reimbursement = round((float)($reimbursementsByWorker[$workerId] ?? 0), 2);
        $proof = $proofs[(int)$workerId] ?? null;
        $name = trim((string)($meta['nombre'] ?? ''));
        $surname = trim((string)($meta['apellido'] ?? ''));
        if ($name === '' && $surname === '') {
            $parts = preg_split('/\s+/', trim((string)$acc['snapshot_nombre'])) ?: [];
            $name = (string)array_shift($parts);
            $surname = implode(' ', $parts);
        }

        $workers[] = [
            'id' => (int)$workerId,
            'id_trabajador' => (int)$workerId,
            'nombre' => $name,
            'apellido' => $surname,
            'email' => (string)($meta['email'] ?? ''),
            'rol' => (string)($meta['rol_en_organizacion'] ?? $acc['snapshot_rol'] ?? $meta['rol_global'] ?? ''),
            'alias_pago' => (string)($meta['alias_pago'] ?? $acc['snapshot_alias'] ?? ''),
            'miembro_organizacion' => (int)($meta['miembro_organizacion'] ?? 0) === 1,
            'puede_comprobante' => (int)($meta['miembro_organizacion'] ?? 0) === 1,
            'liquidacion_indirecta' => (int)($meta['miembro_organizacion'] ?? 0) !== 1,
            'porcentaje_efectivo' => $totalIncome > 0 ? round(($gross / $totalIncome) * 100.0, 4) : 0.0,
            'sistemas_cobrados' => count($acc['sistemas']),
            'monto_bruto' => $gross,
            'descuento_egresos' => round(max(0.0, $gross - $net), 2),
            'monto_sistemas' => $net,
            'monto_reembolso' => $reimbursement,
            'monto' => round($net + $reimbursement, 2),
            'usa_fallback_historico' => (bool)$acc['usa_fallback_historico'],
            'detalle' => array_values($acc['detalle']),
            'comprobante_pago' => $proof['archivo_url'] ?? null,
            'comprobante_pago_fecha' => $proof['created_at'] ?? null,
            'comprobante_pago_nombre' => $proof['archivo_nombre'] ?? null,
            'comprobante_pago_tipo' => $proof['archivo_tipo'] ?? null,
            'comprobante_pago_id_mes' => $proof['id_mes'] ?? null,
            'comprobante_pago_anio' => $proof['anio'] ?? null,
        ];
    }
    usort($workers, static fn(array $a, array $b): int => ($b['monto'] <=> $a['monto']) ?: strcmp($a['apellido'], $b['apellido']));

    $nonWorkers = array_values(array_map(static function (array $row): array {
        $row['monto_bruto'] = round((float)$row['monto_bruto'], 2);
        $row['monto_neto'] = round((float)$row['monto_neto'], 2);
        $row['rutas'] = array_values(array_unique($row['rutas']));
        return $row;
    }, $nonWorkerAcc));

    $workerGross = round(array_sum(array_column($workers, 'monto_bruto')), 2);
    $workerNet = round(array_sum(array_column($workers, 'monto_sistemas')), 2);
    $workerPayout = round(array_sum(array_column($workers, 'monto')), 2);
    $unassignedGross = round(array_sum(array_column($nonWorkers, 'monto_bruto')), 2);
    $unassignedNet = round(array_sum(array_column($nonWorkers, 'monto_neto')), 2);
    // Control contable completo. El déficit operativo no es una diferencia:
    // es financiamiento faltante cuando los egresos superan a los ingresos.
    // La igualdad auditada es:
    // ingresos + déficit = egresos generales + pagos a trabajadores/entidades.
    $controlDifference = round(
        $totalIncome + $operatingDeficit - $generalExpenses - ($workerPayout + $unassignedNet),
        2
    );

    if ($paymentsWithoutSnapshot > 0) {
        $warnings[] = "{$paymentsWithoutSnapshot} pago(s) anterior(es) a la migración todavía no tienen snapshot; se usó la regla vigente. Ejecutá la regularización incluida para congelarlos.";
    }
    if ($invalidPayments > 0) {
        $warnings[] = "{$invalidPayments} pago(s) tienen una distribución inválida y quedaron sin asignar.";
    }
    if (abs($controlDifference) > 0.01) {
        $warnings[] = 'El control contable detectó una diferencia de $' . number_format($controlDifference, 2, ',', '.');
    }

    reptra_ok([
        'organizacion' => [
            'id_organizacion' => $org,
            'codigo' => reportes_org_code(),
            'modelo_reparto' => reparto_organizacion_config($pdo, $org)['modelo_reparto'],
        ],
        'filtros' => ['mes' => $month ?: null, 'anio' => $year ?: null],
        'resumen' => [
            'total_ingresos' => $totalIncome,
            'total_egresos' => $totalExpenses,
            'egresos_generales' => $generalExpenses,
            'reembolsos' => $totalReimbursements,
            'base_distribuible' => $distributableBase,
            'deficit_operativo' => $operatingDeficit,
            'monto_bruto_trabajadores' => $workerGross,
            'monto_neto_trabajadores' => $workerNet,
            'total_a_pagar' => $workerPayout,
            'monto_bruto_no_persona' => $unassignedGross,
            'monto_neto_no_persona' => $unassignedNet,
            'diferencia_control' => $controlDifference,
            'pagos_sin_snapshot' => $paymentsWithoutSnapshot,
            'pagos_invalidos' => $invalidPayments,
            'configuracion_ok' => $invalidPayments === 0 && abs($controlDifference) <= 0.01,
        ],
        'trabajadores' => $workers,
        'beneficiarios_no_persona' => $nonWorkers,
        'advertencias' => array_values(array_unique($warnings)),
    ]);
} catch (Throwable $e) {
    reptra_fail('Error en reportes/trabajadores: ' . $e->getMessage());
}
