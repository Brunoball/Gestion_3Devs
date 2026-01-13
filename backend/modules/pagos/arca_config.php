<?php
// backend/modules/pagos/arca_config.php
declare(strict_types=1);

return [
  // 'homo' | 'prod'
  'mode' => 'prod',

  // CUIT del emisor
  'cuit' => 20257525164,

  // Archivos en: public_html/APP_3DEVS/api/secure/
  'cert_path' => __DIR__ . '/../../secure/arca_cert.pem',
  'key_path'  => __DIR__ . '/../../secure/arca_key.pem',
  'key_pass'  => '3DevsSol2025',

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

  // Defaults
  'defaults' => [
    // 1=Productos, 2=Servicios, 3=Productos y Servicios
    'concepto' => 2,
    'moneda'   => 'PES',
    'cotiz'    => 1.0,
  ],

  // SSL (por defecto seguro)
  // Si tu hosting NO tiene CA bundle bien configurado y falla con SSL,
  // podés poner false temporalmente:
  'ssl_verify' => true,
];
