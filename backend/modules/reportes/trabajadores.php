<?php
// backend/modules/reportes/trabajadores.php
declare(strict_types=1);

global $pdo;
require_once __DIR__ . '/common.php';
require_once __DIR__ . '/../reparto/reparto.service.php';
require_once __DIR__ . '/periodos.service.php';

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

function reptra_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') return [];
    $body = json_decode($raw, true);
    if (!is_array($body)) throw new RuntimeException('JSON inválido.');
    return $body;
}

function reptra_table_exists(PDO $pdo, string $table): bool
{
    static $cache = [];
    if (array_key_exists($table, $cache)) return (bool)$cache[$table];
    $st = $pdo->prepare("\n        SELECT COUNT(*)\n        FROM information_schema.TABLES\n        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tabla\n    ");
    $st->execute([':tabla' => $table]);
    $cache[$table] = (int)$st->fetchColumn() > 0;
    return (bool)$cache[$table];
}

function reptra_column_exists(PDO $pdo, string $table, string $column): bool
{
    static $cache = [];
    $key = $table . '.' . $column;
    if (array_key_exists($key, $cache)) return (bool)$cache[$key];
    $st = $pdo->prepare("\n        SELECT COUNT(*)\n        FROM information_schema.COLUMNS\n        WHERE TABLE_SCHEMA = DATABASE()\n          AND TABLE_NAME = :tabla\n          AND COLUMN_NAME = :columna\n    ");
    $st->execute([':tabla' => $table, ':columna' => $column]);
    $cache[$key] = (int)$st->fetchColumn() > 0;
    return (bool)$cache[$key];
}

