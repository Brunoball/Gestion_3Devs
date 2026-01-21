<?php
// backend/modules/pagos/route.php
declare(strict_types=1);

/**
 * Router del módulo PAGOS.
 *
 * Soporta:
 * ✅ Listados:
 * - GET  /api.php?action=anios_pagos
 * - GET  /api.php?action=pagos&estado=pagado&anio=2026&mes=ENERO
 * - GET  /api.php?action=pagos&estado=deudor&anio=2026&mes=ENERO
 *
 * ✅ Modal:
 * - GET/POST /api.php?action=pagos&op=detalle_sistema&id_sistema=5
 * - GET/POST /api.php?action=pagos&op=equipo_sistema&id_sistema=5&anio=2026&mes=ENERO
 * - POST     /api.php?action=pagos&op=registrar_pago
 * - POST     /api.php?action=pagos&op=eliminar_pago
 *
 * ✅ Datos facturación:
 * - POST     /api.php?action=pagos&op=cliente_facturacion            (por id_pago)
 * - POST     /api.php?action=pagos&op=cliente_facturacion_sistema    (por id_sistema)
 *
 * ✅ ARCA (REAL):
 * - POST /api.php?action=pagos&op=factura_arca
 *
 * ✅ GUARDAR PDF FACTURA:
 * - POST /api.php?action=pagos&op=factura_guardar_pdf
 *
 * ✅ NUEVO: Planes de mantenimiento:
 * - GET  /api.php?action=pagos&op=planes_mantenimiento
 */

function route_pagos(string $action): bool
{
  if ($action !== 'pagos' && $action !== 'anios_pagos') return false;

  // ✅ IMPORTANTÍSIMO: evita que pagos.php ejecute su dispatcher interno al ser incluido
  if (!defined('PAGOS_ROUTED')) define('PAGOS_ROUTED', true);

  require_once __DIR__ . '/pagos.php';

  if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
  }

  if ($action === 'anios_pagos') {
    pagos_listar_anios();
    return true;
  }

  $op = (string)($_GET['op'] ?? '');

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

    case 'cliente_facturacion':
      pagos_cliente_facturacion();
      return true;

    case 'cliente_facturacion_sistema':
      pagos_cliente_facturacion_sistema();
      return true;

    case 'factura_arca':
      pagos_factura_arca();
      return true;

    // ✅ NUEVO: Guardar PDF en tabla facturas
    case 'factura_guardar_pdf':
      pagos_factura_guardar_pdf();
      return true;

    // ✅ NUEVO: planes de mantenimiento desde DB
    case 'planes_mantenimiento':
      pagos_planes_mantenimiento();
      return true;
  }

  $estado = strtolower(trim((string)($_GET['estado'] ?? 'pagado')));

  if ($estado === 'pagado' || $estado === 'pagados') {
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
    'mensaje' => 'Parámetros inválidos. Usá: ?estado=pagado|deudor o ?op=detalle_sistema|equipo_sistema|registrar_pago|eliminar_pago|cliente_facturacion|cliente_facturacion_sistema|factura_arca|factura_guardar_pdf|planes_mantenimiento'
  ], JSON_UNESCAPED_UNICODE);

  return true;
}
