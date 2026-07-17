<?php
// backend/modules/reportes/route.php
declare(strict_types=1);

function route_reportes(string $action): bool
{
    if ($action !== 'reportes') return false;

    global $pdo;

    require_once __DIR__ . '/common.php';
    require_once __DIR__ . '/../reparto/reparto.service.php';

    // Autentica y fija la organización antes de ejecutar cualquier operación.
    $GLOBALS['REPORTES_AUTH'] = reportes_auth();

    $op = strtolower(trim((string)($_GET['op'] ?? '')));

    if (in_array($op, ['ping', 'lista', 'anios', 'estadisticas'], true)) {
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

    if (in_array($op, [
        'trabajadores',
        'trabajadores_activos',
        'egreso_pagadores',
        'trabajador_subir_comprobante',
        'trabajador_comprobante_latest',
        'trabajador_comprobantes_listar',
        'trabajador_marcar_pagado',
        'blindaje_inicializar',
    ], true)) {
        require_once __DIR__ . '/trabajadores.php';
        return true;
    }

    if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
    http_response_code(200);
    echo json_encode([
        'exito' => false,
        'mensaje' => 'op no válida en reportes: ' . $op,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