function reptra_organization_code(PDO $pdo, int $organizationId): string
{
    static $cache = [];
    if (isset($cache[$organizationId])) return (string)$cache[$organizationId];

    $st = $pdo->prepare('SELECT codigo FROM organizaciones WHERE id_organizacion=:org LIMIT 1');
    $st->execute([':org' => $organizationId]);
    $code = strtoupper(trim((string)($st->fetchColumn() ?: '')));
    if ($code === '') throw new RuntimeException('La organización no existe o no tiene código contable.');
    $cache[$organizationId] = $code;
    return $code;
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

    $st = $pdo->prepare("\n        SELECT
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

function reptra_fetch_payments(PDO $pdo, int $org, int $month, int $year): array
{
    $sql = "
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
    $params = [':org' => $org];
    if ($year > 0) {
        $sql .= ' AND p.anio_periodo = :year';
        $params[':year'] = $year;
    }
    if ($month > 0) {
        $sql .= ' AND p.id_mes = :month';
        $params[':month'] = $month;
    }
    $sql .= ' ORDER BY p.anio_periodo, p.id_mes, p.fecha_pago, p.id_pago';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function reptra_fetch_expenses(
    PDO $pdo,
    int $org,
    int $month,
    int $year,
    bool $createSnapshots = false
): array
{
    $sql = "
        SELECT e.id_egreso, e.fecha, e.concepto, e.monto, e.id_trabajador
        FROM egresos e
        WHERE e.id_organizacion = :org
    ";
    $params = [':org' => $org];
    if ($year > 0) {
        $sql .= ' AND YEAR(e.fecha) = :year';
        $params[':year'] = $year;
    }
    if ($month > 0) {
        $sql .= ' AND MONTH(e.fecha) = :month';
        $params[':month'] = $month;
    }
    $sql .= ' ORDER BY e.fecha, e.id_egreso';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $expenses = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $payerMap = [];
    if ($expenses && reptra_table_exists($pdo, 'egresos_pagadores')) {
        $ids = array_map(static fn(array $row): int => (int)$row['id_egreso'], $expenses);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $payerSt = $pdo->prepare("
            SELECT ep.id_egreso, ep.tipo_pagador, ep.id_trabajador,
                   ep.id_organizacion_pagadora, ep.monto,
                   t.id AS trabajador_existe,
                   o.id_organizacion AS organizacion_existe
            FROM egresos_pagadores ep
            LEFT JOIN trabajadores t ON t.id = ep.id_trabajador
            LEFT JOIN organizaciones o ON o.id_organizacion = ep.id_organizacion_pagadora
            WHERE ep.id_egreso IN ({$placeholders})
            ORDER BY ep.id_egreso, ep.id_pagador
        ");
        $payerSt->execute($ids);
        foreach ($payerSt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $payer) {
            $payerMap[(int)$payer['id_egreso']][] = [
                'tipo_pagador' => (string)$payer['tipo_pagador'],
                'id_trabajador' => $payer['id_trabajador'] !== null ? (int)$payer['id_trabajador'] : null,
                'id_organizacion_pagadora' => $payer['id_organizacion_pagadora'] !== null
                    ? (int)$payer['id_organizacion_pagadora'] : null,
                'monto' => round((float)$payer['monto'], 2),
                'trabajador_existe' => $payer['trabajador_existe'] !== null,
                'organizacion_existe' => $payer['organizacion_existe'] !== null,
            ];
        }
    }

    foreach ($expenses as &$expense) {
        $expenseId = (int)$expense['id_egreso'];
        $expenseAmount = round((float)$expense['monto'], 2);
        $payers = $payerMap[$expenseId] ?? [];
        if (!$payers && $expense['id_trabajador'] !== null) {
            $payers[] = [
                'tipo_pagador' => 'trabajador',
                'id_trabajador' => (int)$expense['id_trabajador'],
                'id_organizacion_pagadora' => null,
                'monto' => $expenseAmount,
                'trabajador_existe' => true,
                'organizacion_existe' => false,
            ];
        }

        $valid = true;
        $payerTotal = 0.0;
        foreach ($payers as $payer) {
            $type = (string)($payer['tipo_pagador'] ?? '');
            $amount = round((float)($payer['monto'] ?? 0), 2);
            $payerTotal += $amount;
            if ($amount <= 0) $valid = false;
            if ($type === 'trabajador') {
                if ((int)($payer['id_trabajador'] ?? 0) <= 0 || empty($payer['trabajador_existe'])
                    || !empty($payer['id_organizacion_pagadora'])) {
                    $valid = false;
                }
            } elseif ($type === 'organizacion') {
                if ((int)($payer['id_organizacion_pagadora'] ?? 0) <= 0 || empty($payer['organizacion_existe'])
                    || !empty($payer['id_trabajador'])) {
                    $valid = false;
                }
            } else {
                $valid = false;
            }
        }
        $payerTotal = round($payerTotal, 2);
        // Sin pagadores significa que el egreso fue afrontado por la propia entidad.
        if ($payers && abs($payerTotal - $expenseAmount) > 0.01) $valid = false;

        $cleanPayers = array_map(static function (array $payer): array {
            unset($payer['trabajador_existe'], $payer['organizacion_existe']);
            return $payer;
        }, $payers);
        $expense['pagadores_originales'] = $cleanPayers;
        $expense['pagadores_validos'] = $valid;
        $expense['monto_pagadores'] = $payerTotal;
        $expense['diferencia_pagadores'] = round($expenseAmount - $payerTotal, 2);
        // Un dato inconsistente nunca genera reembolsos: se descuenta como gasto
        // general y bloquea el cierre hasta ser corregido.
        $expense['pagadores'] = $valid ? $cleanPayers : [];
        $expense['reembolso_snapshot'] = [
            'workers' => [],
            'organizations' => [],
            'payers' => [],
            'monto_pagadores' => 0.0,
        ];

        if ($valid && $cleanPayers) {
            try {
                $expense['reembolso_snapshot'] = reparto_resumen_egreso(
                    $pdo,
                    $org,
                    $expenseId,
                    $cleanPayers,
                    $createSnapshots
                );
            } catch (Throwable $e) {
                $expense['pagadores_validos'] = false;
                $expense['pagadores'] = [];
                $expense['error_pagadores'] = $e->getMessage();
            }
        }
    }
    unset($expense);

    return $expenses;
}

function reptra_add_amount(array &$map, int|string $key, float $amount): void
{
    if ($amount <= 0) return;
    $map[$key] = round((float)($map[$key] ?? 0) + $amount, 2);
}

function reptra_reimbursements_all(PDO $pdo, array $expenses): array
{
    $workers = [];
    $organizations = [];
    $total = 0.0;

    foreach ($expenses as $expense) {
        if (empty($expense['pagadores_validos'])) continue;
        $snapshot = is_array($expense['reembolso_snapshot'] ?? null)
            ? $expense['reembolso_snapshot'] : [];
        foreach (($snapshot['workers'] ?? []) as $workerId => $amount) {
            reptra_add_amount($workers, (int)$workerId, (float)$amount);
        }
        foreach (($snapshot['organizations'] ?? []) as $organizationId => $amount) {
            reptra_add_amount($organizations, (int)$organizationId, (float)$amount);
        }
        $total += round((float)($snapshot['monto_pagadores'] ?? $expense['monto_pagadores'] ?? 0), 2);
    }

    return [
        'workers' => $workers,
        'organizations' => $organizations,
        'total' => round($total, 2),
    ];
}

function reptra_reimbursements_for_organization(PDO $pdo, array $expenses, int $organizationId): array
{
    $workers = [];
    $organizations = [];
    $total = 0.0;

    foreach ($expenses as $expense) {
        if (empty($expense['pagadores_validos'])) continue;
        $snapshot = is_array($expense['reembolso_snapshot'] ?? null)
            ? $expense['reembolso_snapshot'] : [];

        foreach (($snapshot['payers'] ?? []) as $payer) {
            $type = (string)($payer['tipo_pagador'] ?? '');
            if ($type === 'trabajador') {
                if ((int)($payer['id_organizacion_trabajador'] ?? 0) !== $organizationId) continue;
            } elseif ($type === 'organizacion') {
                if ((int)($payer['id_organizacion_pagadora'] ?? 0) !== $organizationId) continue;
            } else {
                continue;
            }

            foreach (($payer['workers'] ?? []) as $workerId => $amount) {
                reptra_add_amount($workers, (int)$workerId, (float)$amount);
            }
            foreach (($payer['organizations'] ?? []) as $targetOrganizationId => $amount) {
                reptra_add_amount($organizations, (int)$targetOrganizationId, (float)$amount);
            }
            $total += round((float)($payer['monto'] ?? 0), 2);
        }
    }

    return [
        'workers' => $workers,
        'organizations' => $organizations,
        'total' => round($total, 2),
    ];
}

function reptra_item_key(array $item): string
{
    return ($item['tipo_beneficiario'] ?? '') === 'trabajador'
        ? 't:' . (int)($item['id_trabajador'] ?? 0)
        : 'o:' . (int)($item['id_organizacion_beneficiaria'] ?? 0);
}

function reptra_parent_organizations(PDO $pdo, int $beneficiaryOrg): array
{
    $st = $pdo->prepare("\n        SELECT DISTINCT
            r.id_organizacion AS id_organizacion_origen,
            o.codigo, o.nombre
        FROM organizaciones_reparto r
        INNER JOIN organizaciones o ON o.id_organizacion = r.id_organizacion
        WHERE r.tipo_beneficiario = 'organizacion'
          AND r.id_organizacion_beneficiaria = :beneficiary
          AND r.activo = 1
          AND r.fecha_hasta IS NULL
          AND o.activo = 1
        ORDER BY id_organizacion_origen
    ");
    $st->execute([':beneficiary' => $beneficiaryOrg]);
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

/**
 * Calcula lo que otra entidad debe transferir a la organización actual.
 * El bruto es su participación sobre ingresos; el neto ya descuenta únicamente
 * la parte proporcional de los egresos de la entidad de origen.
 */
function reptra_route_contains_code(array $item, string $code): bool
{
    $code = strtoupper(trim($code));
    if ($code === '') return false;
    $routes = $item['rutas'] ?? (!empty($item['ruta']) ? [$item['ruta']] : []);
    foreach ($routes as $route) {
        $parts = preg_split('/\s*→\s*/u', strtoupper((string)$route)) ?: [];
        if (in_array($code, array_map('trim', $parts), true)) return true;
    }
    return false;
}

function reptra_external_incoming(PDO $pdo, int $org, int $month, int $year): array
{
    $details = [];
    $warnings = [];
    $grossTotal = 0.0;
    $netTotal = 0.0;
    $reimbursementWorkers = [];
    $reimbursementOrganizations = [];
    $reimbursementTotal = 0.0;
    $invalidPayments = 0;
    $invalidExpensePayers = 0;
    $paymentsWithoutSnapshot = 0;
    $targetCode = reptra_organization_code($pdo, $org);

    foreach (reptra_parent_organizations($pdo, $org) as $parent) {
        $parentId = (int)$parent['id_organizacion_origen'];
        $payments = reptra_fetch_payments($pdo, $parentId, $month, $year);
        $expenses = reptra_fetch_expenses($pdo, $parentId, $month, $year);
        $income = round(array_sum(array_map(static fn(array $row): float => (float)$row['monto'], $payments)), 2);
        $expense = round(array_sum(array_map(static fn(array $row): float => (float)$row['monto'], $expenses)), 2);

        foreach ($expenses as $expenseRow) {
            if (empty($expenseRow['pagadores_validos'])) {
                $invalidExpensePayers++;
                $warnings[] = 'Egreso #' . (int)$expenseRow['id_egreso'] . ' de ' . (string)$parent['codigo']
                    . ': los pagadores no coinciden exactamente con el monto del egreso.';
            }
        }

        $parentReimbursements = reptra_reimbursements_for_organization($pdo, $expenses, $org);
        foreach ($parentReimbursements['workers'] as $workerId => $amount) {
            reptra_add_amount($reimbursementWorkers, (int)$workerId, (float)$amount);
        }
        foreach ($parentReimbursements['organizations'] as $organizationId => $amount) {
            reptra_add_amount($reimbursementOrganizations, (int)$organizationId, (float)$amount);
        }
        $reimbursementTotal += (float)$parentReimbursements['total'];
        if ($income <= 0.0) continue;

        /**
         * Primero se reconstruye la asignación completa de la entidad padre y
         * recién después se selecciona la rama de la entidad actual. De esta
         * forma BALTO y 3DEVS usan exactamente los mismos centavos, incluso en
         * montos impares o empates de redondeo.
         */
        $allRows = [];
        foreach ($payments as $payment) {
            try {
                $distribution = reparto_resumen_pago($pdo, $parentId, (int)$payment['id_pago'], false);
                if (!empty($distribution['snapshot_faltante'])) $paymentsWithoutSnapshot++;
                reparto_validar_resumen_contable($distribution, (float)$payment['monto']);
                $items = is_array($distribution['items'] ?? null) ? $distribution['items'] : [];
            } catch (Throwable $e) {
                $invalidPayments++;
                $warnings[] = 'Pago #' . (int)$payment['id_pago'] . ' de ' . (string)$parent['codigo']
                    . ': ' . $e->getMessage();
                // Conserva el monto dentro del control contable, pero no lo
                // atribuye a ninguna rama hasta corregir su configuración.
                $items = [[
                    'tipo_beneficiario' => 'organizacion',
                    'id_organizacion_beneficiaria' => $parentId,
                    'beneficiario_nombre' => 'SIN DISTRIBUCIÓN CONFIGURADA',
                    'porcentaje' => 100.0,
                    'monto_estimado' => round((float)$payment['monto'], 2),
                    'ruta' => (string)$parent['codigo'],
                    'rutas' => [(string)$parent['codigo']],
                    'configurado' => false,
                ]];
            }

            foreach ($items as $item) {
                $gross = round((float)($item['monto_estimado'] ?? 0), 2);
                if ($gross <= 0) continue;
                $belongs = reptra_route_contains_code($item, $targetCode)
                    || (($item['tipo_beneficiario'] ?? '') === 'organizacion'
                        && (int)($item['id_organizacion_beneficiaria'] ?? 0) === $org);
                $allRows[] = [
                    'item' => $item,
                    'payment' => $payment,
                    'gross' => $gross,
                    'belongs' => $belongs,
                    'net' => 0.0,
                ];
            }
        }

        if (!$allRows) continue;
        $parentNet = round(max(0.0, $income - $expense), 2);
        $allocation = [];
        foreach ($allRows as $index => $row) {
            $allocation[] = [
                'index' => $index,
                'porcentaje' => $income > 0 ? ((float)$row['gross'] / $income) * 100.0 : 0.0,
            ];
        }
        if ($allocation && $parentNet > 0.0) {
            $allocation = reparto_aplicar_montos_exactos($allocation, $parentNet);
            foreach ($allocation as $allocated) {
                $index = (int)$allocated['index'];
                $allRows[$index]['net'] = round((float)($allocated['monto_estimado'] ?? 0), 2);
            }
        }

        $branchGross = 0.0;
        $branchNet = 0.0;
        foreach ($allRows as $row) {
            if (empty($row['belongs'])) continue;
            $item = $row['item'];
            $payment = $row['payment'];
            $gross = round((float)$row['gross'], 2);
            $net = round((float)$row['net'], 2);
            $branchGross += $gross;
            $branchNet += $net;

            $details[] = [
                'tipo_beneficiario' => (string)($item['tipo_beneficiario'] ?? 'organizacion'),
                'id_trabajador' => isset($item['id_trabajador']) ? (int)$item['id_trabajador'] : null,
                'id_organizacion_beneficiaria' => isset($item['id_organizacion_beneficiaria'])
                    ? (int)$item['id_organizacion_beneficiaria'] : null,
                'beneficiario_nombre' => trim((string)($item['beneficiario_nombre'] ?? 'Beneficiario')),
                'alias_pago_regla' => $item['alias_pago'] ?? null,
                'rol_regla' => $item['rol'] ?? null,
                'rutas' => array_values(array_unique($item['rutas'] ?? [])),
                'id_pago' => (int)$payment['id_pago'],
                'id_sistema' => (int)$payment['id_sistema'],
                'sistema' => 'PARTICIPACIÓN ' . (string)$parent['codigo'] . ' · ' . (string)$payment['sistema_nombre'],
                'sistema_nombre' => 'PARTICIPACIÓN ' . (string)$parent['codigo'] . ' · ' . (string)$payment['sistema_nombre'],
                'id_cliente' => (int)$payment['id_cliente'],
                'cliente' => (string)$payment['cliente_nombre'],
                'cliente_nombre' => (string)$payment['cliente_nombre'],
                'id_mes' => (int)$payment['id_mes'],
                'anio' => (int)$payment['anio_periodo'],
                'fecha_pago' => (string)$payment['fecha_pago'],
                'monto_pago' => round((float)$payment['monto'], 2),
                'porcentaje_pago' => round((float)($item['porcentaje'] ?? 0), 4),
                'monto_bruto' => $gross,
                'monto_neto' => $net,
                'origen' => 'snapshot_participacion_entidad',
                'id_organizacion_origen' => $parentId,
                'organizacion_origen' => (string)$parent['codigo'],
            ];
        }

        $grossTotal += round($branchGross, 2);
        $netTotal += round($branchNet, 2);
    }

    return [
        'details' => $details,
        'gross' => round($grossTotal, 2),
        'net' => round($netTotal, 2),
        'expense_impact' => round(max(0.0, $grossTotal - $netTotal), 2),
        'reimbursements_workers' => $reimbursementWorkers,
        'reimbursements_organizations' => $reimbursementOrganizations,
        'reimbursements_total' => round($reimbursementTotal, 2),
        'invalid_payments' => $invalidPayments,
        'invalid_expense_payers' => $invalidExpensePayers,
        'payments_without_snapshot' => $paymentsWithoutSnapshot,
        'warnings' => $warnings,
    ];
}

function reptra_load_proofs(PDO $pdo, int $org, array $workerIds, int $month, int $year): array
{
    if ($month < 1 || $year < 2000 || !$workerIds || !reptra_table_exists($pdo, 'trabajadores_comprobantes')) {
        return [];
    }
    $workerIds = array_values(array_unique(array_map('intval', $workerIds)));
    $placeholders = implode(',', array_fill(0, count($workerIds), '?'));
    $st = $pdo->prepare("\n        SELECT id_trabajador, id_mes, anio, archivo_url, archivo_nombre, archivo_tipo, created_at
        FROM trabajadores_comprobantes
        WHERE id_organizacion = ?
          AND id_trabajador IN ({$placeholders})
          AND id_mes = ?
          AND anio = ?
        ORDER BY id_trabajador, created_at DESC, id DESC
    ");
    $st->execute(array_merge([$org], $workerIds, [$month, $year]));
    $proofs = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) ?: [] as $proof) {
        $workerId = (int)$proof['id_trabajador'];
        if (!isset($proofs[$workerId])) $proofs[$workerId] = $proof;
    }
    return $proofs;
}

function reptra_load_paid_snapshots(PDO $pdo, int $org, int $month, int $year): array
{
    if ($month < 1 || $year < 2000 || !reptra_table_exists($pdo, 'trabajadores_liquidaciones_pagadas')) {
        return [];
    }
    $st = $pdo->prepare("\n        SELECT id, id_trabajador, snapshot_json, resumen_json, pagado_at, pagado_por
        FROM trabajadores_liquidaciones_pagadas
        WHERE id_organizacion = :org
          AND id_mes = :month
          AND anio = :year
        ORDER BY id_trabajador
    ");
    $st->execute([':org' => $org, ':month' => $month, ':year' => $year]);
    $rows = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
        $decoded = json_decode((string)$row['snapshot_json'], true);
        if (!is_array($decoded)) continue;
        $summary = json_decode((string)($row['resumen_json'] ?? ''), true);
        $rows[(int)$row['id_trabajador']] = [
            'id' => (int)$row['id'],
            'snapshot' => $decoded,
            'summary' => is_array($summary) ? $summary : [],
            'pagado_at' => (string)$row['pagado_at'],
            'pagado_por' => $row['pagado_por'] !== null ? (int)$row['pagado_por'] : null,
        ];
    }
    return $rows;
}

/**
 * Migra períodos con pagos históricos individuales al nuevo cierre integral.
 * Los importes que ya fueron pagados son la fuente de verdad y jamás se
 * reemplazan por un recálculo posterior.
 */
function reptra_apply_legacy_paid_snapshots(array $report, array $paidSnapshots): array
{
    $workers = is_array($report['trabajadores'] ?? null) ? $report['trabajadores'] : [];
    $byWorker = [];
    foreach ($workers as $worker) {
        $workerId = (int)($worker['id_trabajador'] ?? $worker['id'] ?? 0);
        if ($workerId > 0) $byWorker[$workerId] = $worker;
    }

    $historicalSummary = [];
    foreach ($paidSnapshots as $workerId => $paid) {
        $snapshot = is_array($paid['snapshot'] ?? null) ? $paid['snapshot'] : [];
        if (!$snapshot) continue;
        $snapshot['id'] = (int)($snapshot['id'] ?? $workerId);
        $snapshot['id_trabajador'] = (int)($snapshot['id_trabajador'] ?? $workerId);
        $snapshot['pagado'] = true;
        $snapshot['pagado_at'] = (string)($paid['pagado_at'] ?? '');
        $snapshot['liquidacion_snapshot_id'] = (int)($paid['id'] ?? 0) ?: null;
        $snapshot['puede_marcar_pagado'] = false;
        $byWorker[(int)$workerId] = $snapshot;
        if (!$historicalSummary && is_array($paid['summary'] ?? null)) {
            $historicalSummary = $paid['summary'];
        }
    }

    $report['trabajadores'] = array_values($byWorker);
    usort($report['trabajadores'], static fn(array $a, array $b): int =>
        ((float)($b['monto'] ?? 0) <=> (float)($a['monto'] ?? 0))
        ?: strcmp((string)($a['apellido'] ?? ''), (string)($b['apellido'] ?? ''))
    );

    $currentSummary = is_array($report['resumen'] ?? null) ? $report['resumen'] : [];
    if ($historicalSummary) {
        // El resumen guardado junto al pago histórico representa el cierre que
        // se usó realmente para transferir dinero. Los nuevos contadores de
        // integridad se conservan cuando antes no existían.
        $report['resumen'] = array_merge($currentSummary, $historicalSummary);

        $actualPayout = round(array_sum(array_map(
            static fn(array $worker): float => (float)($worker['monto'] ?? 0),
            $report['trabajadores']
        )), 2);
        $historicalPayout = round((float)($historicalSummary['total_a_pagar'] ?? $actualPayout), 2);
        if (abs($actualPayout - $historicalPayout) > 0.01) {
            throw new RuntimeException(
                'Los importes históricos pagados y pendientes ya no coinciden con el cierre original del período.'
            );
        }
    }
    $report['resumen']['liquidaciones_pagadas'] = count($paidSnapshots);
    $report['advertencias'] = array_values(array_unique(array_merge(
        is_array($report['advertencias'] ?? null) ? $report['advertencias'] : [],
        ['Período histórico reconstruido respetando exactamente las liquidaciones ya pagadas.']
    )));
    return $report;
}

function reptra_report_safe_to_close(array $report): bool
{
    $summary = is_array($report['resumen'] ?? null) ? $report['resumen'] : [];
    return !empty($summary['configuracion_ok'])
        && (int)($summary['pagos_invalidos'] ?? 0) === 0
        && (int)($summary['pagos_reparto_igualitario'] ?? 0) === 0
        && (int)($summary['pagos_sin_snapshot'] ?? 0) === 0
        && (int)($summary['egresos_pagadores_invalidos'] ?? 0) === 0
        && abs((float)($summary['diferencia_control'] ?? 0)) <= 0.01;
}

function reptra_closed_period_report(
    PDO $pdo,
    array $closedRow,
    int $org,
    int $month,
    int $year
): array {
    $report = reportes_periodo_decodificar_snapshot($closedRow);
    $workers = is_array($report['trabajadores'] ?? null) ? $report['trabajadores'] : [];
    $workerIds = array_values(array_filter(array_map(
        static fn(array $worker): int => (int)($worker['id_trabajador'] ?? $worker['id'] ?? 0),
        $workers
    )));
    $proofs = reptra_load_proofs($pdo, $org, $workerIds, $month, $year);
    $paid = reptra_load_paid_snapshots($pdo, $org, $month, $year);

    foreach ($workers as &$worker) {
        $workerId = (int)($worker['id_trabajador'] ?? $worker['id'] ?? 0);
        $payment = $paid[$workerId] ?? null;
        $proof = $proofs[$workerId] ?? null;
        $worker['pagado'] = $payment !== null;
        $worker['pagado_at'] = $payment['pagado_at'] ?? null;
        $worker['liquidacion_snapshot_id'] = $payment['id'] ?? null;
        $worker['puede_marcar_pagado'] = !empty($worker['miembro_organizacion']) && $payment === null;
        foreach ([
            'comprobante_pago' => 'archivo_url',
            'comprobante_pago_fecha' => 'created_at',
            'comprobante_pago_nombre' => 'archivo_nombre',
            'comprobante_pago_tipo' => 'archivo_tipo',
            'comprobante_pago_id_mes' => 'id_mes',
            'comprobante_pago_anio' => 'anio',
        ] as $target => $source) {
            if ($proof !== null) $worker[$target] = $proof[$source] ?? null;
        }
    }
    unset($worker);

    $report['trabajadores'] = $workers;
    $report['periodo_cerrado'] = true;
    $report['cierre'] = [
        'id' => (int)$closedRow['id'],
        'cerrado_at' => (string)$closedRow['cerrado_at'],
        'cerrado_por' => $closedRow['cerrado_por'] !== null ? (int)$closedRow['cerrado_por'] : null,
        'snapshot_hash' => (string)($closedRow['snapshot_hash'] ?? ''),
    ];
    $report['resumen']['liquidaciones_pagadas'] = count($paid);
    $report['resumen']['periodo_cerrado'] = true;
    $report['advertencias'] = array_values(array_unique(array_merge(
        is_array($report['advertencias'] ?? null) ? $report['advertencias'] : [],
        ['Período cerrado: los importes provienen de una liquidación integral congelada y no pueden cambiar.']
    )));
    return $report;
}

function reptra_build_report(PDO $pdo, int $org, int $month, int $year, bool $applySnapshots = true): array
{
    if ($applySnapshots && $month > 0 && $year > 0
        && reportes_periodos_table_exists($pdo, 'reportes_periodos_cerrados')) {
        $closed = reportes_periodo_cerrado($pdo, $org, $month, $year);
        if ($closed) return reptra_closed_period_report($pdo, $closed, $org, $month, $year);

        // Los cierres históricos se reconstruyen únicamente desde el endpoint
        // administrativo de inicialización. Una consulta GET nunca debe crear
        // snapshots ni cerrar períodos por efecto secundario.
        if (reptra_load_paid_snapshots($pdo, $org, $month, $year)) {
            throw new RuntimeException(
                'El período tiene liquidaciones históricas pendientes de migrar. '
                . 'Entrá a Reportes con un usuario admin o contador para inicializar el blindaje.'
            );
        }
    }

    $payments = reptra_fetch_payments($pdo, $org, $month, $year);
    $expenses = reptra_fetch_expenses($pdo, $org, $month, $year);

    $ownIncome = round(array_sum(array_map(static fn(array $row): float => (float)$row['monto'], $payments)), 2);
    $ownExpenses = round(array_sum(array_map(static fn(array $row): float => (float)$row['monto'], $expenses)), 2);

    $ownReimbursements = reptra_reimbursements_all($pdo, $expenses);
    $reimbursementsByWorker = $ownReimbursements['workers'];
    $reimbursementsByOrganization = $ownReimbursements['organizations'];
    $totalReimbursements = round((float)$ownReimbursements['total'], 2);
    $ownGeneralExpenses = round($ownExpenses - $totalReimbursements, 2);
    $ownDistributable = round(max(0.0, $ownIncome - $ownExpenses), 2);
    $ownDeficit = round(max(0.0, $ownExpenses - $ownIncome), 2);

    $ownDetails = [];
    $warnings = [];
    $invalidPayments = 0;
    $fallbackPayments = 0;
    $paymentsWithoutSnapshot = 0;
    $invalidExpensePayers = count(array_filter(
        $expenses,
        static fn(array $expense): bool => empty($expense['pagadores_validos'])
    ));
    foreach ($expenses as $expense) {
        if (empty($expense['pagadores_validos'])) {
            $warnings[] = 'Egreso #' . (int)$expense['id_egreso']
                . ': los pagadores no coinciden exactamente con el monto del egreso.'
                . (!empty($expense['error_pagadores']) ? ' ' . (string)$expense['error_pagadores'] : '');
        }
    }

    foreach ($payments as $payment) {
        $paymentAmount = (float)$payment['monto'];
        try {
            $distribution = reparto_resumen_pago($pdo, $org, (int)$payment['id_pago'], false);
            $origin = (string)($distribution['origen'] ?? 'snapshot_pago');
            if (!empty($distribution['snapshot_faltante'])) $paymentsWithoutSnapshot++;
            reparto_validar_resumen_contable($distribution, $paymentAmount);
            $items = is_array($distribution['items'] ?? null) ? $distribution['items'] : [];
        } catch (Throwable $e) {
            $invalidPayments++;
            $origin = 'sin_distribucion';
            $items = [[
                'tipo_beneficiario' => 'organizacion',
                'id_organizacion_beneficiaria' => $org,
                'beneficiario_nombre' => 'SIN DISTRIBUCIÓN CONFIGURADA',
                'porcentaje' => 100.0,
                'monto_estimado' => $paymentAmount,
                'rutas' => [reptra_organization_code($pdo, $org)],
            ]];
            $warnings[] = 'Pago #' . (int)$payment['id_pago'] . ': ' . $e->getMessage();
        }

        foreach ($items as $item) {
            $gross = round((float)($item['monto_estimado'] ?? 0), 2);
            if ($gross <= 0) continue;
            $ownDetails[] = [
                'tipo_beneficiario' => (string)($item['tipo_beneficiario'] ?? 'organizacion'),
                'id_trabajador' => isset($item['id_trabajador']) ? (int)$item['id_trabajador'] : null,
                'id_organizacion_beneficiaria' => isset($item['id_organizacion_beneficiaria'])
                    ? (int)$item['id_organizacion_beneficiaria'] : null,
                'beneficiario_nombre' => trim((string)($item['beneficiario_nombre'] ?? 'Beneficiario')),
                'alias_pago_regla' => $item['alias_pago'] ?? null,
                'rol_regla' => $item['rol'] ?? null,
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

    // Los egresos propios afectan solo los ingresos propios de la entidad.
    $allocationRows = [];
    foreach ($ownDetails as $index => $detail) {
        $allocationRows[] = [
            'detail_index' => $index,
            'porcentaje' => $ownIncome > 0 ? ((float)$detail['monto_bruto'] / $ownIncome) * 100.0 : 0.0,
        ];
    }
    if ($allocationRows && $ownDistributable > 0) {
        $allocationRows = reparto_aplicar_montos_exactos($allocationRows, $ownDistributable);
        foreach ($allocationRows as $allocated) {
            $index = (int)$allocated['detail_index'];
            $ownDetails[$index]['monto_neto'] = round((float)($allocated['monto_estimado'] ?? 0), 2);
        }
    }

    // Las participaciones provenientes de otras entidades llegan ya netas de
    // los egresos de esa entidad. Así un gasto de BALTO no se mezcla con los
    // sistemas propios de 3DEVS.
    $external = reptra_external_incoming($pdo, $org, $month, $year);
    $details = array_merge($ownDetails, $external['details']);
    $warnings = array_merge($warnings, $external['warnings']);
    $invalidPayments += (int)($external['invalid_payments'] ?? 0);
    $invalidExpensePayers += (int)($external['invalid_expense_payers'] ?? 0);
    $paymentsWithoutSnapshot += (int)($external['payments_without_snapshot'] ?? 0);

    foreach (($external['reimbursements_workers'] ?? []) as $workerId => $amount) {
        reptra_add_amount($reimbursementsByWorker, (int)$workerId, (float)$amount);
    }
    foreach (($external['reimbursements_organizations'] ?? []) as $organizationId => $amount) {
        reptra_add_amount($reimbursementsByOrganization, (int)$organizationId, (float)$amount);
    }
    $externalReimbursements = round((float)($external['reimbursements_total'] ?? 0), 2);
    $totalReimbursements = round($totalReimbursements + $externalReimbursements, 2);

    $totalIncome = round($ownIncome + (float)$external['gross'], 2);
    $totalExpenses = round($ownExpenses + (float)$external['expense_impact'], 2);
    $generalExpenses = round(
        $ownGeneralExpenses + (float)$external['expense_impact'] - $externalReimbursements,
        2
    );
    $distributableBase = round($ownDistributable + (float)$external['net'], 2);

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
                    'nombre_regla' => $detail['beneficiario_nombre'],
                    'alias_regla' => $detail['alias_pago_regla'],
                    'rol_regla' => $detail['rol_regla'],
                ];
            }
            $workerAcc[$workerId]['monto_bruto'] += (float)$detail['monto_bruto'];
            $workerAcc[$workerId]['monto_neto'] += (float)$detail['monto_neto'];
            $workerAcc[$workerId]['detalle'][] = $detail;
            $workerAcc[$workerId]['sistemas'][(string)$detail['id_sistema'] . ':' . (string)($detail['organizacion_origen'] ?? '')] = true;
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
                'nombre_regla' => '',
                'alias_regla' => null,
                'rol_regla' => null,
            ];
        }
    }

    if ($reimbursementsByOrganization) {
        $organizationIds = array_keys($reimbursementsByOrganization);
        $placeholders = implode(',', array_fill(0, count($organizationIds), '?'));
        $organizationSt = $pdo->prepare("
            SELECT id_organizacion, nombre
            FROM organizaciones
            WHERE id_organizacion IN ({$placeholders})
        ");
        $organizationSt->execute($organizationIds);
        $organizationNames = [];
        foreach ($organizationSt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
            $organizationNames[(int)$row['id_organizacion']] = (string)$row['nombre'];
        }

        foreach ($reimbursementsByOrganization as $organizationId => $amount) {
            $name = $organizationNames[(int)$organizationId] ?? ('ORGANIZACIÓN #' . (int)$organizationId);
            $key = 'o:' . (int)$organizationId . ':' . $name;
            if (!isset($nonWorkerAcc[$key])) {
                $nonWorkerAcc[$key] = [
                    'beneficiario' => $name,
                    'id_organizacion_beneficiaria' => (int)$organizationId,
                    'monto_bruto' => 0.0,
                    'monto_neto' => 0.0,
                    'rutas' => [],
                ];
            }
            $nonWorkerAcc[$key]['monto_neto'] += round((float)$amount, 2);
            $nonWorkerAcc[$key]['rutas'][] = 'REEMBOLSO DE EGRESO';
        }
    }

    $metadata = reptra_worker_metadata($pdo, $org, array_keys($workerAcc), $month, $year);
    $proofs = reptra_load_proofs($pdo, $org, array_keys($workerAcc), $month, $year);

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
            $parts = preg_split('/\s+/', trim((string)$acc['nombre_regla'])) ?: [];
            $name = (string)array_shift($parts);
            $surname = implode(' ', $parts);
        }
        $isMember = (int)($meta['miembro_organizacion'] ?? 0) === 1;

        $workers[] = [
            'id' => (int)$workerId,
            'id_trabajador' => (int)$workerId,
            'nombre' => $name,
            'apellido' => $surname,
            'email' => (string)($meta['email'] ?? ''),
            'rol' => (string)($meta['rol_en_organizacion'] ?? $acc['rol_regla'] ?? $meta['rol_global'] ?? ''),
            'alias_pago' => (string)($meta['alias_pago'] ?? $acc['alias_regla'] ?? ''),
            'miembro_organizacion' => $isMember,
            'puede_comprobante' => $isMember,
            'puede_marcar_pagado' => $isMember && $month > 0 && $year > 0,
            'liquidacion_indirecta' => !$isMember,
            'pagado' => false,
            'pagado_at' => null,
            'liquidacion_snapshot_id' => null,
            'porcentaje_efectivo' => $totalIncome > 0 ? round(($gross / $totalIncome) * 100.0, 4) : 0.0,
            'sistemas_cobrados' => count($acc['sistemas']),
            'monto_bruto' => $gross,
            'descuento_egresos' => round(max(0.0, $gross - $net), 2),
            'monto_sistemas' => $net,
            'monto_reembolso' => $reimbursement,
            'monto' => round($net + $reimbursement, 2),
            'detalle' => array_values($acc['detalle']),
            'comprobante_pago' => $proof['archivo_url'] ?? null,
            'comprobante_pago_fecha' => $proof['created_at'] ?? null,
            'comprobante_pago_nombre' => $proof['archivo_nombre'] ?? null,
            'comprobante_pago_tipo' => $proof['archivo_tipo'] ?? null,
            'comprobante_pago_id_mes' => $proof['id_mes'] ?? null,
            'comprobante_pago_anio' => $proof['anio'] ?? null,
        ];
    }

    $paidSnapshots = $applySnapshots ? reptra_load_paid_snapshots($pdo, $org, $month, $year) : [];
    if ($paidSnapshots) {
        $byWorker = [];
        foreach ($workers as $worker) $byWorker[(int)$worker['id_trabajador']] = $worker;
        foreach ($paidSnapshots as $workerId => $paid) {
            $snapshot = $paid['snapshot'];
            $current = $byWorker[$workerId] ?? [];
            $proof = $proofs[$workerId] ?? null;
            foreach ([
                'comprobante_pago' => 'archivo_url',
                'comprobante_pago_fecha' => 'created_at',
                'comprobante_pago_nombre' => 'archivo_nombre',
                'comprobante_pago_tipo' => 'archivo_tipo',
                'comprobante_pago_id_mes' => 'id_mes',
                'comprobante_pago_anio' => 'anio',
            ] as $target => $source) {
                if ($proof !== null) $snapshot[$target] = $proof[$source] ?? null;
                elseif (array_key_exists($target, $current)) $snapshot[$target] = $current[$target];
            }
            $snapshot['pagado'] = true;
            $snapshot['pagado_at'] = $paid['pagado_at'];
            $snapshot['liquidacion_snapshot_id'] = $paid['id'];
            $snapshot['puede_marcar_pagado'] = false;
            $byWorker[$workerId] = $snapshot;
        }
        $workers = array_values($byWorker);
    }

    usort($workers, static fn(array $a, array $b): int => ($b['monto'] <=> $a['monto']) ?: strcmp((string)$a['apellido'], (string)$b['apellido']));

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
    $controlDifference = round(
        $totalIncome + $ownDeficit - $generalExpenses - ($workerPayout + $unassignedNet),
        2
    );

    if ($invalidPayments > 0) {
        $warnings[] = "{$invalidPayments} pago(s) tienen una distribución inválida y quedaron identificados como monto no asignado.";
    }
    if ($paymentsWithoutSnapshot > 0) {
        $warnings[] = "{$paymentsWithoutSnapshot} pago(s) no pudieron congelar su regla histórica. Ejecutá la migración antes de liquidar.";
    }
    if ($invalidExpensePayers > 0) {
        $warnings[] = "{$invalidExpensePayers} egreso(s) tienen pagadores inconsistentes; no generan reembolsos y bloquean la liquidación.";
    }
    if (abs($controlDifference) > 0.01) {
        $warnings[] = 'El control contable detectó una diferencia de $' . number_format($controlDifference, 2, ',', '.')
            . '. Puede deberse a una liquidación ya pagada que quedó congelada antes de modificar movimientos.';
    }

    $paidCount = count(array_filter($workers, static fn(array $row): bool => !empty($row['pagado'])));
    $directCount = count(array_filter($workers, static fn(array $row): bool => !empty($row['miembro_organizacion'])));

    return [
        'organizacion' => [
            'id_organizacion' => $org,
            'codigo' => reptra_organization_code($pdo, $org),
            'modelo_reparto' => reparto_organizacion_config($pdo, $org)['modelo_reparto'],
        ],
        'filtros' => ['mes' => $month ?: null, 'anio' => $year ?: null],
        'periodo_cerrado' => false,
        'resumen' => [
            'total_ingresos' => $totalIncome,
            'total_ingresos_propios' => $ownIncome,
            'ingresos_desde_entidades' => round((float)$external['gross'], 2),
            'total_egresos' => $totalExpenses,
            'total_egresos_propios' => $ownExpenses,
            'egresos_desde_entidades' => round((float)$external['expense_impact'], 2),
            'egresos_generales' => $generalExpenses,
            'reembolsos' => $totalReimbursements,
            'base_distribuible' => $distributableBase,
            'deficit_operativo' => $ownDeficit,
            'monto_bruto_trabajadores' => $workerGross,
            'monto_neto_trabajadores' => $workerNet,
            'total_a_pagar' => $workerPayout,
            'monto_bruto_no_persona' => $unassignedGross,
            'monto_neto_no_persona' => $unassignedNet,
            'diferencia_control' => $controlDifference,
            'pagos_invalidos' => $invalidPayments,
            'pagos_reparto_igualitario' => $fallbackPayments,
            'pagos_sin_snapshot' => $paymentsWithoutSnapshot,
            'egresos_pagadores_invalidos' => $invalidExpensePayers,
            'liquidaciones_pagadas' => $paidCount,
            'liquidaciones_directas' => $directCount,
            'periodo_cerrado' => false,
            'configuracion_ok' => $invalidPayments === 0
                && $fallbackPayments === 0
                && $paymentsWithoutSnapshot === 0
                && $invalidExpensePayers === 0
                && abs($controlDifference) <= 0.01,
        ],
        'trabajadores' => $workers,
        'beneficiarios_no_persona' => $nonWorkers,
        'advertencias' => array_values(array_unique($warnings)),
    ];
}


/** Organizaciones cuyo reparto alimenta directa o indirectamente a la entidad. */
function reptra_snapshot_scope_organizations(PDO $pdo, int $organizationId): array
{
    $pending = [$organizationId];
    $seen = [];
    while ($pending) {
        $current = (int)array_shift($pending);
        if ($current <= 0 || isset($seen[$current])) continue;
        $seen[$current] = true;
        foreach (reptra_parent_organizations($pdo, $current) as $parent) {
            $parentId = (int)($parent['id_organizacion_origen'] ?? 0);
            if ($parentId > 0 && !isset($seen[$parentId])) $pending[] = $parentId;
        }
        if (count($seen) > 20) {
            throw new RuntimeException('La jerarquía de entidades es demasiado extensa o contiene un ciclo.');
        }
    }
    $ids = array_map('intval', array_keys($seen));
    sort($ids);
    return $ids;
}

/**
 * Cierra de forma atómica la entidad y todas las entidades fuente de las que
 * depende su liquidación. Si 3DEVS empieza a pagar una participación de BALTO,
 * el mismo período de BALTO queda congelado en la misma transacción.
 *
 * @return array<int,array>
 */
function reptra_close_period_scope(
    PDO $pdo,
    int $organizationId,
    int $month,
    int $year,
    ?int $userId
): array {
    $organizations = reptra_snapshot_scope_organizations($pdo, $organizationId);

    // Mismo orden numérico en todos los cierres para reducir deadlocks entre
    // liquidaciones simultáneas de entidades relacionadas.
    sort($organizations);
    foreach ($organizations as $sourceOrganizationId) {
        reportes_periodo_bloquear_movimientos($pdo, $sourceOrganizationId, $month, $year);
    }

    $closedByOrganization = [];
    foreach ($organizations as $sourceOrganizationId) {
        $closed = reportes_periodo_cerrado(
            $pdo,
            $sourceOrganizationId,
            $month,
            $year,
            true
        );
        if (!$closed) {
            $rawReport = reptra_build_report($pdo, $sourceOrganizationId, $month, $year, false);
            if (!reptra_report_safe_to_close($rawReport)) {
                $reason = implode(' ', array_slice($rawReport['advertencias'] ?? [], 0, 3));
                throw new DomainException(
                    'No se puede cerrar ' . reptra_organization_code($pdo, $sourceOrganizationId)
                    . ': los controles contables no están en cero.'
                    . ($reason !== '' ? ' ' . $reason : '')
                );
            }

            $legacyPaid = reptra_load_paid_snapshots(
                $pdo,
                $sourceOrganizationId,
                $month,
                $year
            );
            if ($legacyPaid) {
                $rawReport = reptra_apply_legacy_paid_snapshots($rawReport, $legacyPaid);
            }

            $closed = reportes_periodo_guardar_snapshot(
                $pdo,
                $sourceOrganizationId,
                $month,
                $year,
                $rawReport,
                $userId
            );
        }
        $closedByOrganization[$sourceOrganizationId] = $closed;
    }

    if (!isset($closedByOrganization[$organizationId])) {
        throw new RuntimeException('No se pudo confirmar el cierre de la entidad activa.');
    }
    return $closedByOrganization;
}

/**
 * Congela la regla vigente de todos los movimientos ya existentes.
 * Se ejecuta una sola vez por entidad desde la pantalla de Reportes y deja una
 * base histórica estable antes de que alguien vuelva a editar porcentajes.
 */
function reptra_initialize_financial_snapshots(
    PDO $pdo,
    int $organizationId,
    ?int $userId = null
): array
{
    foreach (['pagos_reparto_snapshots', 'egresos_reparto_snapshots'] as $table) {
        if (!reptra_table_exists($pdo, $table)) {
            throw new RuntimeException('Falta ejecutar la migración de blindaje de liquidaciones.');
        }
    }

    $organizations = reptra_snapshot_scope_organizations($pdo, $organizationId);
    $paymentCount = 0;
    $expenseCount = 0;

    foreach ($organizations as $orgId) {
        // Bloquea las filas mientras se toma la fotografía inicial para que una
        // edición concurrente nunca pueda quedar mezclada con la regla anterior.
        $paymentLock = $pdo->prepare("\n            SELECT id_pago
            FROM pagos
            WHERE id_organizacion = :org
            ORDER BY id_pago
            FOR UPDATE
        ");
        $paymentLock->execute([':org' => $orgId]);
        $paymentIds = array_map('intval', $paymentLock->fetchAll(PDO::FETCH_COLUMN) ?: []);
        foreach ($paymentIds as $paymentId) {
            reparto_resumen_pago($pdo, $orgId, $paymentId, true);
            $paymentCount++;
        }

        $expenseLock = $pdo->prepare("\n            SELECT id_egreso
            FROM egresos
            WHERE id_organizacion = :org
            ORDER BY id_egreso
            FOR UPDATE
        ");
        $expenseLock->execute([':org' => $orgId]);
        $expenseIds = array_map('intval', $expenseLock->fetchAll(PDO::FETCH_COLUMN) ?: []);
        if ($expenseIds && reptra_table_exists($pdo, 'egresos_pagadores')) {
            $placeholders = implode(',', array_fill(0, count($expenseIds), '?'));
            $payerLock = $pdo->prepare("\n                SELECT id_pagador
                FROM egresos_pagadores
                WHERE id_egreso IN ({$placeholders})
                ORDER BY id_pagador
                FOR UPDATE
            ");
            $payerLock->execute($expenseIds);
            $payerLock->fetchAll(PDO::FETCH_COLUMN);
        }

        $expenses = reptra_fetch_expenses($pdo, $orgId, 0, 0, true);
        foreach ($expenses as $expense) {
            if (empty($expense['pagadores_validos'])) {
                $message = trim((string)($expense['error_pagadores'] ?? ''));
                throw new DomainException(
                    'El egreso #' . (int)$expense['id_egreso'] . ' tiene pagadores inválidos.'
                    . ($message !== '' ? ' ' . $message : '')
                );
            }
            if (!empty($expense['pagadores_originales'])) $expenseCount++;
        }
    }

    $closedPeriods = 0;
    if (reptra_table_exists($pdo, 'trabajadores_liquidaciones_pagadas')) {
        $placeholders = implode(',', array_fill(0, count($organizations), '?'));
        $paidPeriodsSt = $pdo->prepare("\n            SELECT id_organizacion, id_mes, anio
            FROM trabajadores_liquidaciones_pagadas
            WHERE id_organizacion IN ({$placeholders})
            GROUP BY id_organizacion, id_mes, anio
            ORDER BY anio, id_mes, id_organizacion
        ");
        $paidPeriodsSt->execute($organizations);
        foreach ($paidPeriodsSt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $period) {
            $periodOrganizationId = (int)$period['id_organizacion'];
            $periodMonth = (int)$period['id_mes'];
            $periodYear = (int)$period['anio'];
            $wasClosed = reportes_periodo_cerrado(
                $pdo,
                $periodOrganizationId,
                $periodMonth,
                $periodYear
            ) !== null;
            reptra_close_period_scope(
                $pdo,
                $periodOrganizationId,
                $periodMonth,
                $periodYear,
                $userId
            );
            if (!$wasClosed) $closedPeriods++;
        }
    }

    return [
        'organizaciones_procesadas' => count($organizations),
        'pagos_procesados' => $paymentCount,
        'egresos_con_pagadores_procesados' => $expenseCount,
        'periodos_historicos_cerrados' => $closedPeriods,
    ];
}

try {
    if (!($pdo instanceof PDO)) reptra_fail('Conexión PDO no disponible.');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('SET NAMES utf8mb4');

    $org = reportes_org_id();
    if (!in_array($op, [
        'trabajadores', 'trabajadores_activos', 'egreso_pagadores', 'trabajador_subir_comprobante',
        'trabajador_comprobante_latest', 'trabajador_comprobantes_listar',
        'trabajador_marcar_pagado', 'blindaje_inicializar',
    ], true)) {
        reptra_fail('op no válida en reportes/trabajadores: ' . $op);
    }

    if ($op === 'blindaje_inicializar') {
        reportes_require_write();
        if (reptra_method() !== 'POST') reptra_fail('Método no permitido. Se esperaba POST.');
        try {
            $auth = reportes_auth();
            $pdo->beginTransaction();
            $result = reptra_initialize_financial_snapshots(
                $pdo,
                $org,
                (int)($auth['id_usuario'] ?? 0) ?: null
            );
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            reptra_fail('No se pudo inicializar el blindaje histórico: ' . $e->getMessage());
        }
        reptra_ok([
            'mensaje' => 'Movimientos históricos congelados correctamente.',
            'resultado' => $result,
        ]);
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

        $periodStart = sprintf('%04d-%02d-01', $year, $month);
        $periodEnd = (new DateTimeImmutable($periodStart))->format('Y-m-t');
        $member = $pdo->prepare("\n            SELECT 1
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
            $st = $pdo->prepare("\n                INSERT INTO trabajadores_comprobantes
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

    if ($op === 'trabajador_marcar_pagado') {
        reportes_require_write();
        if (reptra_method() !== 'POST') reptra_fail('Método no permitido. Se esperaba POST.');
        foreach (['trabajadores_liquidaciones_pagadas', 'reportes_periodos_cerrados',
                  'pagos_reparto_snapshots', 'egresos_reparto_snapshots'] as $requiredTable) {
            if (!reptra_table_exists($pdo, $requiredTable)) {
                reptra_fail('Falta ejecutar la migración de blindaje de liquidaciones.');
            }
        }
        try {
            $body = reptra_json_body();
            [$month, $year] = reptra_period($body);
        } catch (Throwable $e) {
            reptra_fail($e->getMessage());
        }
        $workerId = (int)($body['id_trabajador'] ?? $body['id'] ?? 0);
        if ($workerId <= 0) reptra_fail('ID de trabajador inválido.');

        $auth = reportes_auth();
        $pdo->beginTransaction();
        try {
            // Congela en la misma transacción la entidad activa y todas
            // sus fuentes. Por ejemplo, al liquidar 3DEVS también se cierra el
            // período de BALTO que origina esa participación.
            $closedScope = reptra_close_period_scope(
                $pdo,
                $org,
                $month,
                $year,
                (int)($auth['id_usuario'] ?? 0) ?: null
            );
            $closed = $closedScope[$org];

            $existing = $pdo->prepare("\n                SELECT id, pagado_at\n                FROM trabajadores_liquidaciones_pagadas\n                WHERE id_organizacion = :org\n                  AND id_trabajador = :worker\n                  AND id_mes = :month\n                  AND anio = :year\n                LIMIT 1\n                FOR UPDATE\n            ");
            $existing->execute([':org' => $org, ':worker' => $workerId, ':month' => $month, ':year' => $year]);
            if ($row = $existing->fetch(PDO::FETCH_ASSOC)) {
                $pdo->commit();
                reptra_ok([
                    'mensaje' => 'La liquidación ya estaba marcada como pagada.',
                    'liquidacion' => ['id' => (int)$row['id'], 'pagado_at' => (string)$row['pagado_at']],
                ]);
            }

            $closedReport = reptra_closed_period_report($pdo, $closed, $org, $month, $year);
            if (!reptra_report_safe_to_close($closedReport)) {
                throw new DomainException('El cierre del período no supera los controles contables y no admite nuevos pagos.');
            }
            $worker = null;
            foreach ($closedReport['trabajadores'] as $candidate) {
                if ((int)$candidate['id_trabajador'] === $workerId) {
                    $worker = $candidate;
                    break;
                }
            }
            if (!$worker) throw new DomainException('El trabajador no tiene liquidación en el período seleccionado.');
            if (empty($worker['miembro_organizacion'])) {
                throw new DomainException('La liquidación es indirecta y se debe marcar como pagada en la entidad del trabajador.');
            }

            $worker['pagado'] = true;
            $worker['puede_marcar_pagado'] = false;
            $snapshotJson = json_encode($worker, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
            $summaryJson = json_encode($closedReport['resumen'], JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
            if ($snapshotJson === false || $summaryJson === false) {
                throw new RuntimeException('No se pudo serializar la liquidación.');
            }

            $st = $pdo->prepare("\n                INSERT INTO trabajadores_liquidaciones_pagadas\n                    (id_organizacion, id_trabajador, id_mes, anio,\n                     monto_bruto, descuento_egresos, monto_sistemas,\n                     monto_reembolso, monto_total, porcentaje_efectivo,\n                     sistemas_cobrados, snapshot_json, resumen_json, pagado_por)\n                VALUES\n                    (:org, :worker, :month, :year,\n                     :gross, :expenses, :systems,\n                     :refund, :total, :percentage,\n                     :systems_count, :snapshot, :summary, :user)\n            ");
            $st->execute([
                ':org' => $org,
                ':worker' => $workerId,
                ':month' => $month,
                ':year' => $year,
                ':gross' => (float)$worker['monto_bruto'],
                ':expenses' => (float)$worker['descuento_egresos'],
                ':systems' => (float)$worker['monto_sistemas'],
                ':refund' => (float)$worker['monto_reembolso'],
                ':total' => (float)$worker['monto'],
                ':percentage' => (float)$worker['porcentaje_efectivo'],
                ':systems_count' => (int)$worker['sistemas_cobrados'],
                ':snapshot' => $snapshotJson,
                ':summary' => $summaryJson,
                ':user' => (int)($auth['id_usuario'] ?? 0) ?: null,
            ]);
            $id = (int)$pdo->lastInsertId();
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            reptra_fail($e->getMessage());
        }

        reptra_ok([
            'mensaje' => 'Liquidación pagada. El período completo quedó cerrado y congelado.',
            'periodo_cerrado' => true,
            'liquidacion' => [
                'id' => $id,
                'id_trabajador' => $workerId,
                'id_mes' => $month,
                'anio' => $year,
                'monto' => (float)$worker['monto'],
            ],
        ]);
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
        $st = $pdo->prepare("\n            SELECT id, id_organizacion, id_trabajador, id_mes, anio,
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

    if ($op === 'egreso_pagadores') {
        $workerIds = [];

        $directWorkers = $pdo->prepare("
            SELECT tro.id_trabajador
            FROM trabajadores_organizaciones tro
            INNER JOIN trabajadores t ON t.id = tro.id_trabajador
            WHERE tro.id_organizacion = :org
              AND tro.activo = 1
              AND t.activo = 1
        ");
        $directWorkers->execute([':org' => $org]);
        foreach ($directWorkers->fetchAll(PDO::FETCH_COLUMN) ?: [] as $workerId) {
            $id = (int)$workerId;
            if ($id > 0) $workerIds[$id] = true;
        }

        foreach (reparto_expandir_organizacion($pdo, $org) as $item) {
            if (($item['tipo_beneficiario'] ?? '') !== 'trabajador') continue;
            $id = (int)($item['id_trabajador'] ?? 0);
            if ($id > 0) $workerIds[$id] = true;
        }

        $workers = [];
        if ($workerIds) {
            $ids = array_keys($workerIds);
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $st = $pdo->prepare("
                SELECT
                    t.id, t.nombre, t.apellido, t.email, t.alias_pago,
                    COALESCE(tro_actual.rol_en_organizacion, t.rol) AS rol,
                    o.codigo AS organizacion_codigo,
                    o.nombre AS organizacion_nombre
                FROM trabajadores t
                LEFT JOIN organizaciones o
                  ON o.id_organizacion = t.id_organizacion
                LEFT JOIN trabajadores_organizaciones tro_actual
                  ON tro_actual.id_organizacion = ?
                 AND tro_actual.id_trabajador = t.id
                WHERE t.id IN ({$placeholders})
                  AND t.activo = 1
                ORDER BY t.apellido, t.nombre, t.id
            ");
            $st->execute(array_merge([$org], $ids));
            $workers = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
        }

        $organizations = [];
        foreach (reparto_items_organizacion($pdo, $org) as $item) {
            if (($item['tipo_beneficiario'] ?? '') !== 'organizacion') continue;
            $id = (int)($item['id_organizacion_beneficiaria'] ?? 0);
            if ($id <= 0) continue;
            $organizations[$id] = [
                'id_organizacion' => $id,
                'codigo' => (string)($item['organizacion_codigo'] ?? ''),
                'nombre' => (string)($item['beneficiario_nombre'] ?? ''),
                'porcentaje' => round((float)($item['porcentaje'] ?? 0), 4),
            ];
        }

        reptra_ok([
            'trabajadores' => $workers,
            'organizaciones' => array_values($organizations),
        ]);
    }

    if ($op === 'trabajadores_activos') {
        $st = $pdo->prepare("\n            SELECT
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

    reptra_ok(reptra_build_report($pdo, $org, $month, $year, true));
} catch (Throwable $e) {
    reptra_fail('Error en reportes/trabajadores: ' . $e->getMessage());
}
