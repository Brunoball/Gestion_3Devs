<?php
// ✅ REEMPLAZAR COMPLETO
// backend/modules/reportes/route.php
declare(strict_types=1);

function route_reportes(string $action): bool
{
  if ($action !== 'reportes') return false;

  $op = $_GET['op'] ?? '';

  if (in_array($op, ['anios', 'estadisticas'], true)) {
    require_once __DIR__ . '/reportes.php';
    return true;
  }

  if (in_array($op, [
    'movimientos',
    'registros',
    'crear_egreso',
    'editar_movimiento',
    'eliminar_egreso',
    'pago_comprobante',
  ], true)) {
    require_once __DIR__ . '/registro.php';
    return true;
  }

  if (in_array($op, ['trabajadores', 'trabajadores_activos'], true)) {
    require_once __DIR__ . '/trabajadores.php';
    return true;
  }

  echo json_encode([
    'exito'   => false,
    'mensaje' => 'op no válida en reportes: ' . $op
  ], JSON_UNESCAPED_UNICODE);
  exit;
}