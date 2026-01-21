<?php
// backend/modules/clientes/clientes.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';

/* =========================
   HELPERS (compartidos)
========================= */
function json_out(array $arr): void {
  http_response_code(200);
  echo json_encode($arr, JSON_UNESCAPED_UNICODE);
  exit;
}

function read_json(): array {
  $raw = file_get_contents('php://input');
  $in = json_decode($raw ?: '[]', true);
  return is_array($in) ? $in : [];
}

/* =========================
   REPOS
========================= */
require_once __DIR__ . '/clientes.repo.php';
require_once __DIR__ . '/sistemas.repo.php';
require_once __DIR__ . '/trabajadores.repo.php';
require_once __DIR__ . '/sistema_trabajadores.repo.php';
require_once __DIR__ . '/planes_mantenimiento.repo.php';

/* =========================================================
   ✅ HANDLERS: FACTURACIÓN
========================================================= */

/**
 * ✅ GET
 * /api.php?action=clientes&op=facturacion_get&id_cliente=123
 */
function clientes_facturacion_get_op(): void
{
  global $pdo;

  try {
    if (!($pdo instanceof PDO)) {
      json_out(['exito' => false, 'mensaje' => 'Conexión PDO no disponible.']);
    }

    $id_cliente = isset($_GET['id_cliente']) && is_numeric($_GET['id_cliente'])
      ? (int)$_GET['id_cliente']
      : 0;

    if ($id_cliente <= 0) {
      json_out(['exito' => false, 'mensaje' => 'id_cliente inválido']);
    }

    $fact = clientes_facturacion_get($pdo, $id_cliente);

    json_out([
      'exito' => true,
      'facturacion' => $fact, // null si no hay
    ]);
  } catch (Throwable $e) {
    json_out([
      'exito' => false,
      'mensaje' => 'Error al obtener datos de facturación.',
      'error' => $e->getMessage(),
    ]);
  }
}

/**
 * ✅ POST
 * /api.php?action=clientes&op=facturacion_upsert
 */
function clientes_facturacion_upsert_op(): void
{
  global $pdo;

  try {
    if (!($pdo instanceof PDO)) {
      json_out(['exito' => false, 'mensaje' => 'Conexión PDO no disponible.']);
    }

    $in = read_json();

    $id_cliente = isset($in['id_cliente']) && is_numeric($in['id_cliente']) ? (int)$in['id_cliente'] : 0;
    $doc_tipo   = isset($in['doc_tipo']) && is_numeric($in['doc_tipo']) ? (int)$in['doc_tipo'] : 0;

    $doc_nro_raw   = (string)($in['doc_nro'] ?? '');
    $doc_nro_clean = preg_replace('/\D+/', '', $doc_nro_raw);

    $razon_social = trim((string)($in['razon_social'] ?? ''));
    $domicilio    = trim((string)($in['domicilio'] ?? ''));

    // ✅ NUEVO: condición iva por ID (ARCA)
    $id_condicion_iva = isset($in['id_condicion_iva']) && is_numeric($in['id_condicion_iva'])
      ? (int)$in['id_condicion_iva']
      : 4;

    $cond_venta = trim((string)($in['cond_venta'] ?? 'Contado / Transferencia Bancaria'));

    if ($id_cliente <= 0) json_out(['exito' => false, 'mensaje' => 'id_cliente inválido']);
    if (!in_array($doc_tipo, [80, 96], true)) json_out(['exito' => false, 'mensaje' => 'doc_tipo inválido (80/96)']);
    if ($doc_nro_clean === '') json_out(['exito' => false, 'mensaje' => 'doc_nro obligatorio (solo números)']);
    if ($razon_social === '') json_out(['exito' => false, 'mensaje' => 'razon_social obligatoria']);

    // ✅ Validar que el ID exista en iva_condiciones (activo=1)
    if (!iva_condicion_existe($pdo, $id_condicion_iva)) {
      json_out(['exito' => false, 'mensaje' => 'Condición IVA inválida']);
    }

    $payload = [
      'id_cliente'        => $id_cliente,
      'doc_tipo'          => $doc_tipo,
      'doc_nro'           => $doc_nro_clean, // string numérico
      'razon_social'      => $razon_social,
      'domicilio'         => $domicilio,
      'id_condicion_iva'  => $id_condicion_iva,
      'cond_venta'        => ($cond_venta !== '' ? $cond_venta : 'Contado / Transferencia Bancaria'),
    ];

    clientes_facturacion_upsert($pdo, $payload);

    json_out([
      'exito' => true,
      'mensaje' => 'Datos de facturación guardados',
    ]);
  } catch (Throwable $e) {
    json_out([
      'exito' => false,
      'mensaje' => 'Error al guardar datos de facturación.',
      'error' => $e->getMessage(),
    ]);
  }
}

/* =========================================================
   ✅ PLANES DE MANTENIMIENTO (tu handler)
========================================================= */

function planes_mantenimiento_listar(): void
{
  global $pdo;

  try {
    if (!($pdo instanceof PDO)) {
      json_out([
        'exito' => false,
        'mensaje' => 'Conexión PDO no disponible.'
      ]);
    }

    $data = repo_planes_mantenimiento_listar($pdo);

    json_out([
      'exito' => true,
      'data'  => $data
    ]);
  } catch (Throwable $e) {
    json_out([
      'exito' => false,
      'mensaje' => 'Error al listar planes de mantenimiento.',
      'error' => $e->getMessage()
    ]);
  }
}
