<?php
// backend/modules/pagos/pagos.php
declare(strict_types=1);

/**
 * Requiere: $pdo (PDO) desde backend/config/db.php
 * Tablas usadas:
 * - pagos (id_pago, id_sistema, id_mes, id_medio_pago, monto, fecha_pago)
 * - meses (id_mes, mes)
 * - medios_pago (id_medio_pago, nombre, activo)
 * - clientes_sistemas (id_sistema, id_cliente, nombre, descripcion, estado, fecha_inicio)
 * - clientes (id_cliente, nombre)
 */

function json_ok($data): void {
  http_response_code(200);
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

function json_error(string $msg): void {
  http_response_code(200);
  echo json_encode(['exito' => false, 'mensaje' => $msg], JSON_UNESCAPED_UNICODE);
  exit;
}

function get_int(string $key, int $min = 0, int $max = 9999): int {
  $v = $_GET[$key] ?? null;
  if ($v === null || $v === '') json_error("Falta parámetro: $key");
  if (!is_numeric($v)) json_error("Parámetro inválido ($key)");
  $n = (int)$v;
  if ($n < $min || $n > $max) json_error("Parámetro fuera de rango ($key)");
  return $n;
}

function get_str(string $key): string {
  $v = $_GET[$key] ?? '';
  $v = trim((string)$v);
  if ($v === '') json_error("Falta parámetro: $key");
  return $v;
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

  // si es numérico => id_mes
  if (ctype_digit($mesParam)) return (int)$mesParam;

  // si es texto => buscar por nombre en tabla meses
  $stmt = $pdo->prepare("SELECT id_mes FROM meses WHERE UPPER(mes) = UPPER(?) LIMIT 1");
  $stmt->execute([$mesParam]);
  $id = $stmt->fetchColumn();

  if (!$id) json_error("Mes no encontrado en tabla meses: $mesParam");
  return (int)$id;
}

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

  json_ok(['anios' => $anios]);
}

function pagos_listar_pagados(): void
{
  global $pdo;

  $anio = get_int('anio', 2000, 2100);
  $mesParam = get_str('mes');
  $idMes = resolver_id_mes($pdo, $mesParam);

  // ✅ Pagos del mes/año (SIN plan / monto_desarrollo / monto_mensual)
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

  // ✅ Para tu UI: cliente / concepto / medio_pago
  $out = [];
  foreach ($rows as $r) {
    // concepto = nombre del sistema (y si querés, descripción)
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

      // opcional (por si querés mostrar estado en el futuro)
      'estado_sistema' => $r['sistema_estado'] ?? null,
    ];
  }

  json_ok($out);
}

function pagos_listar_deudores(): void
{
  global $pdo;

  $anio = get_int('anio', 2000, 2100);
  $mesParam = get_str('mes');
  $idMes = resolver_id_mes($pdo, $mesParam);

  // ✅ “Deudores” = sistemas que NO tienen pago para ese mes/año
  // SIN plan / montos
  $sql = "
    SELECT
      cs.id_sistema,
      cs.nombre AS sistema,
      cs.descripcion AS sistema_descripcion,
      cs.estado AS sistema_estado,
      c.nombre  AS cliente

    FROM clientes_sistemas cs
    INNER JOIN clientes c ON c.id_cliente = cs.id_cliente

    LEFT JOIN pagos p
      ON p.id_sistema = cs.id_sistema
     AND p.id_mes = :id_mes
     AND YEAR(p.fecha_pago) = :anio

    WHERE p.id_pago IS NULL
      AND cs.estado = 'activo'

    ORDER BY c.nombre ASC, cs.nombre ASC
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
