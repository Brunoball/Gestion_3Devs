<?php
// backend/modules/reportes/route.php
declare(strict_types=1);

function route_reportes(string $action): bool
{
  if ($action !== 'reportes') return false;

  $op = $_GET['op'] ?? '';

  // 👉 funciones de reportes (estadísticas)
  if (in_array($op, ['anios', 'estadisticas'], true)) {
    require_once __DIR__ . '/reportes.php';
    return true;
  }

  // 👉 funciones de registros (listados)
  if (in_array($op, ['movimientos', 'registros'], true)) {
    require_once __DIR__ . '/registros.php';
    return true;
  }

  echo json_encode([
    'exito'   => false,
    'mensaje' => 'op no válida en reportes: ' . $op
  ]);
  exit;
}
