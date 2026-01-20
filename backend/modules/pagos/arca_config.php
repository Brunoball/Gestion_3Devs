<?php
// backend/modules/pagos/arca_config.php
declare(strict_types=1);

$BASE_API_DIR = realpath(__DIR__ . '/../../'); // .../api
if ($BASE_API_DIR === false) {
  $BASE_API_DIR = __DIR__ . '/../../';
}
$SECURE_DIR = rtrim($BASE_API_DIR, '/\\') . '/secure';

// ✅ MODO
$mode = 'prod'; // 'homo' | 'prod'
$envMode = $_ENV['ARCA_MODE'] ?? getenv('ARCA_MODE') ?: '';
$envMode = strtolower(trim((string)$envMode));
if (in_array($envMode, ['homo', 'prod'], true)) $mode = $envMode;

// ✅ Password key (ideal por ENV)
$keyPass = (string)($_ENV['ARCA_KEY_PASS'] ?? getenv('ARCA_KEY_PASS') ?: '');
if ($keyPass === '') $keyPass = '3DevsSol2025'; // fallback

// ✅ Paths (filesystem)
$certPath = $SECURE_DIR . '/arca_cert.pem';
$keyPath  = $SECURE_DIR . '/arca_key.pem';
$caPath   = $SECURE_DIR . '/cacert.pem';

// ✅ WSDL local (filesystem) - IMPORTANTÍSIMO
$wsfeWsdlLocal = $SECURE_DIR . '/wsfev1.wsdl';

// Normalizar
$certReal = realpath($certPath) ?: $certPath;
$keyReal  = realpath($keyPath)  ?: $keyPath;
$caReal   = realpath($caPath)   ?: $caPath;
$wsdlReal = realpath($wsfeWsdlLocal) ?: $wsfeWsdlLocal;

// ✅ SSL verify (en PROD siempre true)
$sslVerify = true;

// CA bundle opcional
$caFile = (file_exists($caReal) && filesize($caReal) > 0) ? $caReal : '';

// ✅ Servicio WSAA a pedir
$wsn = 'wsfe';

return [
  'mode' => $mode,

  // ✅ CUIT del emisor
  'cuit' => 20257525164,

  // ✅ Archivos
  'cert_path' => $certReal,
  'key_path'  => $keyReal,
  'key_pass'  => $keyPass,

  'wsn' => $wsn,

  // ✅ WSAA (se usa remoto normal)
  'wsaa' => [
    'homo' => 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl',
    'prod' => 'https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl',
  ],

  // ✅ WSFE:
  // - WSDL: local (filesystem) para evitar que PHP “lo baje” de AFIP
  // - ENDPOINT: remoto real donde se ejecuta el SOAP
  'wsfe' => [
    'homo_wsdl' => $wsdlReal,
    'prod_wsdl' => $wsdlReal,

    'homo_endpoint' => 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
    'prod_endpoint' => 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  ],

  'defaults' => [
    'concepto' => 2,
    'moneda'   => 'PES',
    'cotiz'    => 1.0,
  ],

  'ssl_verify' => $sslVerify,
  'ca_file' => $caFile,

  // ✅ Dejalo false (solo diagnóstico)
  'ssl_fallback_if_fail' => false,

  'debug_log' => true,

  'wsaa_sign' => [
    'use_cli'      => true,
    'openssl_bin'  => 'openssl',
    'force_sha256' => true,
    'nodetach'     => true,
    'binary'       => true,
  ],
];
