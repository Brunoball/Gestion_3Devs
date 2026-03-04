<?php
// ✅ REEMPLAZAR COMPLETO
// backend/modules/pagos/pagos.php
declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('html_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

if (!headers_sent()) {
  header('Content-Type: application/json; charset=utf-8');
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

/* =========================================================
   Helpers JSON / Request
========================================================= */
if (!function_exists('json_ok')) {
  function json_ok($data): void {
    if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
    http_response_code(200);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('json_error')) {
  function json_error(string $msg, array $extra = []): void {
    if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
    http_response_code(200);
    echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('get_int')) {
  function get_int(string $key, int $min = 0, int $max = 999999999): int {
    $v = $_GET[$key] ?? null;
    if ($v === null || $v === '') json_error("Falta parámetro: $key");
    if (!is_numeric($v)) json_error("Parámetro inválido ($key)");
    $n = (int)$v;
    if ($n < $min || $n > $max) json_error("Parámetro fuera de rango ($key)");
    return $n;
  }
}

if (!function_exists('get_str')) {
  function get_str(string $key): string {
    $v = trim((string)($_GET[$key] ?? ''));
    if ($v === '') json_error("Falta parámetro: $key");
    return $v;
  }
}

if (!function_exists('require_method')) {
  function require_method(string $method): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
      json_error("Método no permitido. Se esperaba $method");
    }
  }
}

if (!function_exists('read_json_body')) {
  function read_json_body(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? $data : [];
  }
}

/* =========================================================
   Utilidades de Mes / Obligaciones
========================================================= */
function resolver_id_mes(PDO $pdo, string $mesParam): int
{
  $mesParam = trim($mesParam);
  if ($mesParam === '') json_error("Falta parámetro: mes");

  if (ctype_digit($mesParam)) {
    $id = (int)$mesParam;
    if ($id < 1 || $id > 12) json_error("id_mes fuera de rango (1..12)");
    $stmt = $pdo->prepare("SELECT id_mes FROM meses WHERE id_mes = ? LIMIT 1");
    $stmt->execute([$id]);
    $exists = $stmt->fetchColumn();
    if (!$exists) json_error("Mes no existe en tabla meses (id_mes=$id)");
    return $id;
  }

  $stmt = $pdo->prepare("SELECT id_mes FROM meses WHERE UPPER(mes) = UPPER(?) LIMIT 1");
  $stmt->execute([$mesParam]);
  $id = $stmt->fetchColumn();
  if (!$id) json_error("Mes no encontrado en tabla meses: $mesParam");
  return (int)$id;
}

function build_obligaciones_por_anio(DateTime $inicio, DateTime $hoy): array {
  $inicio = new DateTime($inicio->format('Y-m-01'));
  $hoy    = new DateTime($hoy->format('Y-m-01'));
  if ($inicio > $hoy) return [];

  $out = [];
  $cursor = clone $inicio;
  while ($cursor <= $hoy) {
    $y = (int)$cursor->format('Y');
    $m = (int)$cursor->format('n');
    if (!isset($out[$y])) $out[$y] = [];
    $out[$y][] = $m;
    $cursor->modify('+1 month');
  }
  foreach ($out as $y => $arr) {
    $arr = array_values(array_unique($arr));
    sort($arr);
    $out[$y] = $arr;
  }
  return $out;
}

/* =========================================================
   INCLUDE ENDPOINTS EXTRA
========================================================= */
$__inc1 = __DIR__ . '/equipo_sistema.php';
$__inc2 = __DIR__ . '/arca_factura.php';
$__inc3 = __DIR__ . '/factura_guardar_pdf.php';

if (file_exists($__inc1)) require_once $__inc1;
if (file_exists($__inc2)) require_once $__inc2;
if (file_exists($__inc3)) require_once $__inc3;

/* =========================================================
   PLANES DE MANTENIMIENTO
========================================================= */
function pagos_planes_mantenimiento(): void
{
  global $pdo;
  if (!($pdo instanceof PDO)) json_error("DB no inicializada (pdo)");

  $toUtf8 = function ($v): string {
    if ($v === null) return '';
    $s = (string)$v;
    if (function_exists('iconv')) {
      $fixed = @iconv('UTF-8', 'UTF-8//IGNORE', $s);
      if ($fixed !== false) return $fixed;
    }
    return preg_replace('/[^\x00-\x7F\xC0-\xF7\x80-\xBF]/', '', $s) ?? '';
  };

  try {
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    $sql = "
      SELECT id, nombre, descripcion, monto, activo
      FROM planes_mantenimiento
      WHERE activo = 1
      ORDER BY monto ASC, id ASC
    ";
    $st = $pdo->prepare($sql);
    $st->execute();
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $out = [];
    foreach ($rows as $r) {
      $out[] = [
        'id'          => (int)($r['id'] ?? 0),
        'nombre'      => $toUtf8($r['nombre'] ?? ''),
        'descripcion' => $toUtf8($r['descripcion'] ?? ''),
        'monto'       => isset($r['monto']) ? (float)$r['monto'] : 0.0,
        'activo'      => (int)($r['activo'] ?? 0),
      ];
    }

    json_ok(['exito' => true, 'planes' => $out]);
  } catch (Throwable $e) {
    json_error("Error DB al obtener planes de mantenimiento", ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   DATOS FACTURACIÓN POR id_pago
========================================================= */
function pagos_cliente_facturacion(): void
{
  global $pdo;
  if (!($pdo instanceof PDO)) json_error("DB no inicializada (pdo)");

  require_method('POST');
  $in = read_json_body();

  $id_pago = isset($in['id_pago']) && is_numeric($in['id_pago']) ? (int)$in['id_pago'] : 0;
  if ($id_pago <= 0) json_error("Falta id_pago válido");

  try {
    $sql = "
      SELECT
        cf.id_cliente, cf.doc_tipo, cf.doc_nro, cf.razon_social, cf.domicilio,
        cf.id_condicion_iva, COALESCE(ic.descripcion, '') AS cond_iva, cf.cond_venta
      FROM pagos p
      INNER JOIN clientes_sistemas cs ON cs.id_sistema = p.id_sistema
      LEFT JOIN clientes_facturacion cf ON cf.id_cliente = cs.id_cliente
      LEFT JOIN iva_condiciones ic ON ic.id_condicion_iva = cf.id_condicion_iva
      WHERE p.id_pago = :id_pago
      LIMIT 1
    ";
    $st = $pdo->prepare($sql);
    $st->execute([':id_pago' => $id_pago]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    if (!$row || empty($row['id_cliente'])) {
      json_ok(['exito' => true, 'cliente_facturacion' => null, 'mensaje' => 'Cliente sin datos de facturación cargados.']);
    }

    $doc_tipo = isset($row['doc_tipo']) ? (int)$row['doc_tipo'] : 80;
    $doc_nro  = preg_replace('/\D+/', '', (string)($row['doc_nro'] ?? ''));
    $condIvaTxt = trim((string)($row['cond_iva'] ?? ''));
    if ($condIvaTxt === '') $condIvaTxt = 'IVA Sujeto Exento';

    json_ok([
      'exito' => true,
      'cliente_facturacion' => [
        'id_cliente'       => (int)($row['id_cliente'] ?? 0),
        'doc_tipo'         => $doc_tipo,
        'doc_nro'          => $doc_nro,
        'razon_social'     => (string)($row['razon_social'] ?? ''),
        'domicilio'        => (string)($row['domicilio'] ?? ''),
        'id_condicion_iva' => isset($row['id_condicion_iva']) ? (int)$row['id_condicion_iva'] : null,
        'cond_iva'         => $condIvaTxt,
        'cond_venta'       => (string)($row['cond_venta'] ?? 'Contado / Transferencia Bancaria'),
      ],
    ]);
  } catch (Throwable $e) {
    json_error("Error DB al obtener datos de facturación", ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   DATOS FACTURACIÓN POR id_sistema
========================================================= */
function pagos_cliente_facturacion_sistema(): void
{
  global $pdo;
  if (!($pdo instanceof PDO)) json_error("DB no inicializada (pdo)");

  require_method('POST');
  $in = read_json_body();

  $id_sistema = isset($in['id_sistema']) && is_numeric($in['id_sistema']) ? (int)$in['id_sistema'] : 0;
  if ($id_sistema <= 0) json_error("Falta id_sistema válido");

  try {
    $sql = "
      SELECT
        cf.id_cliente, cf.doc_tipo, cf.doc_nro, cf.razon_social, cf.domicilio,
        cf.id_condicion_iva, COALESCE(ic.descripcion, '') AS cond_iva, cf.cond_venta
      FROM clientes_sistemas cs
      LEFT JOIN clientes_facturacion cf ON cf.id_cliente = cs.id_cliente
      LEFT JOIN iva_condiciones ic ON ic.id_condicion_iva = cf.id_condicion_iva
      WHERE cs.id_sistema = :id_sistema
      LIMIT 1
    ";
    $st = $pdo->prepare($sql);
    $st->execute([':id_sistema' => $id_sistema]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    if (!$row || empty($row['id_cliente'])) {
      json_ok(['exito' => true, 'cliente_facturacion' => null, 'mensaje' => 'Cliente sin datos de facturación cargados.']);
    }

    $doc_tipo = isset($row['doc_tipo']) ? (int)$row['doc_tipo'] : 80;
    $doc_nro  = preg_replace('/\D+/', '', (string)($row['doc_nro'] ?? ''));
    $condIvaTxt = trim((string)($row['cond_iva'] ?? ''));
    if ($condIvaTxt === '') $condIvaTxt = 'IVA Sujeto Exento';

    json_ok([
      'exito' => true,
      'cliente_facturacion' => [
        'id_cliente'       => (int)($row['id_cliente'] ?? 0),
        'doc_tipo'         => $doc_tipo,
        'doc_nro'          => $doc_nro,
        'razon_social'     => (string)($row['razon_social'] ?? ''),
        'domicilio'        => (string)($row['domicilio'] ?? ''),
        'id_condicion_iva' => isset($row['id_condicion_iva']) ? (int)$row['id_condicion_iva'] : null,
        'cond_iva'         => $condIvaTxt,
        'cond_venta'       => (string)($row['cond_venta'] ?? 'Contado / Transferencia Bancaria'),
      ],
    ]);
  } catch (Throwable $e) {
    json_error("Error DB al obtener datos de facturación (sistema)", ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   LISTAR AÑOS
========================================================= */
function pagos_listar_anios(): void
{
  global $pdo;
  if (!($pdo instanceof PDO)) json_error("DB no inicializada (pdo)");

  try {
    $sql = "SELECT DISTINCT YEAR(fecha_pago) AS anio FROM pagos ORDER BY anio DESC";
    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $anios = [];
    foreach ($rows as $r) {
      if (isset($r['anio'])) $anios[] = (int)$r['anio'];
    }
    json_ok(['exito' => true, 'anios' => $anios]);
  } catch (Throwable $e) {
    json_error("Error DB al listar años", ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   LISTAR PAGADOS POR MES/AÑO (1 fila por CLIENTE)
   ✅ ya NO lee pagos.comprobante
   ✅ devuelve factura_id y factura_pdf (si existe)
========================================================= */
function pagos_listar_pagados(): void
{
  global $pdo;
  if (!($pdo instanceof PDO)) json_error("DB no inicializada (pdo)");

  $anio = get_int('anio', 2000, 2100);
  $mesParam = get_str('mes');
  $idMes = resolver_id_mes($pdo, $mesParam);

  // Nota: 1 fila por cliente = el último pago del cliente en el período (como tenías).
  // Para el PDF, resolvemos por:
  // - p.id_factura -> facturas.pdf_path
  // - fallback: última factura del mismo cliente para ese período
  $sql = <<<SQL
    SELECT
      c.id_cliente,
      c.nombre AS cliente,
      p.id_pago,
      p.id_sistema,
      p.monto,
      p.fecha_pago,
      mp.nombre AS medio_pago,
      m.mes AS mes_nombre,
      cs.estado AS sistema_estado,
      cs.nombre AS sistema,
      cs.descripcion AS sistema_descripcion,

      p.id_factura AS factura_id,

      (SELECT f.pdf_path
       FROM facturas f
       WHERE f.id_factura = p.id_factura
       LIMIT 1
      ) AS factura_pdf,

      (SELECT f2.id_factura
       FROM facturas f2
       INNER JOIN clientes_sistemas csf ON csf.id_sistema = f2.id_sistema
       WHERE csf.id_cliente = c.id_cliente
         AND f2.anio = :anio
         AND f2.id_mes = :id_mes
       ORDER BY f2.created_at DESC, f2.id_factura DESC
       LIMIT 1
      ) AS factura_id_fallback,

      (SELECT f2.pdf_path
       FROM facturas f2
       INNER JOIN clientes_sistemas csf ON csf.id_sistema = f2.id_sistema
       WHERE csf.id_cliente = c.id_cliente
         AND f2.anio = :anio
         AND f2.id_mes = :id_mes
       ORDER BY f2.created_at DESC, f2.id_factura DESC
       LIMIT 1
      ) AS factura_pdf_fallback

    FROM (
      SELECT cs.id_cliente, MAX(p.id_pago) AS last_id_pago
      FROM pagos p
      INNER JOIN clientes_sistemas cs ON cs.id_sistema = p.id_sistema
      WHERE p.id_mes = :id_mes AND YEAR(p.fecha_pago) = :anio
      GROUP BY cs.id_cliente
    ) t
    INNER JOIN pagos p              ON p.id_pago = t.last_id_pago
    INNER JOIN clientes_sistemas cs ON cs.id_sistema = p.id_sistema
    INNER JOIN clientes c           ON c.id_cliente = t.id_cliente
    INNER JOIN meses m              ON m.id_mes = p.id_mes
    INNER JOIN medios_pago mp       ON mp.id_medio_pago = p.id_medio_pago
    ORDER BY c.nombre ASC
SQL;

  try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id_mes' => $idMes, ':anio' => $anio]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $out = [];
    foreach ($rows as $r) {
      $concepto = trim((string)($r['sistema'] ?? ''));
      $desc = trim((string)($r['sistema_descripcion'] ?? ''));
      if ($desc !== '') $concepto .= " • " . $desc;
      if ($concepto === '') $concepto = '—';

      $facturaId = isset($r['factura_id']) ? (int)$r['factura_id'] : null;
      $facturaPdf = trim((string)($r['factura_pdf'] ?? ''));

      if ((!$facturaId || $facturaId <= 0) && isset($r['factura_id_fallback'])) {
        $fid2 = (int)$r['factura_id_fallback'];
        $pdf2 = trim((string)($r['factura_pdf_fallback'] ?? ''));
        if ($fid2 > 0) $facturaId = $fid2;
        if ($pdf2 !== '') $facturaPdf = $pdf2;
      }

      $out[] = [
        'id_pago'        => (int)($r['id_pago'] ?? 0),
        'id_sistema'     => (int)($r['id_sistema'] ?? 0),
        'id_cliente'     => (int)($r['id_cliente'] ?? 0),
        'cliente'        => $r['cliente'] ?? '—',
        'concepto'       => $concepto,
        'medio_pago'     => $r['medio_pago'] ?? '—',
        'monto'          => isset($r['monto']) ? (float)$r['monto'] : null,
        'fecha_pago'     => $r['fecha_pago'] ?? null,
        'mes'            => $r['mes_nombre'] ?? $mesParam,
        'anio'           => $anio,
        'estado_sistema' => $r['sistema_estado'] ?? null,

        // ✅ comprobante ahora viene de FACTURAS
        'id_factura'     => ($facturaId && $facturaId > 0) ? $facturaId : null,
        'comprobante'    => ($facturaPdf !== '') ? $facturaPdf : null,
      ];
    }
    json_ok($out);
  } catch (Throwable $e) {
    json_error("Error DB al listar pagados", ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   LISTAR DEUDORES POR MES/AÑO
========================================================= */
function pagos_listar_deudores(): void
{
  global $pdo;
  if (!($pdo instanceof PDO)) json_error("DB no inicializada (pdo)");

  $anio = get_int('anio', 2000, 2100);
  $mesParam = get_str('mes');
  $idMes = resolver_id_mes($pdo, $mesParam);

  $periodStart = DateTime::createFromFormat('Y-n-j', "$anio-$idMes-1");
  if (!$periodStart) json_error("Período inválido");

  $periodEnd = (clone $periodStart);
  $periodEnd->modify('last day of this month');
  $periodEndStr = $periodEnd->format('Y-m-d');

  $sql = <<<SQL
    SELECT
      c.id_cliente,
      c.nombre AS cliente,
      cs.id_sistema AS id_sistema_principal,
      cs.estado     AS sistema_estado,
      cs.nombre     AS sistema,
      cs.descripcion AS sistema_descripcion
    FROM clientes c
    INNER JOIN clientes_sistemas cs
      ON cs.id_cliente = c.id_cliente
     AND cs.id_sistema = (
        SELECT MIN(csx.id_sistema)
        FROM clientes_sistemas csx
        WHERE csx.id_cliente = c.id_cliente
      )
    WHERE
      (cs.estado = 'activo' OR cs.estado = 1)
      AND DATE(
        CASE
          WHEN STR_TO_DATE(NULLIF(LEFT(TRIM(cs.fecha_inicio),10),'0000-00-00'), '%Y-%m-%d') IS NULL
               AND DATE(cs.created_at) IS NULL THEN NULL
          WHEN STR_TO_DATE(NULLIF(LEFT(TRIM(cs.fecha_inicio),10),'0000-00-00'), '%Y-%m-%d') IS NULL
            THEN DATE(cs.created_at)
          WHEN DATE(cs.created_at) IS NULL
            THEN STR_TO_DATE(NULLIF(LEFT(TRIM(cs.fecha_inicio),10),'0000-00-00'), '%Y-%m-%d')
          ELSE GREATEST(
            STR_TO_DATE(NULLIF(LEFT(TRIM(cs.fecha_inicio),10),'0000-00-00'), '%Y-%m-%d'),
            DATE(cs.created_at)
          )
        END
      ) <= :period_end
      AND NOT EXISTS (
        SELECT 1
        FROM pagos p2
        INNER JOIN clientes_sistemas cs2 ON cs2.id_sistema = p2.id_sistema
        WHERE cs2.id_cliente = c.id_cliente
          AND p2.id_mes = :id_mes
          AND YEAR(p2.fecha_pago) = :anio
        LIMIT 1
      )
    ORDER BY c.nombre ASC
SQL;

  try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id_mes' => $idMes, ':anio' => $anio, ':period_end' => $periodEndStr]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $out = [];
    foreach ($rows as $r) {
      $concepto = trim((string)($r['sistema'] ?? ''));
      $desc = trim((string)($r['sistema_descripcion'] ?? ''));
      if ($desc !== '') $concepto .= " • " . $desc;
      if ($concepto === '') $concepto = '—';

      $out[] = [
        'id_sistema'     => (int)($r['id_sistema_principal'] ?? 0),
        'id_cliente'     => (int)($r['id_cliente'] ?? 0),
        'cliente'        => $r['cliente'] ?? '—',
        'concepto'       => $concepto,
        'medio_pago'     => '—',
        'monto'          => null,
        'fecha_pago'     => null,
        'mes'            => $mesParam,
        'anio'           => $anio,
        'estado_sistema' => $r['sistema_estado'] ?? null,
        'id_factura'     => null,
        'comprobante'    => null,
      ];
    }
    json_ok($out);
  } catch (Throwable $e) {
    json_error("Error DB al listar deudores", ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   DETALLE SISTEMA
========================================================= */
function pagos_detalle_sistema(): void
{
  global $pdo;
  if (!($pdo instanceof PDO)) json_error("DB no inicializada (pdo)");

  $id_sistema = isset($_GET['id_sistema']) && is_numeric($_GET['id_sistema'])
    ? (int)$_GET['id_sistema'] : 0;
  if ($id_sistema <= 0) json_error("Falta id_sistema");

  try {
    $sql = "
      SELECT
        cs.id_sistema, cs.id_cliente,
        cs.nombre AS sistema_nombre, cs.descripcion AS sistema_descripcion,
        cs.estado AS sistema_estado, cs.fecha_inicio,
        cs.created_at AS sistema_created_at,
        DATE(
          CASE
            WHEN STR_TO_DATE(NULLIF(LEFT(TRIM(cs.fecha_inicio),10),'0000-00-00'), '%Y-%m-%d') IS NULL
                 AND DATE(cs.created_at) IS NULL THEN NULL
            WHEN STR_TO_DATE(NULLIF(LEFT(TRIM(cs.fecha_inicio),10),'0000-00-00'), '%Y-%m-%d') IS NULL
              THEN DATE(cs.created_at)
            WHEN DATE(cs.created_at) IS NULL
              THEN STR_TO_DATE(NULLIF(LEFT(TRIM(cs.fecha_inicio),10),'0000-00-00'), '%Y-%m-%d')
            ELSE GREATEST(
              STR_TO_DATE(NULLIF(LEFT(TRIM(cs.fecha_inicio),10),'0000-00-00'), '%Y-%m-%d'),
              DATE(cs.created_at)
            )
          END
        ) AS inicio_real,
        c.nombre AS cliente_nombre, c.notas AS cliente_notas, c.activo AS cliente_activo
      FROM clientes_sistemas cs
      INNER JOIN clientes c ON c.id_cliente = cs.id_cliente
      WHERE cs.id_sistema = :id
      LIMIT 1
    ";
    $st = $pdo->prepare($sql);
    $st->execute([':id' => $id_sistema]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) json_error("Sistema no encontrado (id_sistema=$id_sistema)");

    $stmtMeses = $pdo->query("SELECT id_mes, mes FROM meses ORDER BY id_mes ASC");
    $mesesCatalogo = [];
    foreach ($stmtMeses->fetchAll(PDO::FETCH_ASSOC) as $m) {
      $mesesCatalogo[] = ['id_mes' => (int)$m['id_mes'], 'mes' => (string)$m['mes']];
    }

    $sqlP = "SELECT YEAR(fecha_pago) AS anio, id_mes FROM pagos WHERE id_sistema = :id";
    $stP = $pdo->prepare($sqlP);
    $stP->execute([':id' => $id_sistema]);
    $rowsPagos = $stP->fetchAll(PDO::FETCH_ASSOC);

    $pagosPorAnio = [];
    foreach ($rowsPagos as $p) {
      $anio = (int)($p['anio'] ?? 0);
      $mes  = (int)($p['id_mes'] ?? 0);
      if ($anio <= 0 || $mes < 1 || $mes > 12) continue;
      if (!isset($pagosPorAnio[$anio])) $pagosPorAnio[$anio] = [];
      $pagosPorAnio[$anio][] = $mes;
    }
    foreach ($pagosPorAnio as $y => $arr) {
      $arr = array_values(array_unique($arr));
      sort($arr);
      $pagosPorAnio[$y] = $arr;
    }

    $inicioStr = $row['inicio_real'] ?? null;
    if (!$inicioStr) {
      $fi = (string)($row['fecha_inicio'] ?? '');
      $ca = (string)($row['sistema_created_at'] ?? '');
      $inicioStr = substr(($fi !== '' ? $fi : $ca), 0, 10);
      if ($inicioStr === '' || $inicioStr === '0000-00-00') $inicioStr = date('Y-m-d');
    }

    $inicio = new DateTime($inicioStr);
    $hoy = new DateTime(date('Y-m-d'));
    $oblig = build_obligaciones_por_anio($inicio, $hoy);

    $adeudosPorAnio = [];
    foreach ($oblig as $y => $mesesOblig) {
      $pagados = $pagosPorAnio[$y] ?? [];
      $adeudos = array_values(array_diff($mesesOblig, $pagados));
      sort($adeudos);
      $adeudosPorAnio[$y] = $adeudos;
    }

    json_ok([
      'exito' => true,
      'sistema' => [
        'id_sistema'   => (int)$row['id_sistema'],
        'id_cliente'   => (int)$row['id_cliente'],
        'nombre'       => (string)($row['sistema_nombre'] ?? ''),
        'descripcion'  => (string)($row['sistema_descripcion'] ?? ''),
        'estado'       => (string)($row['sistema_estado'] ?? ''),
        'fecha_inicio' => $row['fecha_inicio'] ?? null,
        'created_at'   => $row['sistema_created_at'] ?? null,
        'inicio_real'  => $row['inicio_real'] ?? null,
      ],
      'cliente' => [
        'id_cliente' => (int)$row['id_cliente'],
        'nombre'     => (string)($row['cliente_nombre'] ?? ''),
        'notas'      => (string)($row['cliente_notas'] ?? ''),
        'activo'     => (int)($row['cliente_activo'] ?? 0),
      ],
      'mesesCatalogo'  => $mesesCatalogo,
      'pagosPorAnio'   => $pagosPorAnio,
      'adeudosPorAnio' => $adeudosPorAnio,
      'inicio'         => $inicio->format('Y-m-d'),
      'hoy'            => $hoy->format('Y-m-d'),
    ]);
  } catch (Throwable $e) {
    json_error("Error DB al obtener detalle del sistema", ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   ✅ DETALLE POR PERÍODO (pago + factura)
========================================================= */
function pagos_detalle_periodo(): void
{
  global $pdo;
  if (!($pdo instanceof PDO)) json_error("DB no inicializada (pdo)");

  $id_sistema = isset($_GET['id_sistema']) && is_numeric($_GET['id_sistema']) ? (int)$_GET['id_sistema'] : 0;
  $anio       = isset($_GET['anio']) && is_numeric($_GET['anio']) ? (int)$_GET['anio'] : 0;
  $id_mes     = isset($_GET['id_mes']) && is_numeric($_GET['id_mes']) ? (int)$_GET['id_mes'] : 0;

  if ($id_sistema <= 0) json_error("Falta id_sistema");
  if ($anio < 2000 || $anio > 2100) json_error("Año inválido");
  if ($id_mes < 1 || $id_mes > 12) json_error("Mes inválido");

  try {
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    $sqlDet = "
      SELECT
        cs.id_sistema, cs.id_cliente,
        cs.nombre AS sistema_nombre, cs.descripcion AS sistema_descripcion,
        cs.estado AS sistema_estado, c.nombre AS cliente_nombre
      FROM clientes_sistemas cs
      INNER JOIN clientes c ON c.id_cliente = cs.id_cliente
      WHERE cs.id_sistema = :id_sistema
      LIMIT 1
    ";
    $stDet = $pdo->prepare($sqlDet);
    $stDet->execute([':id_sistema' => $id_sistema]);
    $det = $stDet->fetch(PDO::FETCH_ASSOC);
    if (!$det) json_error("Sistema no encontrado (id_sistema=$id_sistema)");

    // Pago (si existe)
    $sqlPago = "
      SELECT id_pago, id_sistema, id_mes, id_medio_pago, monto, fecha_pago, id_factura
      FROM pagos
      WHERE id_sistema = :id_sistema
        AND id_mes = :id_mes
        AND YEAR(fecha_pago) = :anio
      ORDER BY id_pago DESC
      LIMIT 1
    ";
    $stP = $pdo->prepare($sqlPago);
    $stP->execute([':id_sistema' => $id_sistema, ':id_mes' => $id_mes, ':anio' => $anio]);
    $pago = $stP->fetch(PDO::FETCH_ASSOC) ?: null;

    // Factura: primero por id_factura del pago (si existe),
    // sino por sistema directo, sino por cliente.
    $factura = null;

    if ($pago && !empty($pago['id_factura'])) {
      $stFx = $pdo->prepare("
        SELECT
          id_factura, id_sistema, anio, id_mes, estado, monto_ars,
          doc_tipo, doc_nro, cbte_tipo, pto_vta, cae, cae_vto, cbte_nro,
          fecha_cbte, pdf_path, items_facturacion_json, usd_rate, total_usd,
          total_ars, periodo_desde, periodo_hasta, vto_pago, created_at
        FROM facturas
        WHERE id_factura = :id
        LIMIT 1
      ");
      $stFx->execute([':id' => (int)$pago['id_factura']]);
      $factura = $stFx->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    if (!$factura) {
      $stF = $pdo->prepare("
        SELECT
          id_factura, id_sistema, anio, id_mes, estado, monto_ars,
          doc_tipo, doc_nro, cbte_tipo, pto_vta, cae, cae_vto, cbte_nro,
          fecha_cbte, pdf_path, items_facturacion_json, usd_rate, total_usd,
          total_ars, periodo_desde, periodo_hasta, vto_pago, created_at
        FROM facturas
        WHERE id_sistema = :id_sistema
          AND anio = :anio
          AND id_mes = :id_mes
        ORDER BY created_at DESC, id_factura DESC
        LIMIT 1
      ");
      $stF->execute([':id_sistema' => $id_sistema, ':anio' => $anio, ':id_mes' => $id_mes]);
      $factura = $stF->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    if (!$factura) {
      $stFC = $pdo->prepare("
        SELECT
          f.id_factura, f.id_sistema, f.anio, f.id_mes, f.estado, f.monto_ars,
          f.doc_tipo, f.doc_nro, f.cbte_tipo, f.pto_vta, f.cae, f.cae_vto, f.cbte_nro,
          f.fecha_cbte, f.pdf_path, f.items_facturacion_json, f.usd_rate, f.total_usd,
          f.total_ars, f.periodo_desde, f.periodo_hasta, f.vto_pago, f.created_at
        FROM facturas f
        INNER JOIN clientes_sistemas cs ON cs.id_sistema = f.id_sistema
        WHERE cs.id_cliente = (
            SELECT id_cliente FROM clientes_sistemas WHERE id_sistema = :id_sistema LIMIT 1
          )
          AND f.anio = :anio
          AND f.id_mes = :id_mes
        ORDER BY f.created_at DESC, f.id_factura DESC
        LIMIT 1
      ");
      $stFC->execute([':id_sistema' => $id_sistema, ':anio' => $anio, ':id_mes' => $id_mes]);
      $factura = $stFC->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    if ($pago) {
      $pago = [
        'id_pago'       => (int)($pago['id_pago'] ?? 0),
        'id_sistema'    => (int)($pago['id_sistema'] ?? 0),
        'id_mes'        => (int)($pago['id_mes'] ?? 0),
        'id_medio_pago' => (int)($pago['id_medio_pago'] ?? 0),
        'monto'         => isset($pago['monto']) ? (float)$pago['monto'] : 0.0,
        'fecha_pago'    => $pago['fecha_pago'] ?? null,
        'id_factura'    => isset($pago['id_factura']) ? (int)$pago['id_factura'] : null,
      ];
    }

    if ($factura) {
      $itemsRaw = $factura['items_facturacion_json'] ?? null;
      $itemsParsed = null;
      if ($itemsRaw !== null && $itemsRaw !== '') {
        $decoded = json_decode((string)$itemsRaw, true);
        $itemsParsed = is_array($decoded) ? $decoded : null;
      }

      $factura = [
        'id_factura'             => (int)($factura['id_factura'] ?? 0),
        'id_sistema'             => isset($factura['id_sistema']) ? (int)$factura['id_sistema'] : null,
        'anio'                   => (int)($factura['anio'] ?? 0),
        'id_mes'                 => (int)($factura['id_mes'] ?? 0),
        'estado'                 => (string)($factura['estado'] ?? ''),
        'monto_ars'              => isset($factura['monto_ars']) ? (float)$factura['monto_ars'] : 0.0,
        'doc_tipo'               => isset($factura['doc_tipo']) ? (int)$factura['doc_tipo'] : null,
        'doc_nro'                => $factura['doc_nro'] ?? null,
        'cbte_tipo'              => isset($factura['cbte_tipo']) ? (int)$factura['cbte_tipo'] : null,
        'pto_vta'                => isset($factura['pto_vta']) ? (int)$factura['pto_vta'] : null,
        'cae'                    => $factura['cae'] ?? null,
        'cae_vto'                => $factura['cae_vto'] ?? null,
        'cbte_nro'               => $factura['cbte_nro'] ?? null,
        'fecha_cbte'             => $factura['fecha_cbte'] ?? null,
        'pdf_path'               => $factura['pdf_path'] ?? null,
        'items_facturacion_json' => $itemsParsed,
        'usd_rate'               => isset($factura['usd_rate']) ? (float)$factura['usd_rate'] : null,
        'total_usd'              => isset($factura['total_usd']) ? (float)$factura['total_usd'] : null,
        'total_ars'              => isset($factura['total_ars']) ? (float)$factura['total_ars'] : null,
        'periodo_desde'          => $factura['periodo_desde'] ?? null,
        'periodo_hasta'          => $factura['periodo_hasta'] ?? null,
        'vto_pago'               => $factura['vto_pago'] ?? null,
        'created_at'             => $factura['created_at'] ?? null,
      ];
    }

    json_ok([
      'exito'   => true,
      'detalle' => [
        'cliente_nombre'      => (string)($det['cliente_nombre'] ?? ''),
        'sistema_nombre'      => (string)($det['sistema_nombre'] ?? ''),
        'sistema_descripcion' => (string)($det['sistema_descripcion'] ?? ''),
        'sistema_estado'      => $det['sistema_estado'] ?? null,
      ],
      'pago'    => $pago,
      'factura' => $factura,
      'anio'    => $anio,
      'id_mes'  => $id_mes,
    ]);
  } catch (Throwable $e) {
    json_error("Error DB al obtener detalle del período", ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   ✅ REGISTRAR PAGO
   - ahora NO guarda URL en pagos (no existe comprobante)
   - guarda solo id_factura (si se resolvió)
========================================================= */
function pagos_registrar_pago(): void
{
  global $pdo;
  if (!($pdo instanceof PDO)) json_error("DB no inicializada (pdo)");

  require_method('POST');
  $body = read_json_body();

  $id_sistema    = isset($body['id_sistema']) && is_numeric($body['id_sistema']) ? (int)$body['id_sistema'] : 0;
  $anio          = isset($body['anio']) && is_numeric($body['anio']) ? (int)$body['anio'] : 0;
  $id_medio_pago = isset($body['id_medio_pago']) && is_numeric($body['id_medio_pago']) ? (int)$body['id_medio_pago'] : 0;
  $monto         = isset($body['monto']) && is_numeric($body['monto']) ? (float)$body['monto'] : 0.0;
  $meses         = $body['meses'] ?? [];
  $fecha_pago    = isset($body['fecha_pago']) ? trim((string)$body['fecha_pago']) : '';
  $id_factura_in = (isset($body['id_factura']) && is_numeric($body['id_factura'])) ? (int)$body['id_factura'] : 0;

  // ✅ NUEVO: desglose por sistema [{id_sistema, monto}, ...]
  $sistemasConMonto = (isset($body['sistemas_con_monto']) && is_array($body['sistemas_con_monto']))
    ? $body['sistemas_con_monto']
    : [];

  if ($id_sistema <= 0) json_error("Falta id_sistema");
  if ($anio < 2000 || $anio > 2100) json_error("Año inválido");
  if ($id_medio_pago <= 0) json_error("Falta id_medio_pago");
  if (!is_array($meses) || count($meses) === 0) json_error("Falta meses[]");
  if (!is_numeric($monto) || $monto <= 0) json_error("Monto inválido");
  if ($fecha_pago === '') json_error("Falta fecha_pago");

  $dt = DateTime::createFromFormat('Y-m-d', $fecha_pago);
  $dtErrors = DateTime::getLastErrors();
  if (!$dt || ($dtErrors['warning_count'] ?? 0) > 0 || ($dtErrors['error_count'] ?? 0) > 0) {
    json_error("fecha_pago inválida (formato esperado YYYY-MM-DD)");
  }
  $fecha_pago = $dt->format('Y-m-d');

  $stSys = $pdo->prepare("SELECT id_sistema FROM clientes_sistemas WHERE id_sistema = ? LIMIT 1");
  $stSys->execute([$id_sistema]);
  if (!$stSys->fetchColumn()) json_error("Sistema inexistente");

  $stMP = $pdo->prepare("SELECT id_medio_pago FROM medios_pago WHERE id_medio_pago = ? AND activo = 1 LIMIT 1");
  $stMP->execute([$id_medio_pago]);
  if (!$stMP->fetchColumn()) json_error("Medio de pago inválido o inactivo");

  $mesesNorm = [];
  foreach ($meses as $m) {
    if (!is_numeric($m)) continue;
    $m = (int)$m;
    if ($m < 1 || $m > 12) continue;
    $mesesNorm[] = $m;
  }
  $mesesNorm = array_values(array_unique($mesesNorm));
  sort($mesesNorm);
  if (!count($mesesNorm)) json_error("Meses inválidos");

  // Normalizar sistemas_con_monto
  $sistemasNorm = [];
  if (count($sistemasConMonto) > 0) {
    $idsParaValidar = [];
    foreach ($sistemasConMonto as $sc) {
      $sid   = isset($sc['id_sistema']) && is_numeric($sc['id_sistema']) ? (int)$sc['id_sistema'] : 0;
      $smonto = isset($sc['monto']) && is_numeric($sc['monto']) ? (float)$sc['monto'] : 0.0;
      if ($sid > 0 && $smonto > 0) {
        $sistemasNorm[$sid] = $smonto;
        $idsParaValidar[]   = $sid;
      }
    }

    if (count($idsParaValidar) > 0) {
      $placeholders = implode(',', array_fill(0, count($idsParaValidar), '?'));
      $stValSis = $pdo->prepare("SELECT id_sistema FROM clientes_sistemas WHERE id_sistema IN ($placeholders)");
      $stValSis->execute($idsParaValidar);
      $existentes = array_column($stValSis->fetchAll(PDO::FETCH_ASSOC), 'id_sistema');
      $existentesSet = array_flip($existentes);

      foreach (array_keys($sistemasNorm) as $sid) {
        if (!isset($existentesSet[$sid])) unset($sistemasNorm[$sid]);
      }
    }
  }

  $modoMulti = count($sistemasNorm) > 0;

  $insertados    = [];
  $omitidos      = [];
  $facturaPorMes = [];

  try {
    $pdo->beginTransaction();

    $stCheck = $pdo->prepare("
      SELECT COUNT(*) FROM pagos
      WHERE id_sistema = :id_sistema AND id_mes = :id_mes AND YEAR(fecha_pago) = :anio
      LIMIT 1
    ");

    // Resolver factura (solo id_factura + pdf_path para respuesta)
    $stFacturaById = $pdo->prepare("
      SELECT id_factura, pdf_path FROM facturas
      WHERE id_factura = :id_factura AND anio = :anio AND id_mes = :id_mes
      LIMIT 1
    ");

    $stFacturaSistema = $pdo->prepare("
      SELECT f.id_factura, f.pdf_path
      FROM facturas f
      WHERE f.id_sistema = :id_sistema AND f.anio = :anio AND f.id_mes = :id_mes
      ORDER BY f.created_at DESC, f.id_factura DESC
      LIMIT 1
    ");

    $stFacturaCliente = $pdo->prepare("
      SELECT f.id_factura, f.pdf_path
      FROM facturas f
      INNER JOIN clientes_sistemas cs ON cs.id_sistema = f.id_sistema
      WHERE cs.id_cliente = (
          SELECT id_cliente FROM clientes_sistemas WHERE id_sistema = :id_sistema_ref LIMIT 1
        )
        AND f.anio = :anio
        AND f.id_mes = :id_mes
      ORDER BY f.created_at DESC, f.id_factura DESC
      LIMIT 1
    ");

    // ✅ INSERT pagos sin comprobante
    $stIns = $pdo->prepare("
      INSERT INTO pagos (id_sistema, id_mes, id_medio_pago, monto, fecha_pago, id_factura)
      VALUES (:id_sistema, :id_mes, :id_medio_pago, :monto, :fecha_pago, :id_factura)
    ");

    $resolverFactura = function(int $sid, int $mes) use (
      $anio, $id_factura_in,
      $stFacturaById, $stFacturaSistema, $stFacturaCliente, $id_sistema
    ): array {
      $facturaId = null;
      $pdfPath   = null;

      if ($id_factura_in > 0) {
        $stFacturaById->execute([':id_factura' => $id_factura_in, ':anio' => $anio, ':id_mes' => $mes]);
        $fx = $stFacturaById->fetch(PDO::FETCH_ASSOC);
        if ($fx) {
          $facturaId = (int)($fx['id_factura'] ?? 0);
          $pdfPath   = (string)($fx['pdf_path'] ?? '');
        }
      }

      if (!$facturaId) {
        $stFacturaSistema->execute([':id_sistema' => $sid, ':anio' => $anio, ':id_mes' => $mes]);
        $fx = $stFacturaSistema->fetch(PDO::FETCH_ASSOC);
        if ($fx) {
          $facturaId = (int)($fx['id_factura'] ?? 0);
          $pdfPath   = (string)($fx['pdf_path'] ?? '');
        }
      }

      if (!$facturaId) {
        $refSid = $sid > 0 ? $sid : $id_sistema;
        $stFacturaCliente->execute([':id_sistema_ref' => $refSid, ':anio' => $anio, ':id_mes' => $mes]);
        $fx = $stFacturaCliente->fetch(PDO::FETCH_ASSOC);
        if ($fx) {
          $facturaId = (int)($fx['id_factura'] ?? 0);
          $pdfPath   = (string)($fx['pdf_path'] ?? '');
        }
      }

      $pdfPath = trim((string)$pdfPath);
      return [
        'id_factura' => ($facturaId && $facturaId > 0) ? $facturaId : null,
        'pdf_path'   => $pdfPath !== '' ? $pdfPath : null,
      ];
    };

    foreach ($mesesNorm as $mes) {

      if ($modoMulti) {
        $mesInsertados = [];
        $mesOmitidos   = [];
        $mesFacturas   = [];

        foreach ($sistemasNorm as $sid => $smonto) {
          $stCheck->execute([':id_sistema' => $sid, ':id_mes' => $mes, ':anio' => $anio]);
          $exists = ((int)$stCheck->fetchColumn()) > 0;

          if ($exists) {
            $mesOmitidos[] = $sid;
            continue;
          }

          $fx = $resolverFactura($sid, $mes);

          $stIns->execute([
            ':id_sistema'    => $sid,
            ':id_mes'        => $mes,
            ':id_medio_pago' => $id_medio_pago,
            ':monto'         => round($smonto, 2),
            ':fecha_pago'    => $fecha_pago,
            ':id_factura'    => $fx['id_factura'],
          ]);

          $mesInsertados[]     = $sid;
          $mesFacturas[$sid]   = $fx;
        }

        if (count($mesInsertados) > 0) $insertados[] = $mes;
        else $omitidos[] = $mes;

        $facturaPorMes[$mes] = [
          'modo'        => 'multi_sistema',
          'insertados'  => $mesInsertados,
          'omitidos'    => $mesOmitidos,
          'facturas'    => $mesFacturas,
        ];

      } else {
        $stCheck->execute([':id_sistema' => $id_sistema, ':id_mes' => $mes, ':anio' => $anio]);
        $exists = ((int)$stCheck->fetchColumn()) > 0;

        if ($exists) {
          $omitidos[] = $mes;
          continue;
        }

        $fx = $resolverFactura($id_sistema, $mes);

        $stIns->execute([
          ':id_sistema'    => $id_sistema,
          ':id_mes'        => $mes,
          ':id_medio_pago' => $id_medio_pago,
          ':monto'         => $monto,
          ':fecha_pago'    => $fecha_pago,
          ':id_factura'    => $fx['id_factura'],
        ]);

        $insertados[]        = $mes;
        $facturaPorMes[$mes] = [
          'modo'       => 'single',
          'id_factura' => $fx['id_factura'],
          'pdf_path'   => $fx['pdf_path'],
        ];
      }
    }

    $pdo->commit();
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_error("Error DB al registrar pagos", ['error' => $e->getMessage()]);
  }

  json_ok([
    'exito'           => true,
    'modo'            => $modoMulti ? 'multi_sistema' : 'single',
    'id_sistema'      => $id_sistema,
    'anio'            => $anio,
    'fecha_pago'      => $fecha_pago,
    'insertados'      => $insertados,
    'omitidos'        => $omitidos,
    'factura_por_mes' => $facturaPorMes,
    'pagos_insertados_total' => $modoMulti
      ? array_sum(array_map(fn($v) => count($v['insertados'] ?? []), $facturaPorMes))
      : count($insertados),
  ]);
}

/* =========================================================
   ELIMINAR PAGO
========================================================= */
/* =========================================================
   ELIMINAR PAGO (GRUPAL)
   ✅ Si hay id_factura: elimina todos los pagos con esa factura
   ✅ Si NO hay id_factura: elimina todos los pagos del MISMO cliente y período
========================================================= */
function pagos_eliminar_pago(): void
{
  global $pdo;
  if (!($pdo instanceof PDO)) json_error("DB no inicializada (pdo)");

  require_method('POST');
  $body = read_json_body();

  $id_pago = isset($body['id_pago']) && is_numeric($body['id_pago']) ? (int)$body['id_pago'] : 0;
  if ($id_pago <= 0) json_error("Falta id_pago");

  try {
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    // 1) Traemos info "ancla" del pago
    $stInfo = $pdo->prepare("
      SELECT
        p.id_pago,
        p.id_factura,
        p.id_mes,
        p.id_medio_pago,
        p.fecha_pago,
        YEAR(p.fecha_pago) AS anio,
        cs.id_cliente
      FROM pagos p
      INNER JOIN clientes_sistemas cs ON cs.id_sistema = p.id_sistema
      WHERE p.id_pago = :id_pago
      LIMIT 1
    ");
    $stInfo->execute([':id_pago' => $id_pago]);
    $info = $stInfo->fetch(PDO::FETCH_ASSOC);

    if (!$info) {
      json_error("No se encontró el pago (id_pago=$id_pago)");
    }

    $id_factura    = isset($info['id_factura']) && is_numeric($info['id_factura']) ? (int)$info['id_factura'] : 0;
    $id_mes        = isset($info['id_mes']) && is_numeric($info['id_mes']) ? (int)$info['id_mes'] : 0;
    $id_medio_pago = isset($info['id_medio_pago']) && is_numeric($info['id_medio_pago']) ? (int)$info['id_medio_pago'] : 0;
    $anio          = isset($info['anio']) && is_numeric($info['anio']) ? (int)$info['anio'] : 0;
    $id_cliente    = isset($info['id_cliente']) && is_numeric($info['id_cliente']) ? (int)$info['id_cliente'] : 0;

    $fecha_pago_raw = (string)($info['fecha_pago'] ?? '');
    $fecha_dia = '';
    if ($fecha_pago_raw !== '') {
      // dejamos solo el día (YYYY-MM-DD)
      $fecha_dia = substr($fecha_pago_raw, 0, 10);
    }

    if ($id_mes < 1 || $id_mes > 12) json_error("Datos inválidos del pago (id_mes)");
    if ($anio < 2000 || $anio > 2100) json_error("Datos inválidos del pago (anio)");
    if ($id_cliente <= 0) json_error("Datos inválidos del pago (id_cliente)");

    $pdo->beginTransaction();

    $deleted = 0;
    $modo = '';

    // 2) Borrado grupal
    if ($id_factura > 0) {
      // ✅ Caso ideal: todos los pagos “relacionados” comparten id_factura
      $stDel = $pdo->prepare("DELETE FROM pagos WHERE id_factura = :id_factura");
      $stDel->execute([':id_factura' => $id_factura]);
      $deleted = (int)$stDel->rowCount();
      $modo = 'por_id_factura';
    } else {
      // ✅ Fallback: mismo cliente + período + medio pago + mismo día
      // (evita llevarse pagos de otros días/medios si existieran)
      $sql = "
        DELETE p
        FROM pagos p
        INNER JOIN clientes_sistemas cs ON cs.id_sistema = p.id_sistema
        WHERE cs.id_cliente = :id_cliente
          AND p.id_mes = :id_mes
          AND YEAR(p.fecha_pago) = :anio
      ";

      $params = [
        ':id_cliente' => $id_cliente,
        ':id_mes'     => $id_mes,
        ':anio'       => $anio,
      ];

      if ($id_medio_pago > 0) {
        $sql .= " AND p.id_medio_pago = :id_medio_pago ";
        $params[':id_medio_pago'] = $id_medio_pago;
      }

      if ($fecha_dia !== '') {
        $sql .= " AND DATE(p.fecha_pago) = :fecha_dia ";
        $params[':fecha_dia'] = $fecha_dia;
      }

      $stDel = $pdo->prepare($sql);
      $stDel->execute($params);
      $deleted = (int)$stDel->rowCount();
      $modo = 'por_cliente_periodo';
    }

    if ($deleted <= 0) {
      $pdo->rollBack();
      json_error("No se eliminó ningún registro relacionado (id_pago=$id_pago).");
    }

    $pdo->commit();

    json_ok([
      'exito'      => true,
      'id_pago'    => $id_pago,
      'eliminados' => $deleted,
      'modo'       => $modo,
      'id_factura' => ($id_factura > 0) ? $id_factura : null,
      'anio'       => $anio,
      'id_mes'     => $id_mes,
      'id_cliente' => $id_cliente,
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_error("Error DB al eliminar pago (grupal)", ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   SISTEMAS DEL CLIENTE
========================================================= */
function pagos_cliente_sistemas(): void
{
  global $pdo;
  if (!($pdo instanceof PDO)) json_error("DB no inicializada (pdo)");

  require_method('POST');
  $in = read_json_body();

  $id_sistema = isset($in['id_sistema']) && is_numeric($in['id_sistema']) ? (int)$in['id_sistema'] : 0;
  if ($id_sistema <= 0) json_error("Falta id_sistema válido");

  try {
    $st = $pdo->prepare("SELECT id_cliente FROM clientes_sistemas WHERE id_sistema = :id_sistema LIMIT 1");
    $st->execute([':id_sistema' => $id_sistema]);
    $id_cliente = (int)($st->fetchColumn() ?: 0);

    if ($id_cliente <= 0) {
      json_ok(['exito' => true, 'sistemas' => []]);
    }

    $sql = "
      SELECT cs.id_sistema, cs.nombre, cs.descripcion, cs.estado
      FROM clientes_sistemas cs
      WHERE cs.id_cliente = :id_cliente
      ORDER BY cs.nombre ASC, cs.id_sistema ASC
    ";
    $st2 = $pdo->prepare($sql);
    $st2->execute([':id_cliente' => $id_cliente]);
    $rows = $st2->fetchAll(PDO::FETCH_ASSOC);

    $out = [];
    foreach ($rows as $r) {
      $estado = $r['estado'] ?? null;
      $activo = 0;
      if (is_numeric($estado)) {
        $activo = ((int)$estado) === 1 ? 1 : 0;
      } else {
        $s = strtolower(trim((string)$estado));
        $activo = in_array($s, ['activo', 'activa', 'habilitado', 'habilitada', '1', 'true', 'si'], true) ? 1 : 0;
      }
      $out[] = [
        'id_sistema'  => (int)($r['id_sistema'] ?? 0),
        'nombre'      => (string)($r['nombre'] ?? ''),
        'descripcion' => (string)($r['descripcion'] ?? ''),
        'activo'      => $activo,
      ];
    }

    $out = array_values(array_filter($out, fn($x) =>
      ($x['id_sistema'] ?? 0) > 0 && trim((string)($x['nombre'] ?? '')) !== ''
    ));

    json_ok(['exito' => true, 'sistemas' => $out]);
  } catch (Throwable $e) {
    json_error("Error DB al obtener sistemas del cliente", ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   Dispatcher
========================================================= */
if (!defined('PAGOS_ROUTED')) {
  if (!isset($pdo) || !($pdo instanceof PDO)) {
    $db = __DIR__ . '/../../config/db.php';
    if (file_exists($db)) require_once $db;
  }

  if (!isset($pdo) || !($pdo instanceof PDO)) {
    json_error("No se pudo inicializar la base de datos (pdo).");
  }

  try {
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    $op     = (string)($_GET['op'] ?? '');
    $estado = (string)($_GET['estado'] ?? '');

    switch ($op) {
      case 'cliente_facturacion':
        pagos_cliente_facturacion();
        break;
      case 'cliente_facturacion_sistema':
        pagos_cliente_facturacion_sistema();
        break;
      case 'equipo_sistema':
        if (!function_exists('pagos_equipo_sistema')) json_error("Endpoint equipo_sistema.php no cargado");
        pagos_equipo_sistema();
        break;
      case 'eliminar_pago':
        pagos_eliminar_pago();
        break;
      case 'registrar_pago':
        pagos_registrar_pago();
        break;
      case 'detalle_sistema':
        pagos_detalle_sistema();
        break;
      case 'detalle_periodo':
        pagos_detalle_periodo();
        break;
      case 'anios':
        pagos_listar_anios();
        break;
      case 'factura_arca':
        if (!function_exists('pagos_factura_arca')) json_error("Endpoint arca_factura.php no cargado");
        pagos_factura_arca();
        break;
      case 'factura_guardar_pdf':
        if (!function_exists('pagos_factura_guardar_pdf')) json_error("Endpoint factura_guardar_pdf.php no cargado");
        pagos_factura_guardar_pdf();
        break;
      case 'planes_mantenimiento':
        pagos_planes_mantenimiento();
        break;
      case 'cliente_sistemas':
        pagos_cliente_sistemas();
        break;
      case '':
        break;
      default:
        json_error("Operación no válida", ['op' => $op, 'estado' => $estado]);
    }

    if ($estado === 'pagado' || $estado === 'pagados') pagos_listar_pagados();
    if ($estado === 'deudor' || $estado === 'deudores') pagos_listar_deudores();

    json_error("Operación no válida", ['op' => $op, 'estado' => $estado]);
  } catch (Throwable $e) {
    json_error("Error inesperado en pagos.php", ['error' => $e->getMessage()]);
  }
}