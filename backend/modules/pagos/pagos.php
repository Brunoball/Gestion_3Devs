<?php
// backend/modules/pagos/pagos.php
declare(strict_types=1);

require_once __DIR__ . '/../reparto/reparto.service.php';
require_once __DIR__ . '/../reportes/periodos.service.php';

ini_set('display_errors', '0');
ini_set('html_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

if (!headers_sent()) {
  header('Content-Type: application/json; charset=utf-8');
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Session, X-Organization');
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
   Contexto multiempresa
========================================================= */
function pagos_auth(): array
{
  $ctx = $GLOBALS['PAGOS_AUTH'] ?? null;
  if (!is_array($ctx) || empty($ctx['id_organizacion'])) {
    json_error('No se pudo resolver la organización activa.');
  }
  return $ctx;
}

function pagos_org_id(): int
{
  return (int)pagos_auth()['id_organizacion'];
}

function pagos_org_code(): string
{
  return (string)(pagos_auth()['organizacion_codigo'] ?? 'ORG');
}

function pagos_require_write(): array
{
  $ctx = pagos_auth();
  if (!in_array((string)($ctx['rol_organizacion'] ?? 'vista'), ['admin', 'contador'], true)) {
    json_error('No tenés permisos para modificar pagos en esta entidad.');
  }
  return $ctx;
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


/** Distribuye centavos en partes iguales y conserva exactamente el total. */
function pagos_distribuir_centavos_iguales(array $ids, float $monto): array
{
  $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn(int $id): bool => $id > 0)));
  if (!$ids) return [];

  $totalCentavos = (int)round(max(0.0, $monto) * 100);
  $base = intdiv($totalCentavos, count($ids));
  $resto = $totalCentavos - ($base * count($ids));
  $out = [];
  foreach ($ids as $index => $id) {
    $out[$id] = ($base + ($index < $resto ? 1 : 0)) / 100;
  }
  return $out;
}

/** Obtiene el desglose exacto por sistema guardado en los items de una factura. */
function pagos_desglose_desde_items_factura(mixed $itemsRaw): array
{
  if (is_string($itemsRaw)) {
    $decoded = json_decode($itemsRaw, true);
    $items = is_array($decoded) ? $decoded : [];
  } else {
    $items = is_array($itemsRaw) ? $itemsRaw : [];
  }

  $out = [];
  foreach ($items as $item) {
    if (!is_array($item)) continue;
    $modo = strtolower(trim((string)($item['modo'] ?? 'global')));
    $ars = round((float)($item['ars'] ?? 0), 2);
    if ($ars <= 0) continue;

    if ($modo === 'por_sistema') {
      $sid = (int)($item['sistema_id'] ?? $item['id_sistema'] ?? 0);
      if ($sid > 0) $out[$sid] = round(($out[$sid] ?? 0.0) + $ars, 2);
      continue;
    }

    $ids = is_array($item['sistemas_ids'] ?? null) ? $item['sistemas_ids'] : [];
    foreach (pagos_distribuir_centavos_iguales($ids, $ars) as $sid => $amount) {
      $out[$sid] = round(($out[$sid] ?? 0.0) + $amount, 2);
    }
  }

  ksort($out);
  return $out;
}

/** Resuelve una URL/ruta de factura dentro de uploads sin permitir traversal. */
function pagos_factura_ruta_local_segura(string $pdfPath): ?string
{
  $pdfPath = trim($pdfPath);
  if ($pdfPath === '') return null;

  $pathPart = parse_url($pdfPath, PHP_URL_PATH);
  $normalized = rawurldecode(is_string($pathPart) && $pathPart !== '' ? $pathPart : $pdfPath);
  $normalized = '/' . ltrim(str_replace('\\', '/', $normalized), '/');
  $marker = '/uploads/facturas/';
  $position = strpos($normalized, $marker);
  if ($position === false) return null;

  $relative = ltrim(substr($normalized, $position + strlen($marker)), '/');
  if ($relative === '') return null;
  $parts = explode('/', $relative);
  foreach ($parts as $part) {
    if ($part === '' || $part === '.' || $part === '..' || !preg_match('/^[a-zA-Z0-9_.-]+$/', $part)) {
      return null;
    }
  }
  if (!preg_match('/\.pdf$/i', end($parts) ?: '')) return null;

  return __DIR__ . '/../../uploads/facturas/' . implode('/', $parts);
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
  $org = pagos_org_id();
  try {
    $st = $pdo->prepare("SELECT id, nombre, descripcion, monto, activo FROM planes_mantenimiento WHERE id_organizacion=:org AND activo=1 ORDER BY monto, id");
    $st->execute([':org'=>$org]);
    $rows = array_map(static fn($r) => [
      'id'=>(int)$r['id'], 'nombre'=>(string)$r['nombre'],
      'descripcion'=>(string)($r['descripcion'] ?? ''),
      'monto'=>(float)$r['monto'], 'activo'=>(int)$r['activo'],
    ], $st->fetchAll(PDO::FETCH_ASSOC));
    json_ok(['exito'=>true,'planes'=>$rows]);
  } catch (Throwable $e) {
    json_error('Error DB al obtener planes de mantenimiento', ['error'=>$e->getMessage()]);
  }
}

