<?php
// backend/modules/global/obtener_dolar.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

try {
    $url = "https://dolarapi.com/v1/dolares/oficial";

    $context = stream_context_create([
        'http' => [
            'method'  => 'GET',
            'timeout' => 5
        ]
    ]);

    $response = file_get_contents($url, false, $context);

    if ($response === false) {
        throw new Exception('No se pudo conectar con la API del dólar');
    }

    $data = json_decode($response, true);

    if (!isset($data['venta'])) {
        throw new Exception('Respuesta inválida de la API');
    }

    echo json_encode([
        'ok'      => true,
        'fuente'  => 'Dólar Oficial',
        'compra'  => (float)$data['compra'],
        'venta'   => (float)$data['venta'],
        'fecha'   => $data['fechaActualizacion'] ?? date('Y-m-d'),
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok'    => false,
        'error' => $e->getMessage()
    ]);
}
