<?php
// backend/modules/clientes/clientes.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../auth/session.php';
require_once __DIR__ . '/../reparto/reparto.service.php';

/* =========================
   HELPERS DEL MÓDULO
========================= */
function json_out(array $arr, int $status = 200): never
{
  http_response_code($status);
  echo json_encode($arr, JSON_UNESCAPED_UNICODE);
  exit;
}

function read_json(): array
{
  $raw = file_get_contents('php://input');
  $in = json_decode($raw ?: '[]', true);
  return is_array($in) ? $in : [];
}

function clientes_set_context(array $context): void
{
  $GLOBALS['CLIENTES_AUTH_CONTEXT'] = $context;
}

function clientes_context(): array
{
  $context = $GLOBALS['CLIENTES_AUTH_CONTEXT'] ?? null;
  if (!is_array($context) || empty($context['id_organizacion'])) {
    json_out(['exito' => false, 'mensaje' => 'Contexto de organización no disponible.'], 500);
  }
  return $context;
}

function clientes_org_id(): int
{
  return (int)clientes_context()['id_organizacion'];
}

function clientes_require_write(): void
{
  $role = (string)(clientes_context()['rol_organizacion'] ?? 'vista');
  if (!in_array($role, ['admin', 'contador'], true)) {
    json_out([
      'exito' => false,
      'mensaje' => 'Tu usuario tiene acceso de solo lectura en esta organización.',
    ], 403);
  }
}

