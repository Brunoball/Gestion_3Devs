<?php
// backend/modules/reportes/reportes.php
declare(strict_types=1);

global $pdo;

/**
 * IMPORTANTE:
 * - El router (route.php) solo incluye este archivo.
 * - Tu equipo SOLO debería tocar este archivo: agregar ops / queries / formatos.
 */

$op = $_GET['op'] ?? '';

/* =========================
   Helpers JSON (estándar)
========================= */
function json_ok(array $extra = []): void {
  http_response_code(200);
  echo json_encode(array_merge(['exito' => true], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

function json_fail(string $mensaje, array $extra = []): void {
  http_response_code(200);
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $mensaje], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

/* =========================
   Helpers request
========================= */
function req_method(): string {
  return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function int_param(string $key, int $default = 0): int {
  $v = $_GET[$key] ?? null;
  if ($v === null || $v === '') return $default;
  return (int)$v;
}

function str_param(string $key, string $default = ''): string {
  $v = $_GET[$key] ?? null;
  if ($v === null) return $default;
  return trim((string)$v);
}

/* =========================
   Dispatch de operaciones
========================= */
try {
  if (!($pdo instanceof PDO)) {
    json_fail('Conexión PDO no disponible.');
  }

  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  if ($op === '') {
    json_fail('Falta parámetro op en reportes');
  }

  switch ($op) {

    /* =========================================================
       ✅ ping
       GET /api.php?action=reportes&op=ping
    ========================================================= */
    case 'ping': {
      json_ok([
        'modulo' => 'reportes',
        'op' => 'ping',
        'ts' => date('c'),
      ]);
    }

    /* =========================================================
       ✅ catálogo
       GET /api.php?action=reportes&op=lista
    ========================================================= */
    case 'lista': {
      json_ok([
        'reportes' => [
          ['id' => 'movimientos', 'nombre' => 'Pagos (movimientos)', 'metodo' => 'GET'],
          ['id' => 'anios', 'nombre' => 'Años disponibles (pagos)', 'metodo' => 'GET'],
        ]
      ]);
    }

    /* =========================================================
       ✅ AÑOS DISPONIBLES (desde pagos.fecha_pago)
       GET /api.php?action=reportes&op=anios

       Devuelve:
       - anios: [2026, 2025, 2024, ...]
    ========================================================= */
    case 'anios': {
      $method = req_method();
      if ($method !== 'GET') json_fail('Método no permitido. Se esperaba GET');

      $sql = "
        SELECT DISTINCT YEAR(p.fecha_pago) AS anio
        FROM pagos p
        WHERE p.fecha_pago IS NOT NULL
        ORDER BY anio DESC
      ";

      $st = $pdo->prepare($sql);
      $st->execute();
      $rows = $st->fetchAll(PDO::FETCH_ASSOC);

      $anios = [];
      foreach ($rows as $r) {
        $y = (int)($r['anio'] ?? 0);
        if ($y > 0) $anios[] = $y;
      }

      json_ok([
        'anios' => $anios,
      ]);
    }

    /* =========================================================
       ✅ MOVIMIENTOS (PAGOS)
       GET /api.php?action=reportes&op=movimientos
       GET /api.php?action=reportes&op=movimientos&mes=3
       GET /api.php?action=reportes&op=movimientos&anio=2026
       GET /api.php?action=reportes&op=movimientos&anio=2026&mes=3

       Devuelve formato compatible con tu Reportes.jsx:
       - pagos: [{id, fecha, concepto, categoria, medio, monto, ...extras }]
       - egresos: []
    ========================================================= */
    case 'movimientos': {
      $method = req_method();
      if ($method !== 'GET') json_fail('Método no permitido. Se esperaba GET');

      $mes  = int_param('mes', 0);   // id_mes
      $anio = int_param('anio', 0);  // YEAR(fecha_pago)

      $sql = "
        SELECT
          p.id_pago    AS id,
          p.fecha_pago AS fecha,

          -- Nombres reales:
          c.nombre     AS cliente_nombre,
          cs.nombre    AS sistema_nombre,

          -- Para tu front actual:
          CONCAT(c.nombre, ' - ', cs.nombre) AS concepto,

          m.mes        AS categoria,
          mp.nombre    AS medio,
          p.monto      AS monto,

          -- Extras por si después querés usarlos:
          p.id_sistema AS id_sistema,
          p.id_mes     AS id_mes,
          p.id_medio_pago AS id_medio_pago
        FROM pagos p
        JOIN clientes_sistemas cs ON cs.id_sistema = p.id_sistema
        JOIN clientes c          ON c.id_cliente  = cs.id_cliente
        LEFT JOIN meses m        ON m.id_mes      = p.id_mes
        LEFT JOIN medios_pago mp ON mp.id_medio_pago = p.id_medio_pago
        WHERE 1=1
      ";

      $params = [];

      if ($mes > 0) {
        $sql .= " AND p.id_mes = :mes ";
        $params[':mes'] = $mes;
      }

      if ($anio > 0) {
        $sql .= " AND YEAR(p.fecha_pago) = :anio ";
        $params[':anio'] = $anio;
      }

      $sql .= " ORDER BY p.fecha_pago DESC, p.id_pago DESC ";

      $st = $pdo->prepare($sql);
      $st->execute($params);
      $rows = $st->fetchAll(PDO::FETCH_ASSOC);

      $pagos = array_map(function ($r) {
        return [
          'id'             => (int)($r['id'] ?? 0),
          'fecha'          => (string)($r['fecha'] ?? ''),
          'concepto'       => (string)($r['concepto'] ?? ''), // Cliente - Sistema (compat)
          'categoria'      => $r['categoria'] !== null ? (string)$r['categoria'] : '',
          'medio'          => $r['medio'] !== null ? (string)$r['medio'] : '',
          'monto'          => (float)($r['monto'] ?? 0),

          // extras
          'cliente_nombre' => $r['cliente_nombre'] !== null ? (string)$r['cliente_nombre'] : '',
          'sistema_nombre' => $r['sistema_nombre'] !== null ? (string)$r['sistema_nombre'] : '',
          'id_sistema'     => (int)($r['id_sistema'] ?? 0),
          'id_mes'         => (int)($r['id_mes'] ?? 0),
          'id_medio_pago'  => (int)($r['id_medio_pago'] ?? 0),
        ];
      }, $rows);

      json_ok([
        'filtros' => [
          'mes'  => $mes > 0 ? $mes : null,
          'anio' => $anio > 0 ? $anio : null,
        ],
        'pagos' => $pagos,
        'egresos' => [],
      ]);
    }

    default: {
      json_fail('op no válida en reportes: ' . $op);
    }
  }

} catch (Throwable $e) {
  json_fail('Error en reportes: ' . $e->getMessage());
}