/* =========================================================
   DATOS FACTURACIÓN POR id_pago
========================================================= */
function pagos_cliente_facturacion(): void
{
  global $pdo;
  require_method('POST');
  $org = pagos_org_id();
  $in = read_json_body();
  $idPago = isset($in['id_pago']) && is_numeric($in['id_pago']) ? (int)$in['id_pago'] : 0;
  if ($idPago <= 0) json_error('Falta id_pago válido');

  try {
    $st = $pdo->prepare("
      SELECT cf.id_cliente, cf.doc_tipo, cf.doc_nro, cf.razon_social, cf.domicilio,
             cf.id_condicion_iva, COALESCE(ic.descripcion,'') AS cond_iva, cf.cond_venta
      FROM pagos p
      INNER JOIN clientes_sistemas cs
        ON cs.id_organizacion=p.id_organizacion AND cs.id_sistema=p.id_sistema
      LEFT JOIN clientes_facturacion cf
        ON cf.id_organizacion=cs.id_organizacion AND cf.id_cliente=cs.id_cliente
      LEFT JOIN iva_condiciones ic ON ic.id_condicion_iva=cf.id_condicion_iva
      WHERE p.id_organizacion=:org AND p.id_pago=:id_pago
      LIMIT 1
    ");
    $st->execute([':org'=>$org, ':id_pago'=>$idPago]);
    $row=$st->fetch(PDO::FETCH_ASSOC);
    if (!$row || empty($row['id_cliente'])) json_ok(['exito'=>true,'cliente_facturacion'=>null,'mensaje'=>'Cliente sin datos de facturación cargados.']);

    $cond=trim((string)($row['cond_iva'] ?? '')) ?: 'IVA Sujeto Exento';
    json_ok(['exito'=>true,'cliente_facturacion'=>[
      'id_cliente'=>(int)$row['id_cliente'],
      'doc_tipo'=>(int)($row['doc_tipo'] ?? 80),
      'doc_nro'=>preg_replace('/\D+/','',(string)($row['doc_nro'] ?? '')),
      'razon_social'=>(string)($row['razon_social'] ?? ''),
      'domicilio'=>(string)($row['domicilio'] ?? ''),
      'id_condicion_iva'=>isset($row['id_condicion_iva'])?(int)$row['id_condicion_iva']:null,
      'cond_iva'=>$cond,
      'cond_venta'=>(string)($row['cond_venta'] ?? 'Contado / Transferencia Bancaria'),
    ]]);
  } catch (Throwable $e) { json_error('Error DB al obtener datos de facturación',['error'=>$e->getMessage()]); }
}

/* =========================================================
   DATOS FACTURACIÓN POR id_sistema
========================================================= */
function pagos_cliente_facturacion_sistema(): void
{
  global $pdo;
  require_method('POST');
  $org=pagos_org_id();
  $in=read_json_body();
  $idSistema=isset($in['id_sistema'])&&is_numeric($in['id_sistema'])?(int)$in['id_sistema']:0;
  if ($idSistema<=0) json_error('Falta id_sistema válido');
  try {
    $st=$pdo->prepare("
      SELECT cf.id_cliente, cf.doc_tipo, cf.doc_nro, cf.razon_social, cf.domicilio,
             cf.id_condicion_iva, COALESCE(ic.descripcion,'') AS cond_iva, cf.cond_venta
      FROM clientes_sistemas cs
      LEFT JOIN clientes_facturacion cf
        ON cf.id_organizacion=cs.id_organizacion AND cf.id_cliente=cs.id_cliente
      LEFT JOIN iva_condiciones ic ON ic.id_condicion_iva=cf.id_condicion_iva
      WHERE cs.id_organizacion=:org AND cs.id_sistema=:id_sistema
      LIMIT 1
    ");
    $st->execute([':org'=>$org,':id_sistema'=>$idSistema]);
    $row=$st->fetch(PDO::FETCH_ASSOC);
    if (!$row || empty($row['id_cliente'])) json_ok(['exito'=>true,'cliente_facturacion'=>null,'mensaje'=>'Cliente sin datos de facturación cargados.']);
    $cond=trim((string)($row['cond_iva'] ?? '')) ?: 'IVA Sujeto Exento';
    json_ok(['exito'=>true,'cliente_facturacion'=>[
      'id_cliente'=>(int)$row['id_cliente'], 'doc_tipo'=>(int)($row['doc_tipo'] ?? 80),
      'doc_nro'=>preg_replace('/\D+/','',(string)($row['doc_nro'] ?? '')),
      'razon_social'=>(string)($row['razon_social'] ?? ''), 'domicilio'=>(string)($row['domicilio'] ?? ''),
      'id_condicion_iva'=>isset($row['id_condicion_iva'])?(int)$row['id_condicion_iva']:null,
      'cond_iva'=>$cond, 'cond_venta'=>(string)($row['cond_venta'] ?? 'Contado / Transferencia Bancaria'),
    ]]);
  } catch (Throwable $e) { json_error('Error DB al obtener datos de facturación',['error'=>$e->getMessage()]); }
}

/* =========================================================
   LISTAR AÑOS
========================================================= */
function pagos_listar_anios(): void
{
  global $pdo;
  $org=pagos_org_id();
  try {
    $st=$pdo->prepare('SELECT DISTINCT anio_periodo AS anio FROM pagos WHERE id_organizacion=:org ORDER BY anio_periodo DESC');
    $st->execute([':org'=>$org]);
    json_ok(['exito'=>true,'anios'=>array_map('intval',$st->fetchAll(PDO::FETCH_COLUMN))]);
  } catch (Throwable $e) { json_error('Error DB al listar años',['error'=>$e->getMessage()]); }
}

/* =========================================================
   LISTAR PAGADOS POR MES/AÑO (1 fila por CLIENTE)
   ✅ ya NO lee pagos.comprobante
   ✅ devuelve factura_id y factura_pdf (si existe)
========================================================= */
function pagos_listar_pagados(): void
{
  global $pdo;
  $org = pagos_org_id();
  $anio = get_int('anio', 2000, 2100);
  $idMes = resolver_id_mes($pdo, get_str('mes'));
  $periodStart = DateTime::createFromFormat('Y-n-j', "$anio-$idMes-1");
  if (!$periodStart) json_error('Período inválido.');
  $periodEnd = (clone $periodStart)->modify('last day of this month')->format('Y-m-d');

  try {
    $st = $pdo->prepare("\n      SELECT\n        c.id_cliente, c.nombre AS cliente,\n        MIN(cs.id_sistema) AS id_sistema,\n        MAX(p.id_pago) AS id_pago,\n        SUM(p.monto) AS monto,\n        MAX(p.fecha_pago) AS fecha_pago,\n        CASE WHEN COUNT(DISTINCT mp.nombre) = 1 THEN MAX(mp.nombre) ELSE 'VARIOS' END AS medio_pago,\n        MAX(p.id_factura) AS id_factura,\n        COUNT(DISTINCT cs.id_sistema) AS sistemas_pagados\n      FROM clientes c\n      INNER JOIN clientes_sistemas cs\n        ON cs.id_organizacion = c.id_organizacion\n       AND cs.id_cliente = c.id_cliente\n       AND cs.estado = 'activo'\n      INNER JOIN pagos p\n        ON p.id_organizacion = cs.id_organizacion\n       AND p.id_sistema = cs.id_sistema\n       AND p.anio_periodo = :anio\n       AND p.id_mes = :mes\n      INNER JOIN medios_pago mp\n        ON mp.id_organizacion = p.id_organizacion\n       AND mp.id_medio_pago = p.id_medio_pago\n      WHERE c.id_organizacion = :org\n        AND c.activo = 1\n        AND COALESCE(cs.fecha_inicio, DATE(cs.created_at)) <= :period_end\n      GROUP BY c.id_cliente, c.nombre\n      HAVING COUNT(DISTINCT cs.id_sistema) = (\n        SELECT COUNT(*)\n        FROM clientes_sistemas all_cs\n        WHERE all_cs.id_organizacion = :org_count\n          AND all_cs.id_cliente = c.id_cliente\n          AND all_cs.estado = 'activo'\n          AND COALESCE(all_cs.fecha_inicio, DATE(all_cs.created_at)) <= :period_end_count\n      )\n      ORDER BY c.nombre\n    ");
    $st->execute([
      ':anio' => $anio,
      ':mes' => $idMes,
      ':org' => $org,
      ':period_end' => $periodEnd,
      ':org_count' => $org,
      ':period_end_count' => $periodEnd,
    ]);

    $factura = $pdo->prepare("\n      SELECT f.id_factura, f.pdf_path\n      FROM facturas f\n      INNER JOIN clientes_sistemas cs\n        ON cs.id_organizacion = f.id_organizacion\n       AND cs.id_sistema = f.id_sistema\n      WHERE f.id_organizacion = :org\n        AND cs.id_cliente = :cliente\n        AND f.anio = :anio\n        AND f.id_mes = :mes\n      ORDER BY f.created_at DESC, f.id_factura DESC\n      LIMIT 1\n    ");

    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
      $factura->execute([':org' => $org, ':cliente' => (int)$row['id_cliente'], ':anio' => $anio, ':mes' => $idMes]);
      $fx = $factura->fetch(PDO::FETCH_ASSOC) ?: null;
      $out[] = [
        'id_pago' => (int)$row['id_pago'],
        'id_sistema' => (int)$row['id_sistema'],
        'id_cliente' => (int)$row['id_cliente'],
        'cliente' => (string)$row['cliente'],
        'concepto' => (int)$row['sistemas_pagados'] . ' sistema(s)',
        'medio_pago' => (string)$row['medio_pago'],
        'monto' => (float)$row['monto'],
        'fecha_pago' => (string)$row['fecha_pago'],
        'mes' => get_str('mes'),
        'anio' => $anio,
        'id_factura' => $fx ? (int)$fx['id_factura'] : null,
        'comprobante' => $fx && trim((string)$fx['pdf_path']) !== '' ? (string)$fx['pdf_path'] : null,
      ];
    }
    json_ok($out);
  } catch (Throwable $e) {
    json_error('Error DB al listar pagados', ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   LISTAR DEUDORES POR MES/AÑO
========================================================= */
function pagos_listar_deudores(): void
{
  global $pdo;
  $org = pagos_org_id();
  $anio = get_int('anio', 2000, 2100);
  $mesParam = get_str('mes');
  $idMes = resolver_id_mes($pdo, $mesParam);
  $periodStart = DateTime::createFromFormat('Y-n-j', "$anio-$idMes-1");
  if (!$periodStart) json_error('Período inválido.');
  $periodEnd = (clone $periodStart)->modify('last day of this month')->format('Y-m-d');

  try {
    $st = $pdo->prepare("\n      SELECT\n        c.id_cliente, c.nombre AS cliente,\n        MIN(cs.id_sistema) AS id_sistema_principal,\n        COUNT(*) AS sistemas_pendientes\n      FROM clientes c\n      INNER JOIN clientes_sistemas cs\n        ON cs.id_organizacion = c.id_organizacion\n       AND cs.id_cliente = c.id_cliente\n       AND cs.estado = 'activo'\n      WHERE c.id_organizacion = :org\n        AND c.activo = 1\n        AND COALESCE(cs.fecha_inicio, DATE(cs.created_at)) <= :period_end\n        AND NOT EXISTS (\n          SELECT 1\n          FROM pagos p\n          WHERE p.id_organizacion = cs.id_organizacion\n            AND p.id_sistema = cs.id_sistema\n            AND p.anio_periodo = :anio\n            AND p.id_mes = :mes\n        )\n      GROUP BY c.id_cliente, c.nombre\n      ORDER BY c.nombre\n    ");
    $st->execute([
      ':org' => $org,
      ':period_end' => $periodEnd,
      ':anio' => $anio,
      ':mes' => $idMes,
    ]);

    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
      $out[] = [
        'id_sistema' => (int)$row['id_sistema_principal'],
        'id_cliente' => (int)$row['id_cliente'],
        'cliente' => (string)$row['cliente'],
        'concepto' => (int)$row['sistemas_pendientes'] . ' sistema(s) pendiente(s)',
        'medio_pago' => '—',
        'monto' => null,
        'fecha_pago' => null,
        'mes' => $mesParam,
        'anio' => $anio,
        'id_factura' => null,
        'comprobante' => null,
      ];
    }
    json_ok($out);
  } catch (Throwable $e) {
    json_error('Error DB al listar deudores', ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   DETALLE SISTEMA
========================================================= */
function pagos_detalle_sistema(): void
{
  global $pdo;
  $org=pagos_org_id();
  $idSistema=isset($_GET['id_sistema'])&&is_numeric($_GET['id_sistema'])?(int)$_GET['id_sistema']:0;
  if($idSistema<=0)json_error('Falta id_sistema');
  try{
    $st=$pdo->prepare("
      SELECT cs.id_sistema,cs.id_cliente,cs.nombre AS sistema_nombre,cs.descripcion AS sistema_descripcion,
             cs.estado AS sistema_estado,cs.fecha_inicio,cs.created_at AS sistema_created_at,
             COALESCE(NULLIF(cs.fecha_inicio,'0000-00-00'),DATE(cs.created_at)) AS inicio_real,
             c.nombre AS cliente_nombre,c.notas AS cliente_notas,c.activo AS cliente_activo
      FROM clientes_sistemas cs
      INNER JOIN clientes c ON c.id_organizacion=cs.id_organizacion AND c.id_cliente=cs.id_cliente
      WHERE cs.id_organizacion=:org AND cs.id_sistema=:id LIMIT 1
    ");
    $st->execute([':org'=>$org,':id'=>$idSistema]);$row=$st->fetch(PDO::FETCH_ASSOC);
    if(!$row)json_error('Sistema no encontrado en esta entidad.');
    $meses=$pdo->query('SELECT id_mes,mes FROM meses ORDER BY id_mes')->fetchAll(PDO::FETCH_ASSOC);
    $stP=$pdo->prepare('SELECT anio_periodo AS anio,id_mes FROM pagos WHERE id_organizacion=:org AND id_sistema=:id');
    $stP->execute([':org'=>$org,':id'=>$idSistema]);
    $pagos=[];foreach($stP->fetchAll(PDO::FETCH_ASSOC) as $x){$y=(int)$x['anio'];$m=(int)$x['id_mes'];$pagos[$y][]=$m;}
    foreach($pagos as &$arr){$arr=array_values(array_unique($arr));sort($arr);}unset($arr);
    $inicioStr=substr((string)($row['inicio_real']?:date('Y-m-d')),0,10);$inicio=new DateTime($inicioStr);$hoy=new DateTime(date('Y-m-d'));
    $oblig=build_obligaciones_por_anio($inicio,$hoy);$adeudos=[];
    foreach($oblig as $y=>$months){$adeudos[$y]=array_values(array_diff($months,$pagos[$y]??[]));sort($adeudos[$y]);}
    json_ok(['exito'=>true,'sistema'=>[
      'id_sistema'=>(int)$row['id_sistema'],'id_cliente'=>(int)$row['id_cliente'],'nombre'=>$row['sistema_nombre'],
      'descripcion'=>$row['sistema_descripcion'],'estado'=>$row['sistema_estado'],'fecha_inicio'=>$row['fecha_inicio'],
      'created_at'=>$row['sistema_created_at'],'inicio_real'=>$row['inicio_real']],
      'cliente'=>['id_cliente'=>(int)$row['id_cliente'],'nombre'=>$row['cliente_nombre'],'notas'=>$row['cliente_notas'],'activo'=>(int)$row['cliente_activo']],
      'mesesCatalogo'=>array_map(fn($m)=>['id_mes'=>(int)$m['id_mes'],'mes'=>$m['mes']],$meses),
      'pagosPorAnio'=>$pagos,'adeudosPorAnio'=>$adeudos,'inicio'=>$inicio->format('Y-m-d'),'hoy'=>$hoy->format('Y-m-d')]);
  }catch(Throwable $e){json_error('Error DB al obtener detalle del sistema',['error'=>$e->getMessage()]);}
}

/* =========================================================
   ✅ DETALLE POR PERÍODO (pago + factura)
========================================================= */
function pagos_detalle_periodo(): void
{
  global $pdo;
  $org=pagos_org_id();
  $idSistema=(int)($_GET['id_sistema']??0);$anio=(int)($_GET['anio']??0);$idMes=(int)($_GET['id_mes']??0);
  if($idSistema<=0||$anio<2000||$anio>2100||$idMes<1||$idMes>12)json_error('Parámetros de período inválidos.');
  try{
    $st=$pdo->prepare("
      SELECT cs.id_sistema,cs.id_cliente,cs.nombre AS sistema_nombre,cs.descripcion AS sistema_descripcion,
             cs.estado AS sistema_estado,cs.monto_mensual,cs.id_plan,c.nombre AS cliente_nombre
      FROM clientes_sistemas cs
      INNER JOIN clientes c ON c.id_organizacion=cs.id_organizacion AND c.id_cliente=cs.id_cliente
      WHERE cs.id_organizacion=:org AND cs.id_sistema=:id LIMIT 1
    ");
    $st->execute([':org'=>$org,':id'=>$idSistema]);$det=$st->fetch(PDO::FETCH_ASSOC);if(!$det)json_error('Sistema no encontrado en esta entidad.');
    $stP=$pdo->prepare('SELECT id_pago,id_sistema,id_mes,id_medio_pago,monto,fecha_pago,id_factura FROM pagos WHERE id_organizacion=:org AND id_sistema=:id AND id_mes=:mes AND anio_periodo=:anio ORDER BY id_pago DESC LIMIT 1');
    $stP->execute([':org'=>$org,':id'=>$idSistema,':mes'=>$idMes,':anio'=>$anio]);$pago=$stP->fetch(PDO::FETCH_ASSOC)?:null;
    $factura=null;
    if($pago&&!empty($pago['id_factura'])){
      $fx=$pdo->prepare('SELECT * FROM facturas WHERE id_organizacion=:org AND id_factura=:id LIMIT 1');$fx->execute([':org'=>$org,':id'=>(int)$pago['id_factura']]);$factura=$fx->fetch(PDO::FETCH_ASSOC)?:null;
    }
    if(!$factura){$fx=$pdo->prepare('SELECT * FROM facturas WHERE id_organizacion=:org AND id_sistema=:id AND anio=:anio AND id_mes=:mes ORDER BY created_at DESC,id_factura DESC LIMIT 1');$fx->execute([':org'=>$org,':id'=>$idSistema,':anio'=>$anio,':mes'=>$idMes]);$factura=$fx->fetch(PDO::FETCH_ASSOC)?:null;}
    if(!$factura){$fx=$pdo->prepare("
      SELECT f.* FROM facturas f
      INNER JOIN clientes_sistemas cs ON cs.id_organizacion=f.id_organizacion AND cs.id_sistema=f.id_sistema
      WHERE f.id_organizacion=:org AND cs.id_cliente=:cliente AND f.anio=:anio AND f.id_mes=:mes
      ORDER BY f.created_at DESC,f.id_factura DESC LIMIT 1");$fx->execute([':org'=>$org,':cliente'=>(int)$det['id_cliente'],':anio'=>$anio,':mes'=>$idMes]);$factura=$fx->fetch(PDO::FETCH_ASSOC)?:null;}
    if($pago){$pago=['id_pago'=>(int)$pago['id_pago'],'id_sistema'=>(int)$pago['id_sistema'],'id_mes'=>(int)$pago['id_mes'],'id_medio_pago'=>(int)$pago['id_medio_pago'],'monto'=>(float)$pago['monto'],'fecha_pago'=>$pago['fecha_pago'],'id_factura'=>isset($pago['id_factura'])?(int)$pago['id_factura']:null];}
    if($factura){
      $items=json_decode((string)($factura['items_facturacion_json']??''),true);if(!is_array($items))$items=null;
      $factura=['id_factura'=>(int)$factura['id_factura'],'id_sistema'=>isset($factura['id_sistema'])?(int)$factura['id_sistema']:null,
        'anio'=>(int)$factura['anio'],'id_mes'=>(int)$factura['id_mes'],'estado'=>$factura['estado'],'monto_ars'=>(float)$factura['monto_ars'],
        'doc_tipo'=>isset($factura['doc_tipo'])?(int)$factura['doc_tipo']:null,'doc_nro'=>$factura['doc_nro'],'cbte_tipo'=>isset($factura['cbte_tipo'])?(int)$factura['cbte_tipo']:null,
        'pto_vta'=>isset($factura['pto_vta'])?(int)$factura['pto_vta']:null,'cae'=>$factura['cae'],'cae_vto'=>$factura['cae_vto'],'cbte_nro'=>$factura['cbte_nro'],
        'fecha_cbte'=>$factura['fecha_cbte'],'pdf_path'=>$factura['pdf_path'],'items_facturacion_json'=>$items,'usd_rate'=>isset($factura['usd_rate'])?(float)$factura['usd_rate']:null,
        'total_usd'=>isset($factura['total_usd'])?(float)$factura['total_usd']:null,'total_ars'=>isset($factura['total_ars'])?(float)$factura['total_ars']:null,
        'periodo_desde'=>$factura['periodo_desde'],'periodo_hasta'=>$factura['periodo_hasta'],'vto_pago'=>$factura['vto_pago'],'created_at'=>$factura['created_at']];
    }
    json_ok(['exito'=>true,'detalle'=>['cliente_nombre'=>$det['cliente_nombre'],'sistema_nombre'=>$det['sistema_nombre'],'sistema_descripcion'=>$det['sistema_descripcion'],'sistema_estado'=>$det['sistema_estado'],'monto_mensual'=>(float)($det['monto_mensual']??0),'id_plan'=>isset($det['id_plan'])?(int)$det['id_plan']:null], 'pago'=>$pago,'factura'=>$factura,'anio'=>$anio,'id_mes'=>$idMes]);
  }catch(Throwable $e){json_error('Error DB al obtener detalle del período',['error'=>$e->getMessage()]);}
}

/* =========================================================
   ✅ REGISTRAR PAGO
   - ahora NO guarda URL en pagos (no existe comprobante)
   - guarda solo id_factura (si se resolvió)
========================================================= */
function pagos_registrar_pago(): void
{
  global $pdo;
  pagos_require_write();
  require_method('POST');

  $org = pagos_org_id();
  $body = read_json_body();
  $idSistema = (int)($body['id_sistema'] ?? 0);
  $anio = (int)($body['anio'] ?? 0);
  $idMedio = (int)($body['id_medio_pago'] ?? 0);
  $monto = round((float)($body['monto'] ?? 0), 2);
  $meses = $body['meses'] ?? [];
  $fecha = trim((string)($body['fecha_pago'] ?? ''));
  $idFacturaIn = (int)($body['id_factura'] ?? 0);
  $desglose = is_array($body['sistemas_con_monto'] ?? null) ? $body['sistemas_con_monto'] : [];

  if ($idFacturaIn <= 0) {
    json_error('Primero generá y guardá la factura del período antes de registrar el pago.');
  }

  if ($idSistema <= 0 || $anio < 2000 || $anio > 2100 || $idMedio <= 0 || $monto <= 0
      || !is_array($meses) || !count($meses) || $fecha === '') {
    json_error('Datos del pago incompletos.');
  }
  $dt = DateTime::createFromFormat('Y-m-d', $fecha);
  if (!$dt || $dt->format('Y-m-d') !== $fecha) json_error('fecha_pago inválida.');

  $anchor = $pdo->prepare('SELECT id_cliente FROM clientes_sistemas WHERE id_organizacion=:org AND id_sistema=:id LIMIT 1');
  $anchor->execute([':org' => $org, ':id' => $idSistema]);
  $idCliente = (int)($anchor->fetchColumn() ?: 0);
  if ($idCliente <= 0) json_error('Sistema inexistente en esta entidad.');

  $mp = $pdo->prepare('SELECT 1 FROM medios_pago WHERE id_organizacion=:org AND id_medio_pago=:id AND activo=1');
  $mp->execute([':org' => $org, ':id' => $idMedio]);
  if (!$mp->fetchColumn()) json_error('Medio de pago inválido para esta entidad.');

  $months = [];
  foreach ($meses as $mes) {
    $mes = (int)$mes;
    if ($mes >= 1 && $mes <= 12) $months[] = $mes;
  }
  $months = array_values(array_unique($months));
  sort($months);
  if (!$months) json_error('Meses inválidos.');

  // Un período cuya liquidación ya comenzó es inmutable. La validación se
  // realiza antes de abrir la transacción y vuelve a estar respaldada por los
  // triggers de la migración para evitar carreras o modificaciones directas.
  try {
    foreach ($months as $month) {
      reportes_periodo_assert_abierto($pdo, $org, $month, $anio);
    }
  } catch (Throwable $e) {
    json_error($e->getMessage());
  }

  $systems = [];
  foreach ($desglose as $item) {
    $sid = (int)($item['id_sistema'] ?? 0);
    $amount = round((float)($item['monto'] ?? 0), 2);
    if ($sid > 0 && $amount > 0) {
      $systems[$sid] = round(($systems[$sid] ?? 0.0) + $amount, 2);
    }
  }

  // Cuando existe factura, sus items son la fuente de verdad del desglose.
  $facturaInput = null;
  if ($idFacturaIn > 0) {
    if (count($months) !== 1) json_error('Una factura solo puede aplicarse a un período puntual.');
    $stFactura = $pdo->prepare("\n      SELECT f.id_factura, f.id_sistema, f.anio, f.id_mes, f.monto_ars, f.total_ars,\n             f.items_facturacion_json, f.pdf_path, cs.id_cliente\n      FROM facturas f\n      INNER JOIN clientes_sistemas cs\n        ON cs.id_organizacion = f.id_organizacion\n       AND cs.id_sistema = f.id_sistema\n      WHERE f.id_organizacion = :org\n        AND f.id_factura = :factura\n        AND f.anio = :anio\n        AND f.id_mes = :mes\n      LIMIT 1\n    ");
    $stFactura->execute([
      ':org' => $org,
      ':factura' => $idFacturaIn,
      ':anio' => $anio,
      ':mes' => $months[0],
    ]);
    $facturaInput = $stFactura->fetch(PDO::FETCH_ASSOC) ?: null;
    if (!$facturaInput) json_error('La factura indicada no existe para el período seleccionado.');
    if ((int)$facturaInput['id_cliente'] !== $idCliente) {
      json_error('La factura pertenece a otro cliente.');
    }

    $totalFactura = round((float)($facturaInput['total_ars'] ?: $facturaInput['monto_ars']), 2);
    if ($totalFactura <= 0 || abs($totalFactura - $monto) > 0.05) {
      json_error('El monto del pago no coincide con el total de la factura.');
    }

    $fromInvoice = pagos_desglose_desde_items_factura($facturaInput['items_facturacion_json'] ?? null);
    if ($fromInvoice) {
      if (abs(array_sum($fromInvoice) - $totalFactura) > 0.05) {
        json_error('El detalle interno de la factura no coincide con su total. Volvé a generar la factura.');
      }
      $systems = $fromInvoice;
    }
  }

  if (!$systems) $systems = [$idSistema => $monto];
  if (abs(array_sum($systems) - $monto) > 0.05) {
    json_error('La suma del desglose no coincide con el monto total.');
  }

  $ids = array_keys($systems);
  $ph = implode(',', array_fill(0, count($ids), '?'));
  $stSystems = $pdo->prepare("SELECT id_sistema FROM clientes_sistemas WHERE id_organizacion=? AND id_cliente=? AND estado='activo' AND id_sistema IN ($ph)");
  $stSystems->execute(array_merge([$org, $idCliente], $ids));
  $valid = array_map('intval', $stSystems->fetchAll(PDO::FETCH_COLUMN) ?: []);
  sort($valid);
  $expected = array_map('intval', $ids);
  sort($expected);
  if ($valid !== $expected) json_error('El desglose contiene sistemas ajenos, inactivos o de otro cliente.');

  if ($facturaInput) {
    $pdfFactura = trim((string)($facturaInput['pdf_path'] ?? ''));
    if ($pdfFactura === '') json_error('La factura no tiene un PDF válido asociado.');

    $phFacturas = implode(',', array_fill(0, count($expected), '?'));
    $stReplicas = $pdo->prepare("
      SELECT id_sistema
      FROM facturas
      WHERE id_organizacion = ?
        AND anio = ?
        AND id_mes = ?
        AND pdf_path = ?
        AND id_sistema IN ($phFacturas)
    ");
    $stReplicas->execute(array_merge([$org, $anio, $months[0], $pdfFactura], $expected));
    $replicasValidas = array_map('intval', $stReplicas->fetchAll(PDO::FETCH_COLUMN) ?: []);
    sort($replicasValidas);
    if ($replicasValidas !== $expected) {
      json_error('La factura está incompleta para uno o más sistemas. Volvé a generarla antes de registrar el pago.');
    }
  }

  try {
    $pdo->beginTransaction();

    $check = $pdo->prepare('SELECT id_pago, monto, id_factura FROM pagos WHERE id_organizacion=:org AND id_sistema=:sid AND id_mes=:mes AND anio_periodo=:anio LIMIT 1 FOR UPDATE');
    $fxSys = $pdo->prepare('SELECT id_factura,pdf_path FROM facturas WHERE id_organizacion=:org AND id_sistema=:sid AND anio=:anio AND id_mes=:mes AND pdf_path=:pdf_path ORDER BY id_factura DESC LIMIT 1');
    $ins = $pdo->prepare('INSERT INTO pagos(id_organizacion,id_sistema,id_mes,anio_periodo,id_medio_pago,monto,fecha_pago,id_factura) VALUES(:org,:sid,:mes,:anio,:medio,:monto,:fecha,:factura)');

    $insertados = [];
    $omitidos = [];
    $detalle = [];

    foreach ($months as $mes) {
      $did = false;
      $detail = [];

      foreach ($systems as $sid => $amount) {
        $check->execute([':org' => $org, ':sid' => $sid, ':mes' => $mes, ':anio' => $anio]);
        $existing = $check->fetch(PDO::FETCH_ASSOC) ?: null;
        $existingId = $existing ? (int)$existing['id_pago'] : 0;
        if ($existingId > 0) {
          if (abs(round((float)$existing['monto'], 2) - round((float)$amount, 2)) > 0.01) {
            throw new DomainException(
              'Ya existe un pago para uno de los sistemas, pero su monto no coincide con la factura actual.'
            );
          }
          // También se valida y congela un pago preexistente. Así nunca se
          // acepta silenciosamente un registro antiguo con reparto inválido.
          reparto_resumen_pago($pdo, $org, $existingId, true);
          $detail[$sid] = ['omitido' => true, 'id_pago' => $existingId];
          continue;
        }

        // Cada sistema se vincula preferentemente con su propia réplica de factura.
        $fxSys->execute([
          ':org' => $org,
          ':sid' => $sid,
          ':anio' => $anio,
          ':mes' => $mes,
          ':pdf_path' => (string)$facturaInput['pdf_path'],
        ]);
        $fx = $fxSys->fetch(PDO::FETCH_ASSOC) ?: null;
        if (!$fx) {
          throw new RuntimeException('Falta la réplica de factura para uno de los sistemas. Volvé a generarla.');
        }
        $fid = (int)$fx['id_factura'];

        $ins->execute([
          ':org' => $org,
          ':sid' => $sid,
          ':mes' => $mes,
          ':anio' => $anio,
          ':medio' => $idMedio,
          ':monto' => $amount,
          ':fecha' => $fecha,
          ':factura' => $fid,
        ]);
        $idPagoNuevo = (int)$pdo->lastInsertId();

        // El reparto exacto queda congelado en la misma transacción que crea
        // el pago. Una configuración incompleta o distinta de 100% revierte
        // todo el alta: jamás llega un ingreso ambiguo a Reportes.
        reparto_resumen_pago($pdo, $org, $idPagoNuevo, true);

        $did = true;
        $detail[$sid] = [
          'id_pago' => $idPagoNuevo,
          'id_factura' => $fid,
          'pdf_path' => $fx['pdf_path'] ?? null,
        ];
      }

      if ($did) $insertados[] = $mes;
      else $omitidos[] = $mes;
      $detalle[$mes] = $detail;
    }

    $pdo->commit();
    json_ok([
      'exito' => true,
      'modo' => count($systems) > 1 ? 'multi_sistema' : 'single',
      'id_sistema' => $idSistema,
      'anio' => $anio,
      'fecha_pago' => $fecha,
      'insertados' => $insertados,
      'omitidos' => $omitidos,
      'factura_por_mes' => $detalle,
      'pagos_insertados_total' => array_sum(array_map(
        static fn(array $rows): int => count(array_filter($rows, static fn(array $row): bool => empty($row['omitido']))),
        $detalle
      )),
    ]);
  } catch (DomainException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_error($e->getMessage());
  } catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $mysqlCode = (int)($e->errorInfo[1] ?? 0);
    if ($mysqlCode === 1062) {
      json_error('El pago ya fue registrado para uno de los sistemas y el período seleccionado.');
    }
    json_error('Error DB al registrar pagos', ['error' => $e->getMessage()]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_error('Error DB al registrar pagos', ['error' => $e->getMessage()]);
  }
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
  pagos_require_write();
  require_method('POST');
  $org = pagos_org_id();
  $idPago = (int)(read_json_body()['id_pago'] ?? 0);
  if ($idPago <= 0) json_error('Falta id_pago válido.');

  try {
    $st = $pdo->prepare("\n      SELECT p.id_mes, p.anio_periodo, cs.id_cliente\n      FROM pagos p\n      INNER JOIN clientes_sistemas cs\n        ON cs.id_organizacion = p.id_organizacion\n       AND cs.id_sistema = p.id_sistema\n      WHERE p.id_organizacion = :org AND p.id_pago = :pago\n      LIMIT 1\n    ");
    $st->execute([':org' => $org, ':pago' => $idPago]);
    $info = $st->fetch(PDO::FETCH_ASSOC);
    if (!$info) json_error('No se encontró el pago en esta entidad.');

    reportes_periodo_assert_abierto(
      $pdo,
      $org,
      (int)$info['id_mes'],
      (int)$info['anio_periodo']
    );

    $pdo->beginTransaction();
    $del = $pdo->prepare("\n      DELETE p\n      FROM pagos p\n      INNER JOIN clientes_sistemas cs\n        ON cs.id_organizacion = p.id_organizacion\n       AND cs.id_sistema = p.id_sistema\n      WHERE p.id_organizacion = :org\n        AND cs.id_cliente = :cliente\n        AND p.anio_periodo = :anio\n        AND p.id_mes = :mes\n    ");
    $del->execute([
      ':org' => $org,
      ':cliente' => (int)$info['id_cliente'],
      ':anio' => (int)$info['anio_periodo'],
      ':mes' => (int)$info['id_mes'],
    ]);
    $deleted = $del->rowCount();
    if ($deleted <= 0) {
      $pdo->rollBack();
      json_error('No se eliminó ningún pago.');
    }
    $pdo->commit();
    json_ok([
      'exito' => true,
      'id_pago' => $idPago,
      'eliminados' => $deleted,
      'modo' => 'cliente_periodo_entidad',
      'id_cliente' => (int)$info['id_cliente'],
      'anio' => (int)$info['anio_periodo'],
      'id_mes' => (int)$info['id_mes'],
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_error('Error DB al eliminar pago', ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   ANULAR FACTURA LOCAL
   - Las facturas solo_pdf se pueden quitar localmente.
   - Una factura emitida con CAE requiere Nota de Crédito ARCA y no se borra.
========================================================= */
function pagos_factura_anular_con_nc(): void
{
  global $pdo;
  pagos_require_write();
  require_method('POST');
  $org = pagos_org_id();
  $body = read_json_body();
  $idFactura = (int)($body['id_factura'] ?? 0);
  if ($idFactura <= 0) json_error('Falta id_factura válido.');

  try {
    $st = $pdo->prepare("
      SELECT f.*, cs.id_cliente, cs.nombre AS sistema_nombre, c.nombre AS cliente_nombre
      FROM facturas f
      LEFT JOIN clientes_sistemas cs
        ON cs.id_organizacion = f.id_organizacion
       AND cs.id_sistema = f.id_sistema
      LEFT JOIN clientes c
        ON c.id_organizacion = cs.id_organizacion
       AND c.id_cliente = cs.id_cliente
      WHERE f.id_organizacion = :org AND f.id_factura = :factura
      LIMIT 1
    ");
    $st->execute([':org' => $org, ':factura' => $idFactura]);
    $factura = $st->fetch(PDO::FETCH_ASSOC);
    if (!$factura) json_error('La factura no existe en la entidad activa.');

    $idCliente = (int)($factura['id_cliente'] ?? 0);
    $anioFactura = (int)($factura['anio'] ?? 0);
    $mesFactura = (int)($factura['id_mes'] ?? 0);
    $pdfPath = trim((string)($factura['pdf_path'] ?? ''));
    if ($idCliente <= 0 || $anioFactura <= 0 || $mesFactura <= 0 || $pdfPath === '') {
      json_error('La factura no tiene datos suficientes para una anulación segura.');
    }

    // Una factura generada para varios sistemas se guarda como varias filas que
    // comparten PDF. La anulación local debe quitar todas esas réplicas juntas.
    $stGroup = $pdo->prepare("
      SELECT f.id_factura, f.estado, f.cae
      FROM facturas f
      INNER JOIN clientes_sistemas cs
        ON cs.id_organizacion = f.id_organizacion
       AND cs.id_sistema = f.id_sistema
      WHERE f.id_organizacion = :org
        AND cs.id_cliente = :cliente
        AND f.anio = :anio
        AND f.id_mes = :mes
        AND f.pdf_path = :pdf_path
      ORDER BY f.id_factura
    ");
    $stGroup->execute([
      ':org' => $org,
      ':cliente' => $idCliente,
      ':anio' => $anioFactura,
      ':mes' => $mesFactura,
      ':pdf_path' => $pdfPath,
    ]);
    $replicas = $stGroup->fetchAll(PDO::FETCH_ASSOC) ?: [];
    if (!$replicas) json_error('No se pudieron resolver las réplicas de la factura.');

    foreach ($replicas as $replica) {
      $cae = trim((string)($replica['cae'] ?? ''));
      $caeReal = $cae !== '' && !preg_match('/^0+$/', $cae);
      $estado = strtolower(trim((string)($replica['estado'] ?? '')));
      if ($caeReal || $estado === 'emitida') {
        json_error('La factura fue emitida en ARCA. Para anularla se debe emitir la Nota de Crédito correspondiente; por seguridad no fue eliminada.');
      }
    }

    $idsFactura = array_values(array_map('intval', array_column($replicas, 'id_factura')));
    $placeholders = implode(',', array_fill(0, count($idsFactura), '?'));

    $pdo->beginTransaction();
    $unlink = $pdo->prepare("UPDATE pagos SET id_factura = NULL WHERE id_organizacion = ? AND id_factura IN ($placeholders)");
    $unlink->execute(array_merge([$org], $idsFactura));

    $del = $pdo->prepare("DELETE FROM facturas WHERE id_organizacion = ? AND id_factura IN ($placeholders)");
    $del->execute(array_merge([$org], $idsFactura));
    $deleted = $del->rowCount();
    if ($deleted !== count($idsFactura)) {
      $pdo->rollBack();
      json_error('No se pudieron eliminar todas las réplicas de la factura local.');
    }
    $pdo->commit();

    // El PDF se elimina solamente si ya no hay ninguna fila que lo use.
    $pdfEliminado = false;
    try {
      $stReferences = $pdo->prepare('SELECT COUNT(*) FROM facturas WHERE id_organizacion = :org AND pdf_path = :pdf_path');
      $stReferences->execute([':org' => $org, ':pdf_path' => $pdfPath]);
      $references = (int)$stReferences->fetchColumn();
      if ($references === 0) {
        $localPath = pagos_factura_ruta_local_segura($pdfPath);
        if ($localPath !== null && is_file($localPath)) $pdfEliminado = @unlink($localPath);
      }
    } catch (Throwable $cleanupError) {
      error_log('No se pudo limpiar el PDF anulado: ' . $cleanupError->getMessage());
    }

    json_ok([
      'exito' => true,
      'emitio_nota_credito' => false,
      'nota_credito_existente' => false,
      'facturas_eliminadas' => $deleted,
      'pdf_eliminado' => $pdfEliminado,
      'factura_original' => [
        'id_factura' => $idFactura,
        'cliente_nombre' => (string)($factura['cliente_nombre'] ?? ''),
        'sistema_nombre' => (string)($factura['sistema_nombre'] ?? ''),
      ],
      'mensaje' => $deleted > 1
        ? 'Factura local y todas sus réplicas eliminadas correctamente.'
        : 'Factura local eliminada correctamente.',
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_error('Error al anular la factura.', ['error' => $e->getMessage()]);
  }
}

/* =========================================================
   SISTEMAS DEL CLIENTE
========================================================= */
function pagos_cliente_sistemas(): void
{
  global $pdo;
  require_method('POST');$org=pagos_org_id();$in=read_json_body();$idSistema=(int)($in['id_sistema']??0);if($idSistema<=0)json_error('Falta id_sistema válido');
  try{
    $st=$pdo->prepare('SELECT id_cliente FROM clientes_sistemas WHERE id_organizacion=:org AND id_sistema=:id LIMIT 1');$st->execute([':org'=>$org,':id'=>$idSistema]);$cliente=(int)($st->fetchColumn()?:0);if($cliente<=0)json_ok(['exito'=>true,'sistemas'=>[]]);
    $st=$pdo->prepare('SELECT id_sistema,nombre,descripcion,estado FROM clientes_sistemas WHERE id_organizacion=:org AND id_cliente=:cliente ORDER BY nombre,id_sistema');$st->execute([':org'=>$org,':cliente'=>$cliente]);
    $out=[];foreach($st->fetchAll(PDO::FETCH_ASSOC) as $r){$state=strtolower((string)$r['estado']);$out[]=['id_sistema'=>(int)$r['id_sistema'],'nombre'=>(string)$r['nombre'],'descripcion'=>(string)($r['descripcion']??''),'activo'=>in_array($state,['activo','1','true'],true)?1:0];}
    json_ok(['exito'=>true,'sistemas'=>$out]);
  }catch(Throwable $e){json_error('Error DB al obtener sistemas del cliente',['error'=>$e->getMessage()]);}
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
      case 'distribucion_cliente':
        if (!function_exists('pagos_distribucion_cliente')) json_error("Endpoint distribucion_cliente no cargado");
        pagos_distribucion_cliente();
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
      case 'factura_anular_con_nc':
        pagos_factura_anular_con_nc();
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