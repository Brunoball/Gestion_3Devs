<?php
// backend/modules/reportes/reportes.php
declare(strict_types=1);

global $pdo;
require_once __DIR__ . '/common.php';

$op = strtolower(trim((string)($_GET['op'] ?? '')));

if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
}

function rep_json_ok(array $extra = []): never
{
    http_response_code(200);
    echo json_encode(array_merge(['exito' => true], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

function rep_json_fail(string $mensaje, array $extra = []): never
{
    http_response_code(200);
    echo json_encode(array_merge(['exito' => false, 'mensaje' => $mensaje], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    if (!($pdo instanceof PDO)) rep_json_fail('Conexión PDO no disponible.');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('SET NAMES utf8mb4');

    $auth = reportes_auth();
    $org = reportes_org_id();

    if ($op === 'ping') {
        rep_json_ok([
            'modulo' => 'reportes',
            'organizacion' => [
                'id_organizacion' => $org,
                'codigo' => reportes_org_code(),
                'nombre' => (string)($auth['organizacion_nombre'] ?? ''),
            ],
            'ts' => date('c'),
        ]);
    }

    if ($op === 'lista') {
        rep_json_ok([
            'reportes' => [
                ['id' => 'movimientos', 'nombre' => 'Ingresos y egresos', 'metodo' => 'GET'],
                ['id' => 'trabajadores', 'nombre' => 'Liquidación por trabajador', 'metodo' => 'GET'],
                ['id' => 'anios', 'nombre' => 'Años disponibles', 'metodo' => 'GET'],
            ],
        ]);
    }

    if ($op === 'anios') {
        if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
            rep_json_fail('Método no permitido. Se esperaba GET.');
        }

        // Criterio de caja: los pagos se agrupan por la fecha en que ingresó el
        // dinero (fecha_pago), igual que los egresos por su fecha.
        // Además se habilita el año del PERÍODO cobrado (anio_periodo): si se
        // registró un pago de ENERO 2027, el año 2027 aparece en el selector.
        // El año actual siempre está disponible.
        $st = $pdo->prepare("
            SELECT anio
            FROM (
                SELECT DISTINCT YEAR(p.fecha_pago) AS anio
                FROM pagos p
                WHERE p.id_organizacion = :org_p
                  AND p.fecha_pago IS NOT NULL

                UNION

                SELECT DISTINCT p2.anio_periodo AS anio
                FROM pagos p2
                WHERE p2.id_organizacion = :org_pp

                UNION

                SELECT DISTINCT YEAR(e.fecha) AS anio
                FROM egresos e
                WHERE e.id_organizacion = :org_e
                  AND e.fecha IS NOT NULL
            ) periodos
            WHERE anio IS NOT NULL
        ");
        $st->execute([':org_p' => $org, ':org_pp' => $org, ':org_e' => $org]);

        $anios = array_map(
            static fn($value): int => (int)$value,
            $st->fetchAll(PDO::FETCH_COLUMN) ?: []
        );
        $anios[] = (int)date('Y');
        $anios = array_values(array_unique(array_filter(
            $anios,
            static fn(int $year): bool => $year >= 2000 && $year <= 2100
        )));
        rsort($anios);

        rep_json_ok([
            'anios' => $anios,
            'organizacion' => [
                'id_organizacion' => $org,
                'codigo' => reportes_org_code(),
            ],
        ]);
    }

    if ($op === 'estadisticas') {
        // Endpoint liviano de compatibilidad. Los gráficos actuales consumen
        // movimientos y trabajadores, pero este resumen evita una ruta inválida.
        $anio = isset($_GET['anio']) && is_numeric($_GET['anio']) ? (int)$_GET['anio'] : 0;
        $wherePago = 'p.id_organizacion = :org_p';
        $whereEgreso = 'e.id_organizacion = :org_e';
        $params = [':org_p' => $org, ':org_e' => $org];
        if ($anio >= 2000 && $anio <= 2100) {
            $wherePago .= ' AND YEAR(p.fecha_pago) = :anio_p';
            $whereEgreso .= ' AND YEAR(e.fecha) = :anio_e';
            $params[':anio_p'] = $anio;
            $params[':anio_e'] = $anio;
        }

        $sql = "
            SELECT mes.id_mes, mes.mes,
                   COALESCE(p.total_ingresos, 0) AS ingresos,
                   COALESCE(e.total_egresos, 0) AS egresos
            FROM meses mes
            LEFT JOIN (
                SELECT MONTH(p.fecha_pago) AS id_mes, SUM(p.monto) AS total_ingresos
                FROM pagos p
                WHERE {$wherePago}
                GROUP BY MONTH(p.fecha_pago)
            ) p ON p.id_mes = mes.id_mes
            LEFT JOIN (
                SELECT MONTH(e.fecha) AS id_mes, SUM(e.monto) AS total_egresos
                FROM egresos e
                WHERE {$whereEgreso}
                GROUP BY MONTH(e.fecha)
            ) e ON e.id_mes = mes.id_mes
            ORDER BY mes.id_mes
        ";
        $st = $pdo->prepare($sql);
        $st->execute($params);
        rep_json_ok(['series' => $st->fetchAll(PDO::FETCH_ASSOC) ?: []]);
    }

    rep_json_fail('op no válida en reportes: ' . $op);
} catch (Throwable $e) {
    rep_json_fail('Error en reportes: ' . $e->getMessage());
}
