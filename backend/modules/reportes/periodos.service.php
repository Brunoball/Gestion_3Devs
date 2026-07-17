<?php
// backend/modules/reportes/periodos.service.php
declare(strict_types=1);

/**
 * Blindaje de períodos contables de Reportes.
 * Un período cerrado conserva una liquidación integral e inmutable y no admite
 * altas, bajas ni modificaciones de pagos, egresos o pagadores de egresos.
 */

function reportes_periodos_table_exists(PDO $pdo, string $table): bool
{
    static $cache = [];
    if (array_key_exists($table, $cache)) return (bool)$cache[$table];

    $st = $pdo->prepare("\n        SELECT COUNT(*)\n        FROM information_schema.TABLES\n        WHERE TABLE_SCHEMA = DATABASE()\n          AND TABLE_NAME = :tabla\n    ");
    $st->execute([':tabla' => $table]);
    $cache[$table] = (int)$st->fetchColumn() > 0;
    return (bool)$cache[$table];
}

function reportes_periodo_normalizar(int $month, int $year): array
{
    if ($month < 1 || $month > 12) {
        throw new DomainException('El mes contable es inválido.');
    }
    if ($year < 2000 || $year > 2100) {
        throw new DomainException('El año contable es inválido.');
    }
    return [$month, $year];
}

function reportes_periodo_desde_fecha(string $date): array
{
    $dt = DateTimeImmutable::createFromFormat('!Y-m-d', trim($date));
    if (!$dt || $dt->format('Y-m-d') !== trim($date)) {
        throw new DomainException('La fecha contable es inválida.');
    }
    return [(int)$dt->format('n'), (int)$dt->format('Y')];
}

