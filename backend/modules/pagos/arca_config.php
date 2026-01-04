<?php
// backend/modules/pagos/arca_config.php
declare(strict_types=1);

/**
 * Configuración ARCA/AFIP (WSAA + WSFEv1)
 * - HOMO: sirve para probar (certificado HOMO)
 * - PROD: factura REAL (certificado PROD)
 *
 * WSAA/WSFE docs: :contentReference[oaicite:2]{index=2}
 */

return [
  // 'homo' | 'prod'
  'mode' => 'homo',

  // CUIT del emisor (tu CUIT)
  'cuit' => 20301234567,

  // Certificado + clave privada (PEM)
  // Recomendado: guardar en backend/secure/...
  'cert_path' => __DIR__ . '/../../secure/arca_cert.pem',
  'key_path'  => __DIR__ . '/../../secure/arca_key.pem',
  'key_pass'  => '', // si tu key tiene passphrase, ponela acá

  // WSN a pedir en WSAA
  'wsn' => 'wsfe',

  // Endpoints
  'wsaa' => [
    'homo' => 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl',
    'prod' => 'https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl',
  ],
  'wsfe' => [
    'homo' => 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL',
    'prod' => 'https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL',
  ],

  // Defaults de factura
  'defaults' => [
    // Concepto: 1=Productos, 2=Servicios, 3=Productos y Servicios
    'concepto' => 2,
    'moneda'   => 'PES',
    'cotiz'    => 1.0,
  ],
];
