<?php
// backend/modules/pagos/pagos.php
declare(strict_types=1);

/**
 * Requiere: $pdo (PDO) desde backend/config/db.php
 *
 * Tablas usadas:
 * - pagos (id_pago, id_sistema, id_mes, id_medio_pago, monto, fecha_pago, created_at, comprobante?)
 * - meses (id_mes, mes)
 * - medios_pago (id_medio_pago, nombre, activo)
 * - clientes_sistemas (id_sistema, id_cliente, nombre, descripcion, estado, fecha_inicio, created_at)
 * - clientes (id_cliente, nombre, notas, activo)
 *
 * ✅ Facturación:
 * - clientes_facturacion (id_cliente, doc_tipo, doc_nro, razon_social, domicilio, id_condicion_iva, cond_venta, created_at)
 * - iva_condiciones (id_condicion_iva, descripcion, ...)
 *
 * ✅ ARCA:
 * - incluye arca_factura.php (pagos_factura_arca)
 *
 * ✅ Guardar PDF:
 * - incluye factura_guardar_pdf.php (pagos_factura_guardar_pdf)
 *
 * ✅ Planes mantenimiento:
 * - gestion_3devs.planes_mantenimiento (id, nombre, descripcion, monto, activo, fecha_creacion)
 */

// ✅ No mostrar warnings/notices en salida (si salen, rompen JSON)
ini_set('display_errors', '0');
ini_set('html_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

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

/**
 * mes puede venir como:
 * - "ENERO" (nombre)
 * - "1" (id_mes)
 */
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

/**
 * obligaciones por año/mes desde inicio hasta hoy inclusive (mes a mes)
 * retorna: [2025 => [6,7,8], 2026 => [1,2]]
 */
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
   ✅ INCLUDE ENDPOINTS EXTRA
========================================================= */
require_once __DIR__ . '/equipo_sistema.php';
require_once __DIR__ . '/arca_factura.php';
require_once __DIR__ . '/factura_guardar_pdf.php';

/* =========================================================
   ✅ NUEVO: PLANES DE MANTENIMIENTO (DB)
   GET /api.php?action=pagos&op=planes_mantenimiento
========================================================= */
function pagos_planes_mantenimiento(): void
{
  global $pdo;

  try {
    $sql = "
      SELECT
        id,
        nombre,
        descripcion,
        monto,
        activo
      FROM gestion_3devs.planes_mantenimiento
      WHERE activo = 1
      ORDER BY monto ASC, id ASC
    ";

    $st = $pdo->query($sql);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $out = [];
    foreach ($rows as $r) {
      $out[] = [
        'id' => (int)($r['id'] ?? 0),
        'nombre' => (string)($r['nombre'] ?? ''),
        'descripcion' => (string)($r['descripcion'] ?? ''),
        'monto' => isset($r['monto']) ? (float)$r['monto'] : 0.0,
        'activo' => (int)($r['activo'] ?? 0),
      ];
    }

    json_ok([
      'exito' => true,
      'planes' => $out,
    ]);
  } catch (Throwable $e) {
    json_error("Error DB al obtener planes de mantenimiento", ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   ✅ DATOS FACTURACIÓN POR id_pago
========================================================= */
function pagos_cliente_facturacion(): void
{
  global $pdo;

  require_method('POST');
  $in = read_json_body();

  $id_pago = isset($in['id_pago']) && is_numeric($in['id_pago']) ? (int)$in['id_pago'] : 0;
  if ($id_pago <= 0) json_error("Falta id_pago válido");

  try {
    $sql = "
      SELECT
        cf.id_cliente,
        cf.doc_tipo,
        cf.doc_nro,
        cf.razon_social,
        cf.domicilio,
        cf.id_condicion_iva,
        COALESCE(ic.descripcion, '') AS cond_iva,
        cf.cond_venta
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
      json_ok([
        'exito' => true,
        'cliente_facturacion' => null,
        'mensaje' => 'Cliente sin datos de facturación cargados.'
      ]);
    }

    $doc_tipo = isset($row['doc_tipo']) ? (int)$row['doc_tipo'] : 80;
    $doc_nro  = preg_replace('/\D+/', '', (string)($row['doc_nro'] ?? ''));

    $condIvaTxt = trim((string)($row['cond_iva'] ?? ''));
    if ($condIvaTxt === '') $condIvaTxt = 'IVA Sujeto Exento';

    json_ok([
      'exito' => true,
      'cliente_facturacion' => [
        'id_cliente'        => (int)($row['id_cliente'] ?? 0),
        'doc_tipo'          => $doc_tipo,
        'doc_nro'           => $doc_nro,
        'razon_social'      => (string)($row['razon_social'] ?? ''),
        'domicilio'         => (string)($row['domicilio'] ?? ''),
        'id_condicion_iva'  => isset($row['id_condicion_iva']) ? (int)$row['id_condicion_iva'] : null,
        'cond_iva'          => $condIvaTxt,
        'cond_venta'        => (string)($row['cond_venta'] ?? 'Contado / Transferencia Bancaria'),
      ],
    ]);
  } catch (Throwable $e) {
    json_error("Error DB al obtener datos de facturación", ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   ✅ DATOS FACTURACIÓN POR id_sistema (para DEUDORES)
========================================================= */
function pagos_cliente_facturacion_sistema(): void
{
  global $pdo;

  require_method('POST');
  $in = read_json_body();

  $id_sistema = isset($in['id_sistema']) && is_numeric($in['id_sistema']) ? (int)$in['id_sistema'] : 0;
  if ($id_sistema <= 0) json_error("Falta id_sistema válido");

  try {
    $sql = "
      SELECT
        cf.id_cliente,
        cf.doc_tipo,
        cf.doc_nro,
        cf.razon_social,
        cf.domicilio,
        cf.id_condicion_iva,
        COALESCE(ic.descripcion, '') AS cond_iva,
        cf.cond_venta
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
      json_ok([
        'exito' => true,
        'cliente_facturacion' => null,
        'mensaje' => 'Cliente sin datos de facturación cargados.'
      ]);
    }

    $doc_tipo = isset($row['doc_tipo']) ? (int)$row['doc_tipo'] : 80;
    $doc_nro  = preg_replace('/\D+/', '', (string)($row['doc_nro'] ?? ''));

    $condIvaTxt = trim((string)($row['cond_iva'] ?? ''));
    if ($condIvaTxt === '') $condIvaTxt = 'IVA Sujeto Exento';

    json_ok([
      'exito' => true,
      'cliente_facturacion' => [
        'id_cliente'        => (int)($row['id_cliente'] ?? 0),
        'doc_tipo'          => $doc_tipo,
        'doc_nro'           => $doc_nro,
        'razon_social'      => (string)($row['razon_social'] ?? ''),
        'domicilio'         => (string)($row['domicilio'] ?? ''),
        'id_condicion_iva'  => isset($row['id_condicion_iva']) ? (int)$row['id_condicion_iva'] : null,
        'cond_iva'          => $condIvaTxt,
        'cond_venta'        => (string)($row['cond_venta'] ?? 'Contado / Transferencia Bancaria'),
      ],
    ]);
  } catch (Throwable $e) {
    json_error("Error DB al obtener datos de facturación (sistema)", ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   ✅ LISTAR AÑOS
========================================================= */
function pagos_listar_anios(): void
{
  global $pdo;

  $sql = "SELECT DISTINCT YEAR(fecha_pago) AS anio
          FROM pagos
          ORDER BY anio DESC";
  $stmt = $pdo->query($sql);
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

  $anios = [];
  foreach ($rows as $r) {
    if (isset($r['anio'])) $anios[] = (int)$r['anio'];
  }

  json_ok(['exito' => true, 'anios' => $anios]);
}

/* =========================================================
   ✅ LISTAR PAGADOS POR MES/AÑO
   (devuelve ARRAY para no romper frontend)
========================================================= */
function pagos_listar_pagados(): void
{
  global $pdo;

  $anio = get_int('anio', 2000, 2100);
  $mesParam = get_str('mes');
  $idMes = resolver_id_mes($pdo, $mesParam);

  $sql = "
    SELECT
      p.id_pago,
      p.id_sistema,
      p.monto,
      p.fecha_pago,
      mp.nombre AS medio_pago,
      m.mes     AS mes_nombre,
      cs.nombre AS sistema,
      cs.descripcion AS sistema_descripcion,
      cs.estado AS sistema_estado,
      c.nombre  AS cliente
    FROM pagos p
    INNER JOIN meses m              ON m.id_mes = p.id_mes
    INNER JOIN medios_pago mp       ON mp.id_medio_pago = p.id_medio_pago
    INNER JOIN clientes_sistemas cs ON cs.id_sistema = p.id_sistema
    INNER JOIN clientes c           ON c.id_cliente = cs.id_cliente
    WHERE p.id_mes = :id_mes
      AND YEAR(p.fecha_pago) = :anio
    ORDER BY p.fecha_pago DESC, p.id_pago DESC
  ";

  $stmt = $pdo->prepare($sql);
  $stmt->execute([
    ':id_mes' => $idMes,
    ':anio'  => $anio,
  ]);
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

  $out = [];
  foreach ($rows as $r) {
    $concepto = trim((string)($r['sistema'] ?? ''));
    $desc = trim((string)($r['sistema_descripcion'] ?? ''));
    if ($desc !== '') $concepto .= " • " . $desc;
    if ($concepto === '') $concepto = '—';

    $out[] = [
      'id_pago'    => (int)($r['id_pago'] ?? 0),
      'id_sistema' => (int)($r['id_sistema'] ?? 0),
      'cliente'    => $r['cliente'] ?? '—',
      'concepto'   => $concepto,
      'medio_pago' => $r['medio_pago'] ?? '—',
      'monto'      => isset($r['monto']) ? (float)$r['monto'] : null,
      'fecha_pago' => $r['fecha_pago'] ?? null,
      'mes'        => $r['mes_nombre'] ?? null,
      'anio'       => $anio,
      'estado_sistema' => $r['sistema_estado'] ?? null,
    ];
  }

  json_ok($out);
}

/* =========================================================
   ✅ LISTAR DEUDORES POR MES/AÑO
   (devuelve ARRAY para no romper frontend)
========================================================= */
function pagos_listar_deudores(): void
{
  global $pdo;

  $anio = get_int('anio', 2000, 2100);
  $mesParam = get_str('mes');
  $idMes = resolver_id_mes($pdo, $mesParam);

  $periodStart = DateTime::createFromFormat('Y-n-j', "$anio-$idMes-1");
  if (!$periodStart) json_error("Período inválido");

  $periodEnd = (clone $periodStart);
  $periodEnd->modify('last day of this month');
  $periodEndStr = $periodEnd->format('Y-m-d');

  $sql = "
    SELECT
      cs.id_sistema,
      cs.nombre AS sistema,
      cs.descripcion AS sistema_descripcion,
      cs.estado AS sistema_estado,
      cs.fecha_inicio,
      cs.created_at,
      c.nombre AS cliente,
      DATE(
        CASE
          WHEN STR_TO_DATE(NULLIF(LEFT(TRIM(cs.fecha_inicio),10),'0000-00-00'), '%Y-%m-%d') IS NULL
               AND DATE(cs.created_at) IS NULL
            THEN NULL
          WHEN STR_TO_DATE(NULLIF(LEFT(TRIM(cs.fecha_inicio),10),'0000-00-00'), '%Y-%m-%d') IS NULL
            THEN DATE(cs.created_at)
          WHEN DATE(cs.created_at) IS NULL
            THEN STR_TO_DATE(NULLIF(LEFT(TRIM(cs.fecha_inicio),10),'0000-00-00'), '%Y-%m-%d')
          ELSE GREATEST(
            STR_TO_DATE(NULLIF(LEFT(TRIM(cs.fecha_inicio),10),'0000-00-00'), '%Y-%m-%d'),
            DATE(cs.created_at)
          )
        END
      ) AS inicio_real
    FROM clientes_sistemas cs
    INNER JOIN clientes c ON c.id_cliente = cs.id_cliente
    LEFT JOIN pagos p
      ON p.id_sistema = cs.id_sistema
     AND p.id_mes = :id_mes
     AND YEAR(p.fecha_pago) = :anio
    WHERE p.id_pago IS NULL
      AND (cs.estado = 'activo' OR cs.estado = 1)
      AND DATE(
        CASE
          WHEN STR_TO_DATE(NULLIF(LEFT(TRIM(cs.fecha_inicio),10),'0000-00-00'), '%Y-%m-%d') IS NULL
               AND DATE(cs.created_at) IS NULL
            THEN NULL
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
    ORDER BY c.nombre ASC, cs.nombre ASC
  ";

  $stmt = $pdo->prepare($sql);
  $stmt->execute([
    ':id_mes'     => $idMes,
    ':anio'       => $anio,
    ':period_end' => $periodEndStr,
  ]);

  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

  $out = [];
  foreach ($rows as $r) {
    $concepto = trim((string)($r['sistema'] ?? ''));
    $desc = trim((string)($r['sistema_descripcion'] ?? ''));
    if ($desc !== '') $concepto .= " • " . $desc;
    if ($concepto === '') $concepto = '—';

    $out[] = [
      'id_sistema' => (int)($r['id_sistema'] ?? 0),
      'cliente'    => $r['cliente'] ?? '—',
      'concepto'   => $concepto,
      'medio_pago' => '—',
      'monto'      => null,
      'fecha_pago' => null,
      'mes'        => $mesParam,
      'anio'       => $anio,
      'estado_sistema' => $r['sistema_estado'] ?? null,
    ];
  }

  json_ok($out);
}

/* =========================================================
   ✅ DETALLE SISTEMA
========================================================= */
function pagos_detalle_sistema(): void
{
  global $pdo;

  $id_sistema = isset($_GET['id_sistema']) && is_numeric($_GET['id_sistema'])
    ? (int)$_GET['id_sistema']
    : 0;

  if ($id_sistema <= 0) json_error("Falta id_sistema");

  $sql = "
    SELECT
      cs.id_sistema,
      cs.id_cliente,
      cs.nombre      AS sistema_nombre,
      cs.descripcion AS sistema_descripcion,
      cs.estado      AS sistema_estado,
      cs.fecha_inicio,
      cs.created_at  AS sistema_created_at,
      DATE(
        CASE
          WHEN STR_TO_DATE(NULLIF(LEFT(TRIM(cs.fecha_inicio),10),'0000-00-00'), '%Y-%m-%d') IS NULL
               AND DATE(cs.created_at) IS NULL
            THEN NULL
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
      c.nombre       AS cliente_nombre,
      c.notas        AS cliente_notas,
      c.activo       AS cliente_activo
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
    $mesesCatalogo[] = [
      'id_mes' => (int)$m['id_mes'],
      'mes'    => (string)$m['mes'],
    ];
  }

  $sqlP = "SELECT YEAR(fecha_pago) AS anio, id_mes
           FROM pagos
           WHERE id_sistema = :id";
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
    'mesesCatalogo' => $mesesCatalogo,
    'pagosPorAnio'  => $pagosPorAnio,
    'adeudosPorAnio'=> $adeudosPorAnio,
    'inicio'        => $inicio->format('Y-m-d'),
    'hoy'           => $hoy->format('Y-m-d'),
  ]);
}

/* =========================================================
   ✅ NUEVO: DETALLE POR PERÍODO (pago + factura)
   GET /api.php?action=pagos&op=detalle_periodo&id_sistema=5&anio=2026&id_mes=1
========================================================= */
function pagos_detalle_periodo(): void
{
  global $pdo;

  $id_sistema = isset($_GET['id_sistema']) && is_numeric($_GET['id_sistema']) ? (int)$_GET['id_sistema'] : 0;
  $anio      = isset($_GET['anio']) && is_numeric($_GET['anio']) ? (int)$_GET['anio'] : 0;
  $id_mes    = isset($_GET['id_mes']) && is_numeric($_GET['id_mes']) ? (int)$_GET['id_mes'] : 0;

  if ($id_sistema <= 0) json_error("Falta id_sistema");
  if ($anio < 2000 || $anio > 2100) json_error("Año inválido");
  if ($id_mes < 1 || $id_mes > 12) json_error("Mes inválido");

  try {
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    // 1) Detalle sistema/cliente (para título del modal)
    $sqlDet = "
      SELECT
        cs.id_sistema,
        cs.id_cliente,
        cs.nombre AS sistema_nombre,
        cs.descripcion AS sistema_descripcion,
        cs.estado AS sistema_estado,
        c.nombre AS cliente_nombre
      FROM clientes_sistemas cs
      INNER JOIN clientes c ON c.id_cliente = cs.id_cliente
      WHERE cs.id_sistema = :id_sistema
      LIMIT 1
    ";
    $stDet = $pdo->prepare($sqlDet);
    $stDet->execute([':id_sistema' => $id_sistema]);
    $det = $stDet->fetch(PDO::FETCH_ASSOC);
    if (!$det) json_error("Sistema no encontrado (id_sistema=$id_sistema)");

    // 2) Pago (si existe) para ese período
    $sqlPago = "
      SELECT
        id_pago,
        id_sistema,
        id_mes,
        id_medio_pago,
        monto,
        fecha_pago
      FROM pagos
      WHERE id_sistema = :id_sistema
        AND id_mes = :id_mes
        AND YEAR(fecha_pago) = :anio
      ORDER BY id_pago DESC
      LIMIT 1
    ";
    $stP = $pdo->prepare($sqlPago);
    $stP->execute([
      ':id_sistema' => $id_sistema,
      ':id_mes' => $id_mes,
      ':anio' => $anio,
    ]);
    $pago = $stP->fetch(PDO::FETCH_ASSOC) ?: null;

    // 3) Factura (si existe) para ese período (última)
    $sqlF = "
      SELECT
        id_factura,
        id_pago,
        id_sistema,
        anio,
        id_mes,
        estado,
        monto_ars,
        doc_tipo,
        doc_nro,
        cbte_tipo,
        pto_vta,
        cae,
        cae_vto,
        cbte_nro,
        fecha_cbte,
        pdf_path,
        items_facturacion_json,
        usd_rate,
        total_usd,
        total_ars,
        periodo_desde,
        periodo_hasta,
        vto_pago,
        created_at
      FROM facturas
      WHERE id_sistema = :id_sistema
        AND anio = :anio
        AND id_mes = :id_mes
      ORDER BY created_at DESC, id_factura DESC
      LIMIT 1
    ";
    $stF = $pdo->prepare($sqlF);
    $stF->execute([
      ':id_sistema' => $id_sistema,
      ':anio' => $anio,
      ':id_mes' => $id_mes,
    ]);
    $factura = $stF->fetch(PDO::FETCH_ASSOC) ?: null;

    // Normalizar tipos
    if ($pago) {
      $pago = [
        'id_pago' => (int)($pago['id_pago'] ?? 0),
        'id_sistema' => (int)($pago['id_sistema'] ?? 0),
        'id_mes' => (int)($pago['id_mes'] ?? 0),
        'id_medio_pago' => (int)($pago['id_medio_pago'] ?? 0),
        'monto' => isset($pago['monto']) ? (float)$pago['monto'] : 0.0,
        'fecha_pago' => $pago['fecha_pago'] ?? null,
      ];
    }

    if ($factura) {
      $factura['id_factura'] = (int)($factura['id_factura'] ?? 0);
      $factura['id_pago'] = isset($factura['id_pago']) ? (int)$factura['id_pago'] : null;
      $factura['id_sistema'] = isset($factura['id_sistema']) ? (int)$factura['id_sistema'] : null;
      $factura['anio'] = (int)($factura['anio'] ?? 0);
      $factura['id_mes'] = (int)($factura['id_mes'] ?? 0);
      $factura['monto_ars'] = isset($factura['monto_ars']) ? (float)$factura['monto_ars'] : 0.0;
      $factura['usd_rate'] = isset($factura['usd_rate']) ? (float)$factura['usd_rate'] : null;
      $factura['total_usd'] = isset($factura['total_usd']) ? (float)$factura['total_usd'] : null;
      $factura['total_ars'] = isset($factura['total_ars']) ? (float)$factura['total_ars'] : null;
    }

    json_ok([
      'exito' => true,
      'detalle' => [
        'cliente_nombre' => (string)($det['cliente_nombre'] ?? ''),
        'sistema_nombre' => (string)($det['sistema_nombre'] ?? ''),
        'sistema_descripcion' => (string)($det['sistema_descripcion'] ?? ''),
        'sistema_estado' => $det['sistema_estado'] ?? null,
      ],
      'pago' => $pago,
      'factura' => $factura,
      'anio' => $anio,
      'id_mes' => $id_mes,
    ]);
  } catch (Throwable $e) {
    json_error("Error DB al obtener detalle del período", ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   ✅ REGISTRAR PAGO
========================================================= */
function pagos_registrar_pago(): void
{
  global $pdo;

  require_method('POST');
  $body = read_json_body();

  $id_sistema = isset($body['id_sistema']) && is_numeric($body['id_sistema']) ? (int)$body['id_sistema'] : 0;
  $anio = isset($body['anio']) && is_numeric($body['anio']) ? (int)$body['anio'] : 0;
  $id_medio_pago = isset($body['id_medio_pago']) && is_numeric($body['id_medio_pago']) ? (int)$body['id_medio_pago'] : 0;
  $monto = isset($body['monto']) && is_numeric($body['monto']) ? (float)$body['monto'] : 0.0;
  $meses = $body['meses'] ?? [];
  $fecha_pago = isset($body['fecha_pago']) ? trim((string)$body['fecha_pago']) : '';

  // ✅ NUEVO: opcional (frontend lo manda cuando viene desde factura)
  $id_factura_in = (isset($body['id_factura']) && is_numeric($body['id_factura']))
    ? (int)$body['id_factura']
    : 0;

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

  // Validar sistema
  $stSys = $pdo->prepare("SELECT id_sistema FROM clientes_sistemas WHERE id_sistema = ? LIMIT 1");
  $stSys->execute([$id_sistema]);
  if (!$stSys->fetchColumn()) json_error("Sistema inexistente");

  // Validar medio pago
  $stMP = $pdo->prepare("SELECT id_medio_pago FROM medios_pago WHERE id_medio_pago = ? AND activo = 1 LIMIT 1");
  $stMP->execute([$id_medio_pago]);
  if (!$stMP->fetchColumn()) json_error("Medio de pago inválido o inactivo");

  // Normalizar meses
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

  $insertados = [];
  $omitidos = [];

  // ✅ NUEVO: info por mes (para devolver auditoría)
  $facturaPorMes = []; // [mes => ['id_factura'=>?, 'pdf_path'=>?]]

  try {
    $pdo->beginTransaction();

    $stCheck = $pdo->prepare("
      SELECT COUNT(*)
      FROM pagos
      WHERE id_sistema = :id_sistema
        AND id_mes = :id_mes
        AND YEAR(fecha_pago) = :anio
      LIMIT 1
    ");

    // ✅ NUEVO: buscar factura exacta por id_factura (si viene)
    $stFacturaById = $pdo->prepare("
      SELECT id_factura, pdf_path
      FROM facturas
      WHERE id_factura = :id_factura
        AND id_sistema = :id_sistema
        AND anio = :anio
        AND id_mes = :id_mes
      LIMIT 1
    ");

    // ✅ NUEVO: buscar última factura por período (fallback)
    $stFacturaLast = $pdo->prepare("
      SELECT id_factura, pdf_path
      FROM facturas
      WHERE id_sistema = :id_sistema
        AND anio = :anio
        AND id_mes = :id_mes
      ORDER BY created_at DESC, id_factura DESC
      LIMIT 1
    ");

    // ✅ MODIFICADO: ahora inserta comprobante + id_factura
    $stIns = $pdo->prepare("
      INSERT INTO pagos (id_sistema, id_mes, id_medio_pago, monto, fecha_pago, comprobante, id_factura)
      VALUES (:id_sistema, :id_mes, :id_medio_pago, :monto, :fecha_pago, :comprobante, :id_factura)
    ");

    foreach ($mesesNorm as $mes) {
      // duplicado?
      $stCheck->execute([
        ':id_sistema' => $id_sistema,
        ':id_mes' => $mes,
        ':anio' => $anio,
      ]);
      $exists = ((int)$stCheck->fetchColumn()) > 0;

      if ($exists) {
        $omitidos[] = $mes;
        continue;
      }

      // ✅ NUEVO: resolver factura para ese mes
      $facturaId = null;
      $pdfPath = null;

      if ($id_factura_in > 0) {
        $stFacturaById->execute([
          ':id_factura' => $id_factura_in,
          ':id_sistema' => $id_sistema,
          ':anio' => $anio,
          ':id_mes' => $mes,
        ]);
        $fx = $stFacturaById->fetch(PDO::FETCH_ASSOC);
        if ($fx) {
          $facturaId = (int)($fx['id_factura'] ?? 0);
          $pdfPath = (string)($fx['pdf_path'] ?? '');
        }
      }

      // fallback: última factura del período
      if (!$facturaId) {
        $stFacturaLast->execute([
          ':id_sistema' => $id_sistema,
          ':anio' => $anio,
          ':id_mes' => $mes,
        ]);
        $fx = $stFacturaLast->fetch(PDO::FETCH_ASSOC);
        if ($fx) {
          $facturaId = (int)($fx['id_factura'] ?? 0);
          $pdfPath = (string)($fx['pdf_path'] ?? '');
        }
      }

      $pdfPath = trim((string)$pdfPath);
      if ($pdfPath === '') $pdfPath = null;

      // ✅ comprobante = pdf_path (si existe)
      $comprobante = $pdfPath; // null si no hay factura/pdf

      $stIns->execute([
        ':id_sistema' => $id_sistema,
        ':id_mes' => $mes,
        ':id_medio_pago' => $id_medio_pago,
        ':monto' => $monto,
        ':fecha_pago' => $fecha_pago,
        ':comprobante' => $comprobante,
        ':id_factura' => ($facturaId && $facturaId > 0) ? $facturaId : null,
      ]);

      $insertados[] = $mes;
      $facturaPorMes[$mes] = [
        'id_factura' => ($facturaId && $facturaId > 0) ? $facturaId : null,
        'pdf_path' => $pdfPath,
      ];
    }

    $pdo->commit();
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_error("Error DB al registrar pagos", ['error' => $e->getMessage()]);
  }

  json_ok([
    'exito' => true,
    'id_sistema' => $id_sistema,
    'anio' => $anio,
    'fecha_pago' => $fecha_pago,
    'insertados' => $insertados,
    'omitidos' => $omitidos,

    // ✅ NUEVO: para que puedas ver qué factura/pdf se asoció por mes
    'factura_por_mes' => $facturaPorMes,
  ]);
}


/* =========================================================
   ✅ ELIMINAR PAGO
========================================================= */
function pagos_eliminar_pago(): void
{
  global $pdo;

  require_method('POST');
  $body = read_json_body();

  $id_pago = isset($body['id_pago']) && is_numeric($body['id_pago']) ? (int)$body['id_pago'] : 0;
  if ($id_pago <= 0) json_error("Falta id_pago");

  try {
    $st = $pdo->prepare("DELETE FROM pagos WHERE id_pago = ? LIMIT 1");
    $st->execute([$id_pago]);

    if ($st->rowCount() === 0) {
      json_error("No se encontró el pago (id_pago=$id_pago)");
    }

    json_ok(['exito' => true, 'id_pago' => $id_pago]);
  } catch (Throwable $e) {
    json_error("Error DB al eliminar pago", ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   ✅ Dispatcher SOLO si se llama directo a pagos.php
========================================================= */
if (!defined('PAGOS_ROUTED')) {
  try {
    $op     = (string)($_GET['op'] ?? '');
    $estado = (string)($_GET['estado'] ?? '');

    if ($op === 'cliente_facturacion') pagos_cliente_facturacion();
    if ($op === 'cliente_facturacion_sistema') pagos_cliente_facturacion_sistema();
    if ($op === 'equipo_sistema') pagos_equipo_sistema();
    if ($op === 'eliminar_pago') pagos_eliminar_pago();
    if ($op === 'registrar_pago') pagos_registrar_pago();
    if ($op === 'detalle_sistema') pagos_detalle_sistema();
    if ($op === 'detalle_periodo') pagos_detalle_periodo();            // ✅ NUEVO
    if ($op === 'anios') pagos_listar_anios();
    if ($op === 'factura_arca') pagos_factura_arca();
    if ($op === 'factura_guardar_pdf') pagos_factura_guardar_pdf();
    if ($op === 'planes_mantenimiento') pagos_planes_mantenimiento();

    if ($estado === 'pagado' || $estado === 'pagados') pagos_listar_pagados();
    if ($estado === 'deudor' || $estado === 'deudores') pagos_listar_deudores();

    json_error("Operación no válida", ['op' => $op, 'estado' => $estado]);
  } catch (Throwable $e) {
    json_error("Error inesperado en pagos.php", ['error' => $e->getMessage()]);
  }
}
