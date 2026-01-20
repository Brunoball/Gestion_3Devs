<?php
// backend/modules/pagos/arca_wsfe.php
declare(strict_types=1);

final class ArcaWsfe
{
  private SoapClient $client;
  private string $endpoint;
  private bool $sslVerify;
  private string $caFile;
  private bool $debugLog;

  public function __construct(
    string $wsfeWsdlPath,
    string $endpoint,
    bool $sslVerify = true,
    string $caFile = '',
    bool $debugLog = false
  ) {
    $this->endpoint  = $endpoint;
    $this->sslVerify = $sslVerify;
    $this->caFile    = $caFile;
    $this->debugLog  = $debugLog;

    if (!extension_loaded('soap')) {
      throw new RuntimeException("Extensión SOAP no habilitada en PHP (extension=soap)");
    }

    if (!file_exists($wsfeWsdlPath)) {
      throw new RuntimeException("No existe WSDL WSFE local: $wsfeWsdlPath");
    }

    // socket timeout global (ayuda en hostings)
    @ini_set('default_socket_timeout', '60');

    // ✅ DEBUG: chequeo conectividad TCP al host (no valida TLS, solo reachability)
    $this->assertTcpConnect($endpoint, 443, 8, $debugLog);

    // 1) Intento normal: evitar DH/DHE (corrige "dh key too small")
    try {
      $ctx = $this->buildStreamContext($sslVerify, $caFile, 'no_dh');
      $this->client = $this->makeSoapClient($wsfeWsdlPath, $endpoint, $ctx, $debugLog);
      return;
    } catch (Throwable $e) {
      $m1 = $e->getMessage();
      if ($debugLog) error_log("[ARCA WSFE] SoapClient intento #1 (no_dh) falló: $m1");
    }

    // 2) Fallback: bajar seclevel (solo si el server obliga DH chico)
    //    Esto suele destrabar OpenSSL 3 en shared hostings.
    try {
      $ctx = $this->buildStreamContext($sslVerify, $caFile, 'seclevel1');
      $this->client = $this->makeSoapClient($wsfeWsdlPath, $endpoint, $ctx, $debugLog);
      if ($debugLog) error_log("[ARCA WSFE] SoapClient OK con fallback DEFAULT:@SECLEVEL=1");
      return;
    } catch (Throwable $e2) {
      $msg = "No pude crear SoapClient WSFE. endpoint=$endpoint wsdl=$wsfeWsdlPath. Detalle: " . $e2->getMessage();
      if ($debugLog) error_log("[ARCA WSFE] $msg");
      throw new RuntimeException($msg);
    }
  }

  public function FECompUltimoAutorizado(array $auth, int $ptoVta, int $cbteTipo): array
  {
    try {
      $resp = $this->client->FECompUltimoAutorizado([
        'Auth'     => $auth,
        'PtoVta'   => $ptoVta,
        'CbteTipo' => $cbteTipo,
      ]);
    } catch (SoapFault $e) {
      throw new RuntimeException("SOAP FECompUltimoAutorizado error: " . $e->getMessage());
    }

    $r = $resp->FECompUltimoAutorizadoResult ?? null;
    if (!$r) throw new RuntimeException("WSFE sin FECompUltimoAutorizadoResult");

    if (!empty($r->Errors)) {
      throw new RuntimeException("WSFE Error (FECompUltimoAutorizado): " . self::formatErrors($r->Errors));
    }

    return json_decode(json_encode($r), true) ?: [];
  }

  public function FECAESolicitar(array $auth, array $feCAEReq): array
  {
    try {
      $resp = $this->client->FECAESolicitar([
        'Auth'     => $auth,
        'FeCAEReq' => $feCAEReq,
      ]);
    } catch (SoapFault $e) {
      throw new RuntimeException("SOAP FECAESolicitar error: " . $e->getMessage());
    }

    $r = $resp->FECAESolicitarResult ?? null;
    if (!$r) throw new RuntimeException("WSFE sin FECAESolicitarResult");

    if (!empty($r->Errors)) {
      throw new RuntimeException("WSFE Error (FECAESolicitar): " . self::formatErrors($r->Errors));
    }

    return json_decode(json_encode($r), true) ?: [];
  }

