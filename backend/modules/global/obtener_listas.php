<?php
// backend/modules/listas/obtener_listas.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    // ✅ SIN prefijo de base: solo nombres de tabla
    $sql = "
        SELECT 
            id_especialidad AS id,
            especialidad    AS nombre,
            cupo
        FROM `especialidad`
        ORDER BY nombre
    ";

    $especialidad = [];
    foreach ($pdo->query($sql, PDO::FETCH_ASSOC) as $row) {
        $especialidad[] = [
            'id'     => (int)$row['id'],
            'nombre' => (string)$row['nombre'],
            // cupo puede ser NULL o número
            'cupo'   => is_null($row['cupo']) ? null : (int)$row['cupo'],
        ];
    }

    echo json_encode([
        'exito'        => true,
        'especialidad' => $especialidad,
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
