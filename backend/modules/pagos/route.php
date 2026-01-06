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
 * - GET  /api.php?action=pagos&op=equipo_sistema&id_sistema=5&anio=2026&mes=1
 * - POST /api.php?action=pagos&op=registrar_pago
 * - POST /api.php?action=pagos&op=eliminar_pago
 *
 * ✅ ARCA (REAL):
 * - POST /api.php?action=pagos&op=factura_arca
 */

function route_pagos(string $action): bool
{
  if ($action !== 'pagos' && $action !== 'anios_pagos') return false;

  // ✅ Carga del módulo
  require_once __DIR__ . '/pagos.php';

  // ✅ Respuesta siempre JSON (evita HTML silencioso)
  if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
  }

  // ✅ Años de pagos
  if ($action === 'anios_pagos') {
    pagos_listar_anios();
    return true;
  }

  $op = (string)($_GET['op'] ?? '');

  // ✅ Ops de modal / acciones
  switch ($op) {
    case 'detalle_sistema':
      pagos_detalle_sistema();
      return true;

    case 'equipo_sistema':
      pagos_equipo_sistema();
      return true;

    case 'registrar_pago':
      pagos_registrar_pago();
      return true;

    case 'eliminar_pago':
      pagos_eliminar_pago();
      return true;

    case 'factura_arca':
      pagos_factura_arca();
      return true;
  }

  // ✅ Estado listados
  $estado = strtolower(trim((string)($_GET['estado'] ?? 'pagado')));

  if ($estado === 'pagado' || $estado === 'pagados') {
    pagos_listar_pagados();
    return true;
  }

  if ($estado === 'deudor' || $estado === 'deudores') {
    // ✅ IMPORTANTE: el fix del bug está dentro de pagos_listar_deudores() en pagos.php
    pagos_listar_deudores();
    return true;
  }

  // ✅ Fallback
  http_response_code(200);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'Parámetros inválidos. Usá: ?estado=pagado|deudor o ?op=detalle_sistema|equipo_sistema|registrar_pago|eliminar_pago|factura_arca'
  ], JSON_UNESCAPED_UNICODE);

  return true;
}