  private function makeSoapClient(string $wsdlPath, string $endpoint, $ctx, bool $debugLog): SoapClient
  {
    try {
      return new SoapClient($wsdlPath, [
        'soap_version' => SOAP_1_1,
        'exceptions'   => true,
        'trace'        => $debugLog, // si true, podés inspeccionar lastRequest/Response
        'cache_wsdl'   => WSDL_CACHE_NONE,
        'connection_timeout' => 60,
        'stream_context' => $ctx,
        'features'       => SOAP_SINGLE_ELEMENT_ARRAYS,
        'user_agent'     => 'Mozilla/5.0 (PHP SoapClient)',
        // 🔥 forzar endpoint real
        'location'       => $endpoint,
      ]);
    } catch (Throwable $e) {
      throw new RuntimeException("SoapClient init error: " . $e->getMessage());
    }
  }

  /**
   * Construye un stream_context SSL+HTTP robusto.
   * - profile no_dh: evita DHE/DH (soluciona dh key too small)
   * - profile seclevel1: baja seclevel (OpenSSL 3) como último recurso
   */
  private function buildStreamContext(bool $sslVerify, string $caFile, string $profile)
  {
    $ssl = [
      'verify_peer'       => $sslVerify,
      'verify_peer_name'  => $sslVerify,
      'allow_self_signed' => !$sslVerify,
      'SNI_enabled'       => true,
      'crypto_method'     => STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT,
    ];

    if ($sslVerify && $caFile !== '' && file_exists($caFile)) {
      $ssl['cafile'] = $caFile;
    }

    // ✅ PERFIL CIPHERS
    if ($profile === 'no_dh') {
      // Prioriza ECDHE y bloquea DH/DHE
      $ssl['ciphers'] = 'ECDHE+AESGCM:ECDHE+CHACHA20:ECDHE+AES256:ECDHE+AES128:!DHE:!DH:!aNULL:!eNULL:!MD5:!RC4';
    } elseif ($profile === 'seclevel1') {
      // Fallback para OpenSSL 3 (acepta DH más chico)
      $ssl['ciphers'] = 'DEFAULT:@SECLEVEL=1';
    }

    // ✅ HTTP options (evita keep-alive raro en shared hosting)
    $http = [
      'header'  => "Connection: close\r\n",
      'timeout' => 60,
    ];

    return stream_context_create([
      'ssl'  => $ssl,
      'http' => $http,
    ]);
  }

  private static function formatErrors($errors): string
  {
    $arr = json_decode(json_encode($errors), true) ?: [];
    $items = $arr['Err'] ?? $arr ?? [];
    if (isset($items['Code']) || isset($items['Msg'])) $items = [$items];

    $out = [];
    foreach ((array)$items as $e) {
      $code = $e['Code'] ?? '';
      $msg  = $e['Msg'] ?? '';
      $out[] = trim("$code $msg");
    }
    return implode(' | ', array_filter($out));
  }

  private function assertTcpConnect(string $url, int $port, int $timeoutSec, bool $debugLog): void
  {
    $host = parse_url($url, PHP_URL_HOST);
    if (!$host) {
      throw new RuntimeException("Endpoint inválido (no puedo obtener host): $url");
    }

    $errNo = 0; $errStr = '';
    $fp = @fsockopen($host, $port, $errNo, $errStr, $timeoutSec);
    if (!$fp) {
      $msg = "No puedo conectar TCP a $host:$port (endpoint=$url). errno=$errNo err=$errStr";
      if ($debugLog) error_log("[ARCA WSFE] $msg");
      throw new RuntimeException($msg);
    }
    fclose($fp);

    if ($debugLog) error_log("[ARCA WSFE] OK TCP a $host:$port");
  }
}
