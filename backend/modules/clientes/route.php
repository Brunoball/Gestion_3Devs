<?php
// backend/modules/clientes/route.php
declare(strict_types=1);

require_once __DIR__ . '/clientes.php';

function route_clientes(string $action): bool
{
  global $pdo;

  if ($action !== 'clientes') return false;

  // La organización nunca se toma del cuerpo de la petición: se valida contra la sesión.
  clientes_set_context(auth_require_session($pdo));

  $op = $_GET['op'] ?? '';

  switch ($op) {
    case 'list': clientes_listar(); return true;
    case 'create': clientes_crear(); return true;
    case 'update': clientes_actualizar(); return true;
    case 'delete': clientes_eliminar(); return true;

    case 'sistemas_list': clientes_sistemas_listar(); return true;
    case 'sistemas_create': clientes_sistemas_crear(); return true;
    case 'sistemas_update': clientes_sistemas_actualizar(); return true;
    case 'sistemas_delete': clientes_sistemas_eliminar(); return true;

    case 'trabajadores_list': trabajadores_listar_simple(); return true;

    case 'sistema_trabajadores_list': sistema_trabajadores_listar(); return true;
    case 'sistema_trabajadores_add': sistema_trabajadores_agregar(); return true;
    case 'sistema_trabajadores_remove': sistema_trabajadores_quitar(); return true;
    case 'sistema_trabajadores_save': sistema_trabajadores_guardar(); return true;

    case 'planes_mantenimiento_list': planes_mantenimiento_listar(); return true;
    case 'reparto_resumen': clientes_reparto_resumen(); return true;

    case 'facturacion_get': clientes_facturacion_get_op(); return true;
    case 'facturacion_upsert': clientes_facturacion_upsert_op(); return true;

    default:
      json_out([
        'exito' => false,
        'mensaje' => 'OP no válida en clientes: ' . $op,
      ], 404);
  }
}
