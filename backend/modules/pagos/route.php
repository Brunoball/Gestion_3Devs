<?php
// backend/modules/pagos/route.php
declare(strict_types=1);

function route_pagos(string $action): bool
{
    if ($action !== 'pagos' && $action !== 'anios_pagos') return false;

    global $pdo;
    require_once __DIR__ . '/../auth/session.php';
    $GLOBALS['PAGOS_AUTH'] = auth_require_session($pdo);

    if (!defined('PAGOS_ROUTED')) define('PAGOS_ROUTED', true);
    require_once __DIR__ . '/pagos.php';

    if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');

    if ($action === 'anios_pagos') {
        pagos_listar_anios();
        return true;
    }

    $op = strtolower(trim((string)($_GET['op'] ?? '')));
    switch ($op) {
        case 'detalle_sistema': pagos_detalle_sistema(); return true;
        case 'detalle_periodo': pagos_detalle_periodo(); return true;
        case 'equipo_sistema': pagos_equipo_sistema(); return true;
        case 'distribucion_cliente': pagos_distribucion_cliente(); return true;
        case 'registrar_pago': pagos_registrar_pago(); return true;
        case 'eliminar_pago': pagos_eliminar_pago(); return true;
        case 'cliente_facturacion': pagos_cliente_facturacion(); return true;
        case 'cliente_facturacion_sistema': pagos_cliente_facturacion_sistema(); return true;
        case 'cliente_sistemas': pagos_cliente_sistemas(); return true;
        case 'factura_arca': pagos_factura_arca(); return true;
        case 'factura_guardar_pdf': pagos_factura_guardar_pdf(); return true;
        case 'planes_mantenimiento': pagos_planes_mantenimiento(); return true;
        case 'factura_anular_con_nc': pagos_factura_anular_con_nc(); return true;
    }

    $estado = strtolower(trim((string)($_GET['estado'] ?? 'pagado')));
    if (in_array($estado, ['pagado', 'pagados'], true)) {
        pagos_listar_pagados();
        return true;
    }
    if (in_array($estado, ['deudor', 'deudores'], true)) {
        pagos_listar_deudores();
        return true;
    }

    json_error('Parámetros inválidos para el módulo Pagos.');

    // json_error() finaliza la respuesta. Este retorno mantiene explícito
    // el contrato bool para analizadores estáticos configurados con PHP 8.0.
    return true;
}