function clientes_cliente_exists(PDO $pdo, int $idOrganizacion, int $idCliente): bool
{
  $st = $pdo->prepare("
    SELECT 1
    FROM clientes
    WHERE id_organizacion = :id_organizacion
      AND id_cliente = :id_cliente
    LIMIT 1
  ");
  $st->execute([
    ':id_organizacion' => $idOrganizacion,
    ':id_cliente' => $idCliente,
  ]);
  return (bool)$st->fetchColumn();
}

function clientes_sistema_exists(PDO $pdo, int $idOrganizacion, int $idSistema): bool
{
  $st = $pdo->prepare("
    SELECT 1
    FROM clientes_sistemas
    WHERE id_organizacion = :id_organizacion
      AND id_sistema = :id_sistema
    LIMIT 1
  ");
  $st->execute([
    ':id_organizacion' => $idOrganizacion,
    ':id_sistema' => $idSistema,
  ]);
  return (bool)$st->fetchColumn();
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
   FACTURACIÓN
========================================================= */
function clientes_facturacion_get_op(): void
{
  global $pdo;

  try {
    $idCliente = isset($_GET['id_cliente']) && is_numeric($_GET['id_cliente'])
      ? (int)$_GET['id_cliente']
      : 0;
    $idOrganizacion = clientes_org_id();

    if ($idCliente <= 0) {
      json_out(['exito' => false, 'mensaje' => 'id_cliente inválido'], 422);
    }
    if (!clientes_cliente_exists($pdo, $idOrganizacion, $idCliente)) {
      json_out(['exito' => false, 'mensaje' => 'Cliente inexistente en la organización seleccionada.'], 404);
    }

    $facturacion = clientes_facturacion_get($pdo, $idOrganizacion, $idCliente);

    json_out([
      'exito' => true,
      'facturacion' => $facturacion,
    ]);
  } catch (Throwable $e) {
    json_out([
      'exito' => false,
      'mensaje' => 'Error al obtener datos de facturación.',
    ], 500);
  }
}

function clientes_facturacion_upsert_op(): void
{
  global $pdo;
  clientes_require_write();

  try {
    $in = read_json();
    $idOrganizacion = clientes_org_id();
    $idCliente = isset($in['id_cliente']) && is_numeric($in['id_cliente']) ? (int)$in['id_cliente'] : 0;
    $docTipo = isset($in['doc_tipo']) && is_numeric($in['doc_tipo']) ? (int)$in['doc_tipo'] : 0;
    $docNro = preg_replace('/\D+/', '', (string)($in['doc_nro'] ?? ''));
    $razonSocial = trim((string)($in['razon_social'] ?? ''));
    $domicilio = trim((string)($in['domicilio'] ?? ''));
    $idCondicionIva = isset($in['id_condicion_iva']) && is_numeric($in['id_condicion_iva'])
      ? (int)$in['id_condicion_iva']
      : 4;
    $condVenta = trim((string)($in['cond_venta'] ?? 'Contado / Transferencia Bancaria'));

    if ($idCliente <= 0) json_out(['exito' => false, 'mensaje' => 'id_cliente inválido'], 422);
    if (!clientes_cliente_exists($pdo, $idOrganizacion, $idCliente)) {
      json_out(['exito' => false, 'mensaje' => 'Cliente inexistente en la organización seleccionada.'], 404);
    }
    if (!in_array($docTipo, [80, 96], true)) json_out(['exito' => false, 'mensaje' => 'doc_tipo inválido (80/96)'], 422);
    if ($docNro === '') json_out(['exito' => false, 'mensaje' => 'doc_nro obligatorio (solo números)'], 422);
    if ($razonSocial === '') json_out(['exito' => false, 'mensaje' => 'razon_social obligatoria'], 422);
    if (!iva_condicion_existe($pdo, $idCondicionIva)) {
      json_out(['exito' => false, 'mensaje' => 'Condición IVA inválida'], 422);
    }

    clientes_facturacion_upsert($pdo, [
      'id_organizacion' => $idOrganizacion,
      'id_cliente' => $idCliente,
      'doc_tipo' => $docTipo,
      'doc_nro' => $docNro,
      'razon_social' => $razonSocial,
      'domicilio' => $domicilio,
      'id_condicion_iva' => $idCondicionIva,
      'cond_venta' => $condVenta !== '' ? $condVenta : 'Contado / Transferencia Bancaria',
    ]);

    json_out(['exito' => true, 'mensaje' => 'Datos de facturación guardados']);
  } catch (PDOException $e) {
    if ((string)$e->getCode() === '23000') {
      json_out([
        'exito' => false,
        'mensaje' => 'Ese documento ya está asociado a otro cliente de esta organización.',
      ], 409);
    }
    json_out(['exito' => false, 'mensaje' => 'Error al guardar datos de facturación.'], 500);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error al guardar datos de facturación.'], 500);
  }
}


function clientes_reparto_resumen(): void
{
  global $pdo;
  try {
    $idOrganizacion = clientes_org_id();
    $idSistema = isset($_GET['id_sistema']) && is_numeric($_GET['id_sistema'])
      ? (int)$_GET['id_sistema']
      : 0;
    $monto = isset($_GET['monto']) && is_numeric($_GET['monto'])
      ? max(0.0, (float)$_GET['monto'])
      : 0.0;

    if ($idSistema > 0 && !clientes_sistema_exists($pdo, $idOrganizacion, $idSistema)) {
      json_out(['exito' => false, 'mensaje' => 'Sistema inexistente en esta organización.'], 404);
    }

    $org = reparto_organizacion_config($pdo, $idOrganizacion);
    $resumen = $idSistema > 0
      ? reparto_resumen_sistema($pdo, $idOrganizacion, $idSistema, $monto)
      : [
          'organizacion' => $org,
          'modelo_reparto' => $org['modelo_reparto'],
          'configurado' => true,
          'total_porcentaje' => 0,
          'monto_base' => $monto,
          'regla_directa' => [],
          'items' => [],
        ];

    if ($idSistema <= 0 && $org['modelo_reparto'] === 'por_entidad') {
      $resumen = reparto_resumen_organizacion($pdo, $idOrganizacion, $monto);
    }

    json_out(['exito' => true, 'reparto' => $resumen]);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'No se pudo resolver el reparto contable.'], 500);
  }
}

function planes_mantenimiento_listar(): void
{
  global $pdo;

  try {
    $data = repo_planes_mantenimiento_listar($pdo, clientes_org_id());
    json_out(['exito' => true, 'data' => $data]);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error al listar planes de mantenimiento.'], 500);
  }
}
