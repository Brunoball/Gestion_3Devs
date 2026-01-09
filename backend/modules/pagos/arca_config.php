<?php
// backend/modules/pagos/arca_config.php
declare(strict_types=1);

return [
  // 'homo' | 'prod'
  'mode' => 'prod', // <-- cuando estés listo para facturar REAL

  // CUIT del emisor
  'cuit' => 20257525164,

  // Certificado + clave privada (PEM) (guardalos en backend/secure/)
  'cert_path' => __DIR__ . '/../../secure/arca_cert.pem',
  'key_path'  => __DIR__ . '/../../secure/arca_key.pem',
  'key_pass'  => '3DevsSol2025', // <-- tu passphrase (si la key la usa)

  // WSN a pedir en WSAA
  'wsn' => 'wsfe',

  // Endpoints oficiales
  'wsaa' => [
    'homo' => 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl',
    'prod' => 'https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl',
  ],
  'wsfe' => [
    'homo' => 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL',
    'prod' => 'https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL',
  ],

  'defaults' => [
    'concepto' => 2,
    'moneda'   => 'PES',
    'cotiz'    => 1.0,
  ],
];
