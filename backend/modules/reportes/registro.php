<?php
// backend/modules/reportes/registros.php
declare(strict_types=1);

global $pdo;

$op = $_GET['op'] ?? '';

/* =========================
   Helpers JSON
========================= */
if (!function_exists('repreg_json_ok')) {
  function repreg_json_ok(array $extra = []): void {
    http_response_code(200);
    echo json_encode(array_merge(['exito' => true], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}
if (!function_exists('repreg_json_fail')) {
  function repreg_json_fail(string $mensaje, array $extra = []): void {
    http_response_code(200);
    echo json_encode(array_merge(['exito' => false, 'mensaje' => $mensaje], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('repreg_req_method')) {
  function repreg_req_method(): string {
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
  }
}
if (!function_exists('repreg_int')) {
  function repreg_int(string $key, int $default = 0): int {
    $v = $_GET[$key] ?? null;
    if ($v === null || $v === '') return $default;
    return (int)$v;
  }
}

try {
  if (!($pdo instanceof PDO)) repreg_json_fail('Conexión PDO no disponible.');

  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  if ($op === '') repreg_json_fail('Falta parámetro op en reportes');

  if (!in_array($op, ['movimientos', 'registros'], true)) {
    repreg_json_fail('op no válida en registros: ' . $op);
  }

  if (repreg_req_method() !== 'GET') repreg_json_fail('Método no permitido. Se esperaba GET');

  $mes  = repreg_int('mes', 0);    // id_mes (1..12)
  $anio = repreg_int('anio', 0);   // YEAR(fecha)

  /* =========================
     PAGOS
  ========================= */
  $sqlP = "
    SELECT
      p.id_pago    AS id,
      p.fecha_pago AS fecha,
      c.nombre     AS cliente_nombre,
      cs.nombre    AS sistema_nombre,
      CONCAT(c.nombre, ' - ', cs.nombre) AS concepto,
      COALESCE(m.mes, '')        AS categoria,
      COALESCE(mp.nombre, '')   AS medio,
      COALESCE(p.monto, 0)      AS monto
    FROM pagos p
    JOIN clientes_sistemas cs ON cs.id_sistema = p.id_sistema
    JOIN clientes c          ON c.id_cliente  = cs.id_cliente
    LEFT JOIN meses m        ON m.id_mes      = p.id_mes
    LEFT JOIN medios_pago mp ON mp.id_medio_pago = p.id_medio_pago
    WHERE 1=1
  ";

  $paramsP = [];

  if ($mes > 0) {
    $sqlP .= " AND p.id_mes = :mes ";
    $paramsP[':mes'] = $mes;
  }
  if ($anio > 0) {
    $sqlP .= " AND YEAR(p.fecha_pago) = :anio ";
    $paramsP[':anio'] = $anio;
  }

  $sqlP .= " ORDER BY p.fecha_pago DESC, p.id_pago DESC ";

  $stP = $pdo->prepare($sqlP);
  $stP->execute($paramsP);
  $pagos = $stP->fetchAll(PDO::FETCH_ASSOC);

  /* =========================
     EGRESOS
     Suposición: egresos tiene:
     - id_egreso, fecha, concepto, monto, id_medio_pago
     Filtrado por MONTH(fecha) y YEAR(fecha)
  ========================= */
  $sqlE = "
    SELECT
      e.id_egreso AS id,
      e.fecha     AS fecha,
      e.concepto  AS concepto,
      COALESCE(m.mes, '')      AS categoria,
      COALESCE(mp.nombre, '') AS medio,
      COALESCE(e.monto, 0)    AS monto
    FROM egresos e
    LEFT JOIN meses m
      ON m.id_mes = MONTH(e.fecha)
    LEFT JOIN medios_pago mp
      ON mp.id_medio_pago = e.id_medio_pago
    WHERE 1=1
  ";

  $paramsE = [];

  if ($anio > 0) {
    $sqlE .= " AND YEAR(e.fecha) = :anio ";
    $paramsE[':anio'] = $anio;
  }
  if ($mes > 0) {
    $sqlE .= " AND MONTH(e.fecha) = :mes ";
    $paramsE[':mes'] = $mes;
  }

  $sqlE .= " ORDER BY e.fecha DESC, e.id_egreso DESC ";

  $stE = $pdo->prepare($sqlE);
  $stE->execute($paramsE);
  $egresos = $stE->fetchAll(PDO::FETCH_ASSOC);

  repreg_json_ok([
    'filtros' => [
      'mes'  => $mes > 0 ? $mes : null,
      'anio' => $anio > 0 ? $anio : null,
    ],
    'pagos'   => $pagos,
    'egresos' => $egresos,
  ]);

} catch (Throwable $e) {
  repreg_json_fail('Error en reportes/registros: ' . $e->getMessage());
}
