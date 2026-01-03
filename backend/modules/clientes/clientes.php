<?php
// backend/modules/clientes/clientes.php
declare(strict_types=1);

// 👇 Si tu routes/api.php ya hace require del DB, esto es redundante.
// Pero lo dejo para que funcione incluso si llamás al módulo directo.
require_once __DIR__ . '/../../config/db.php'; // debe definir $pdo (PDO)

/* =========================
   HELPERS (compartidos)
========================= */
function json_out(array $arr): void {
  http_response_code(200);
  echo json_encode($arr, JSON_UNESCAPED_UNICODE);
  exit;
}

function read_json(): array {
  $raw = file_get_contents('php://input');
  $in = json_decode($raw ?: '[]', true);
  return is_array($in) ? $in : [];
}

/* =========================
   REPOS (misma carpeta)
========================= */
require_once __DIR__ . '/clientes.repo.php';
require_once __DIR__ . '/sistemas.repo.php';
require_once __DIR__ . '/trabajadores.repo.php';
require_once __DIR__ . '/sistema_trabajadores.repo.php';
require_once __DIR__ . '/planes_mantenimiento.repo.php'; // ✅ FALTABA

/* =========================================================
   HANDLERS (ENDPOINTS) - (los tuyos ya existen en tus repos)
   Acá solo agrego el que faltaba.
========================================================= */

/**
 * ✅ NUEVO HANDLER
 * GET: /api.php?action=clientes&op=planes_mantenimiento_list
 */
function planes_mantenimiento_listar(): void
{
  global $pdo;

  try {
    if (!($pdo instanceof PDO)) {
      json_out([
        'exito' => false,
        'mensaje' => 'Conexión PDO no disponible.'
      ]);
    }

    $data = repo_planes_mantenimiento_listar($pdo);

    json_out([
      'exito' => true,
      'data'  => $data
    ]);
  } catch (Throwable $e) {
    json_out([
      'exito' => false,
      'mensaje' => 'Error al listar planes de mantenimiento.',
      'error' => $e->getMessage()
    ]);
  }
}

/* =========================================================
   IMPORTANTE
   Tus otras funciones (clientes_listar, clientes_crear, etc.)
   deben estar definidas en este mismo archivo o ya estar
   definidas abajo (no las toco).
========================================================= */
