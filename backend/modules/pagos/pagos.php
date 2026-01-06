<?php
// backend/modules/pagos/pagos.php
declare(strict_types=1);

/**
 * Requiere: $pdo (PDO) desde backend/config/db.php
 * Tablas usadas:
 * - pagos (id_pago, id_sistema, id_mes, id_medio_pago, monto, fecha_pago, created_at)
 * - meses (id_mes, mes)
 * - medios_pago (id_medio_pago, nombre, activo)
 * - clientes_sistemas (id_sistema, id_cliente, nombre, descripcion, estado, fecha_inicio, created_at)
 * - clientes (id_cliente, nombre, notas, activo)
 * - sistemas_trabajadores (id_sistema, id_trabajador, rol_en_sistema, fecha_asignacion)
 * - trabajadores (id, nombre, apellido, email, rol, alias_pago, activo, fecha_alta)
 */

if (!function_exists('json_ok')) {
  function json_ok($data): void {
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('json_error')) {
  function json_error(string $msg, array $extra = []): void {
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}

function get_int(string $key, int $min = 0, int $max = 999999999): int {
  $v = $_GET[$key] ?? null;
  if ($v === null || $v === '') json_error("Falta parámetro: $key");
  if (!is_numeric($v)) json_error("Parámetro inválido ($key)");
  $n = (int)$v;
  if ($n < $min || $n > $max) json_error("Parámetro fuera de rango ($key)");
  return $n;
}

function get_str(string $key): string {
  $v = trim((string)($_GET[$key] ?? ''));
  if ($v === '') json_error("Falta parámetro: $key");
  return $v;
}

function require_method(string $method): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
    json_error("Método no permitido. Se esperaba $method");
  }
}

function read_json_body(): array {
  $raw = file_get_contents('php://input');
  $data = json_decode($raw ?: '{}', true);
  return is_array($data) ? $data : [];
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
   ✅ LISTAR DEUDORES POR MES/AÑO (FIX DEFINITIVO REAL)
   - Usa inicio_real robusto (soporta NULL / '0000-00-00' / '0000-00-00 00:00:00' / strings)
   - NO muestra sistemas que arrancan DESPUÉS del período consultado
   - Compara contra FIN de mes (último día)
   - cs.estado compatible: 'activo' o 1
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

      /* ✅ inicio_real robusto (igual que tu query que sí funcionó) */
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

      /* ✅ estado compatible */
      AND (cs.estado = 'activo' OR cs.estado = 1)

      /* ✅ clave: inicio_real debe ser <= fin del mes consultado */
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
      'id_sistema' => (int)$r['id_sistema'],
      'cliente'    => $r['cliente'] ?? '—',
      'concepto'   => $concepto,
      'medio_pago' => '—',
      'monto'      => null,
      'fecha_pago' => null,
      'mes'        => $mesParam,
      'anio'       => $anio,
      'estado_sistema' => $r['sistema_estado'] ?? null,

      /* ✅ dejalo 1 día para debug si querés */
      // 'inicio_real' => $r['inicio_real'] ?? null,
      // 'period_end' => $periodEndStr,
    ];
  }

  json_ok($out);
}

/* =========================================================
   ✅ DETALLE SISTEMA (FIX: inicio_real robusto)
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

      /* ✅ inicio_real robusto (igual al deudores) */
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

  // ✅ usar inicio_real SIEMPRE (evita que te aparezca "enero 2026" cuando arrancó en mayo)
  $inicioStr = $row['inicio_real'] ?? null;
  if (!$inicioStr) {
    // fallback extremo (no debería pasar)
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

  $insertados = [];
  $omitidos = [];

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

    $stIns = $pdo->prepare("
      INSERT INTO pagos (id_sistema, id_mes, id_medio_pago, monto, fecha_pago)
      VALUES (:id_sistema, :id_mes, :id_medio_pago, :monto, :fecha_pago)
    ");

    foreach ($mesesNorm as $mes) {
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

      $stIns->execute([
        ':id_sistema' => $id_sistema,
        ':id_mes' => $mes,
        ':id_medio_pago' => $id_medio_pago,
        ':monto' => $monto,
        ':fecha_pago' => $fecha_pago,
      ]);

      $insertados[] = $mes;
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

