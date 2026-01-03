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

    /* =========================
       1) TRABAJADORES (activos)
    ========================== */
    $sqlTrab = "
        SELECT
            id,
            nombre,
            apellido,
            email,
            rol,
            alias_pago,
            activo,
            fecha_alta
        FROM trabajadores
        WHERE activo = 1
        ORDER BY apellido, nombre
    ";

    $trabajadores = [];
    foreach ($pdo->query($sqlTrab, PDO::FETCH_ASSOC) as $r) {
        $trabajadores[] = [
            'id'         => (int)$r['id'],
            'nombre'     => (string)$r['nombre'],
            'apellido'   => (string)$r['apellido'],
            'email'      => $r['email'] !== null ? (string)$r['email'] : null,
            'rol'        => (string)$r['rol'], // admin|desarrollador|soporte|vista
            'alias_pago' => $r['alias_pago'] !== null ? (string)$r['alias_pago'] : null,
            'activo'     => (int)$r['activo'],
            'fecha_alta' => (string)$r['fecha_alta'],
        ];
    }

    /* =========================
       2) MEDIOS DE PAGO (activos)
    ========================== */
    $sqlMP = "
        SELECT
            id_medio_pago AS id,
            nombre,
            activo
        FROM medios_pago
        WHERE activo = 1
        ORDER BY nombre
    ";

    $medios_pago = [];
    foreach ($pdo->query($sqlMP, PDO::FETCH_ASSOC) as $r) {
        $medios_pago[] = [
            'id'     => (int)$r['id'],
            'nombre' => (string)$r['nombre'],
            'activo' => (int)$r['activo'],
        ];
    }

    /* =========================
       3) PLANES MANTENIMIENTO (activos)
    ========================== */
    $sqlPlanes = "
        SELECT
            id,
            nombre,
            descripcion,
            monto,
            activo,
            fecha_creacion
        FROM planes_mantenimiento
        WHERE activo = 1
        ORDER BY nombre
    ";

    $planes_mantenimiento = [];
    foreach ($pdo->query($sqlPlanes, PDO::FETCH_ASSOC) as $r) {
        $planes_mantenimiento[] = [
            'id'             => (int)$r['id'],
            'nombre'         => (string)$r['nombre'],
            'descripcion'    => $r['descripcion'] !== null ? (string)$r['descripcion'] : null,
            'monto'          => (float)$r['monto'], // decimal(10,2)
            'activo'         => (int)$r['activo'],
            'fecha_creacion' => (string)$r['fecha_creacion'],
        ];
    }

    /* =========================
       4) MESES (tabla meses)
       Tabla: gestion_3devs.meses
       Campos: id_mes (PK), mes (varchar(15) UNIQUE)
    ========================== */
    $sqlMeses = "
        SELECT
            id_mes AS id,
            mes
        FROM meses
        ORDER BY id_mes ASC
    ";

    $meses = [];
    foreach ($pdo->query($sqlMeses, PDO::FETCH_ASSOC) as $r) {
        $meses[] = [
            'id'  => (int)$r['id'],
            'mes' => (string)$r['mes'],
        ];
    }

    echo json_encode([
        'exito' => true,
        'listas' => [
            'trabajadores'         => $trabajadores,
            'medios_pago'          => $medios_pago,
            'planes_mantenimiento' => $planes_mantenimiento,
            'meses'                => $meses,
        ],
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
