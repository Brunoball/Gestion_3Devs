<?php
// backend/modules/pagos/route.php
declare(strict_types=1);

function route_pagos(string $action): bool
{
  // ✅ Maneja:
  // - action=pagos
  // - action=anios_pagos
  if ($action !== 'pagos' && $action !== 'anios_pagos') return false;

  // ✅ IMPORTANTE: recién acá cargamos el módulo
  require_once __DIR__ . '/pagos.php';

  // action=anios_pagos
  if ($action === 'anios_pagos') {
    pagos_listar_anios();
    return true;
  }

  // action=pagos
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
    'mensaje' => 'Parámetro estado inválido. Usá estado=pagado o estado=deudor'
  ], JSON_UNESCAPED_UNICODE);
  return true;
}
