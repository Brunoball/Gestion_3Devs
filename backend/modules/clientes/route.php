<?php
// backend/modules/clientes/route.php
declare(strict_types=1);

require_once __DIR__ . '/clientes.php'; // helpers + handlers + requires

function route_clientes(string $action): bool
{
  if ($action !== 'clientes') return false;

  $op = $_GET['op'] ?? '';

  switch ($op) {

    // ===== CLIENTES =====
    case 'list':   clientes_listar(); return true;
    case 'create': clientes_crear(); return true;
    case 'update': clientes_actualizar(); return true;
    case 'delete': clientes_eliminar(); return true;

    // ===== SISTEMAS =====
    case 'sistemas_list':   clientes_sistemas_listar(); return true;
    case 'sistemas_create': clientes_sistemas_crear(); return true;
    case 'sistemas_update': clientes_sistemas_actualizar(); return true;
    case 'sistemas_delete': clientes_sistemas_eliminar(); return true;

    // ===== TRABAJADORES =====
    case 'trabajadores_list': trabajadores_listar_simple(); return true;

    // ===== RELACIÓN SISTEMA/TRABAJADORES =====
    case 'sistema_trabajadores_list':   sistema_trabajadores_listar(); return true;
    case 'sistema_trabajadores_add':    sistema_trabajadores_agregar(); return true;
    case 'sistema_trabajadores_remove': sistema_trabajadores_quitar(); return true;

    // ✅ PLANES DE MANTENIMIENTO
    case 'planes_mantenimiento_list': planes_mantenimiento_listar(); return true;

    // ✅ NUEVO: FACTURACIÓN
    case 'facturacion_get':    clientes_facturacion_get_op(); return true;
    case 'facturacion_upsert': clientes_facturacion_upsert_op(); return true;

    default:
      http_response_code(200);
      echo json_encode([
        'exito' => false,
        'mensaje' => 'OP no válida en clientes: ' . $op
      ], JSON_UNESCAPED_UNICODE);
      return true;
  }
}
