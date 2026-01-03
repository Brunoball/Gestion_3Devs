<?php
// backend/modules/pagos/route.php
declare(strict_types=1);

/**
 * Router del módulo PAGOS.
 *
 * Soporta:
 * ✅ Listados:
 * - GET  /api.php?action=anios_pagos
 * - GET  /api.php?action=pagos&estado=pagado&anio=2026&mes=1
 * - GET  /api.php?action=pagos&estado=deudor&anio=2026&mes=1
 *
 * ✅ Modal:
 * - GET  /api.php?action=pagos&op=detalle_sistema&id_sistema=5
 * - POST /api.php?action=pagos&op=registrar_pago
 */

function route_pagos(string $action): bool
{
  if ($action !== 'pagos' && $action !== 'anios_pagos') return false;

  require_once __DIR__ . '/pagos.php';

  if ($action === 'anios_pagos') {
    pagos_listar_anios();
    return true;
  }

  $op = $_GET['op'] ?? '';

  if ($op === 'detalle_sistema') {
    pagos_detalle_sistema();
    return true;
  }

  if ($op === 'registrar_pago') {
    pagos_registrar_pago();
    return true;
  }

  $estado = $_GET['estado'] ?? 'pagado';

  if ($estado === 'pagado') {
    pagos_listar_pagados();
    return true;
  }

  if ($estado === 'deudor' || $estado === 'deudores') {
    pagos_listar_deudores();
    return true;
  }

  http_response_code(200);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'Parámetros inválidos. Usá: ?estado=pagado|deudor o ?op=detalle_sistema|registrar_pago'
  ], JSON_UNESCAPED_UNICODE);
  return true;
}