function reportes_periodo_cerrado(
    PDO $pdo,
    int $organizationId,
    int $month,
    int $year,
    bool $forUpdate = false
): ?array {
    reportes_periodo_normalizar($month, $year);
    if (!reportes_periodos_table_exists($pdo, 'reportes_periodos_cerrados')) return null;

    $sql = "\n        SELECT id, id_organizacion, id_mes, anio, estado,
               snapshot_json, resumen_json, snapshot_hash,
               cerrado_por, cerrado_at, created_at, updated_at
        FROM reportes_periodos_cerrados
        WHERE id_organizacion = :org
          AND id_mes = :month
          AND anio = :year
        LIMIT 1
    ";
    if ($forUpdate) $sql .= ' FOR UPDATE';

    $st = $pdo->prepare($sql);
    $st->execute([':org' => $organizationId, ':month' => $month, ':year' => $year]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function reportes_periodo_assert_abierto(PDO $pdo, int $organizationId, int $month, int $year): void
{
    reportes_periodo_normalizar($month, $year);
    if (!reportes_periodos_table_exists($pdo, 'reportes_periodos_cerrados')) {
        throw new RuntimeException('Falta ejecutar la migración de blindaje de liquidaciones.');
    }

    if (reportes_periodo_cerrado($pdo, $organizationId, $month, $year) !== null) {
        throw new DomainException(sprintf(
            'El período %02d/%04d está cerrado porque ya comenzó su liquidación. No se pueden modificar movimientos.',
            $month,
            $year
        ));
    }
}

function reportes_periodo_bloquear_guarda(PDO $pdo, int $organizationId, int $month, int $year): void
{
    reportes_periodo_normalizar($month, $year);
    if (!reportes_periodos_table_exists($pdo, 'reportes_periodos_guardas')) {
        throw new RuntimeException('Falta ejecutar la migración de blindaje de liquidaciones.');
    }
    if (!$pdo->inTransaction()) {
        throw new LogicException('El bloqueo del período requiere una transacción activa.');
    }

    $insert = $pdo->prepare("
        INSERT IGNORE INTO reportes_periodos_guardas
            (id_organizacion, id_mes, anio)
        VALUES (:org, :month, :year)
    ");
    $insert->execute([':org' => $organizationId, ':month' => $month, ':year' => $year]);

    $lock = $pdo->prepare("
        SELECT id
        FROM reportes_periodos_guardas
        WHERE id_organizacion = :org
          AND id_mes = :month
          AND anio = :year
        LIMIT 1
        FOR UPDATE
    ");
    $lock->execute([':org' => $organizationId, ':month' => $month, ':year' => $year]);
    if (!$lock->fetchColumn()) throw new RuntimeException('No se pudo bloquear el período contable.');
}

function reportes_periodo_bloquear_movimientos(PDO $pdo, int $organizationId, int $month, int $year): void
{
    reportes_periodo_normalizar($month, $year);
    reportes_periodo_bloquear_guarda($pdo, $organizationId, $month, $year);

    $payments = $pdo->prepare("\n        SELECT id_pago
        FROM pagos
        WHERE id_organizacion = :org
          AND id_mes = :month
          AND anio_periodo = :year
        ORDER BY id_pago
        FOR UPDATE
    ");
    $payments->execute([':org' => $organizationId, ':month' => $month, ':year' => $year]);
    $payments->fetchAll(PDO::FETCH_COLUMN);

    $periodStart = sprintf('%04d-%02d-01', $year, $month);
    $periodEnd = (new DateTimeImmutable($periodStart))->modify('+1 month')->format('Y-m-d');
    $expenses = $pdo->prepare("
        SELECT id_egreso
        FROM egresos
        WHERE id_organizacion = :org
          AND fecha >= :period_start
          AND fecha < :period_end
        ORDER BY id_egreso
        FOR UPDATE
    ");
    $expenses->execute([
        ':org' => $organizationId,
        ':period_start' => $periodStart,
        ':period_end' => $periodEnd,
    ]);
    $expenseIds = array_map('intval', $expenses->fetchAll(PDO::FETCH_COLUMN) ?: []);

    if ($expenseIds && reportes_periodos_table_exists($pdo, 'egresos_pagadores')) {
        $placeholders = implode(',', array_fill(0, count($expenseIds), '?'));
        $payers = $pdo->prepare("\n            SELECT id_pagador
            FROM egresos_pagadores
            WHERE id_egreso IN ({$placeholders})
            ORDER BY id_pagador
            FOR UPDATE
        ");
        $payers->execute($expenseIds);
        $payers->fetchAll(PDO::FETCH_COLUMN);
    }
}

function reportes_periodo_guardar_snapshot(
    PDO $pdo,
    int $organizationId,
    int $month,
    int $year,
    array $report,
    ?int $userId
): array {
    reportes_periodo_normalizar($month, $year);
    if (!reportes_periodos_table_exists($pdo, 'reportes_periodos_cerrados')) {
        throw new RuntimeException('Falta ejecutar la migración de blindaje de liquidaciones.');
    }

    $snapshotJson = json_encode($report, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    $summaryJson = json_encode($report['resumen'] ?? [], JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    if ($snapshotJson === false || $summaryJson === false) {
        throw new RuntimeException('No se pudo serializar el cierre del período.');
    }
    $hash = hash('sha256', $snapshotJson);

    $insert = $pdo->prepare("\n        INSERT INTO reportes_periodos_cerrados
            (id_organizacion, id_mes, anio, estado,
             snapshot_json, resumen_json, snapshot_hash,
             cerrado_por, cerrado_at)
        VALUES
            (:org, :month, :year, 'cerrado',
             :snapshot, :summary, :hash,
             :user, NOW())
        ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
    ");
    $insert->execute([
        ':org' => $organizationId,
        ':month' => $month,
        ':year' => $year,
        ':snapshot' => $snapshotJson,
        ':summary' => $summaryJson,
        ':hash' => $hash,
        ':user' => $userId ?: null,
    ]);

    $row = reportes_periodo_cerrado($pdo, $organizationId, $month, $year, true);
    if (!$row) throw new RuntimeException('No se pudo confirmar el cierre del período.');
    return $row;
}

function reportes_periodo_decodificar_snapshot(array $row): array
{
    $json = (string)($row['snapshot_json'] ?? '');
    $decoded = json_decode($json, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('El cierre del período está dañado o incompleto.');
    }

    $storedHash = trim((string)($row['snapshot_hash'] ?? ''));
    if ($storedHash !== '' && !hash_equals($storedHash, hash('sha256', $json))) {
        throw new RuntimeException('El control de integridad del cierre del período no coincide.');
    }
    return $decoded;
}
