<?php
// backend/modules/clientes/clientes.php
declare(strict_types=1);

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
