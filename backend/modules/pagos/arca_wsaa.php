<?php
// backend/modules/pagos/arca_wsaa.php
declare(strict_types=1);

final class ArcaWsaa
{
  /** @return array{token:string, sign:string, expirationTime:string} */
  public static function login(
    string $wsaaWsdl,
    string $wsn,
    string $certPath,
    string $keyPath,
    string $keyPass = '',
    bool $sslVerify = true,
    string $caFile = '',
    bool $sslFallbackIfFail = false,
    bool $debugLog = false,
    string $opensslBin = 'openssl'
  ): array {

    if (!extension_loaded('soap')) throw new RuntimeException("Extensión SOAP no habilitada (extension=soap)");
    if (!extension_loaded('openssl')) throw new RuntimeException("Extensión OpenSSL no habilitada (extension=openssl)");

    if (!file_exists($certPath)) throw new RuntimeException("No existe cert: $certPath");
    if (!file_exists($keyPath))  throw new RuntimeException("No existe key: $keyPath");

    $tra = self::buildTRA($wsn);

    // ✅ FIRMADO CORRECTO PARA WSAA:
    // DER + NODTACH + BINARY + SHA256, luego base64 (sin headers, sin mime)
    $cms = self::signTRA_wsaa_der_sha256($tra, $certPath, $keyPath, $keyPass, $opensslBin, $debugLog);

    $client = self::makeSoapClient($wsaaWsdl, $sslVerify, $caFile);

    try {
      $resp = $client->loginCms(['in0' => $cms]);
    } catch (Throwable $e) {
      $msg = $e->getMessage();

      // fallback SSL si corresponde
      if ($sslVerify && $sslFallbackIfFail) {
        if ($debugLog) error_log("[ARCA WSAA] loginCms falló con ssl_verify=true, intento ssl_verify=false: $msg");
        $client2 = self::makeSoapClient($wsaaWsdl, false, $caFile);
        $resp = $client2->loginCms(['in0' => $cms]);
      } else {
        throw new RuntimeException("SOAP loginCms error: " . $msg);
      }
    }

    $xml = $resp->loginCmsReturn ?? null;
    if (!$xml) throw new RuntimeException("WSAA sin respuesta loginCmsReturn");

    $sx = @new SimpleXMLElement($xml);
    if (!$sx) throw new RuntimeException("WSAA devolvió XML inválido");

    $token = (string)$sx->credentials->token;
    $sign  = (string)$sx->credentials->sign;
    $exp   = (string)$sx->header->expirationTime;

    if ($token === '' || $sign === '') {
      throw new RuntimeException("WSAA devolvió credenciales vacías (token/sign). XML preview: " . substr($xml, 0, 220));
    }

    if ($debugLog) error_log("[ARCA WSAA] OK token/sign. exp=$exp");
    return ['token' => $token, 'sign' => $sign, 'expirationTime' => $exp];
  }

  private static function makeSoapClient(string $wsdl, bool $sslVerify, string $caFile = ''): SoapClient
  {
    $ssl = [
      'verify_peer'       => $sslVerify,
      'verify_peer_name'  => $sslVerify,
      'allow_self_signed' => !$sslVerify,
      'SNI_enabled'       => true,
    ];
    if ($sslVerify && $caFile !== '' && file_exists($caFile)) $ssl['cafile'] = $caFile;

    $ctx = stream_context_create(['ssl' => $ssl]);

    return new SoapClient($wsdl, [
      'soap_version' => SOAP_1_1,
      'exceptions' => true,
      'trace' => false,
      'cache_wsdl' => WSDL_CACHE_NONE,
      'connection_timeout' => 30,
      'stream_context' => $ctx,
      'features' => SOAP_SINGLE_ELEMENT_ARRAYS,
      'user_agent' => 'Mozilla/5.0 (PHP SoapClient)',
    ]);
  }

  private static function buildTRA(string $wsn): string
  {
    $uniqueId = (string)time();
    $tz = new DateTimeZone('UTC');
    $genTime = (new DateTime('now', $tz))->modify('-5 minutes')->format('c');
    $expTime = (new DateTime('now', $tz))->modify('+12 hours')->format('c');

    return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>{$uniqueId}</uniqueId>
    <generationTime>{$genTime}</generationTime>
    <expirationTime>{$expTime}</expirationTime>
  </header>
  <service>{$wsn}</service>
</loginTicketRequest>
XML;
  }

  /**
   * ✅ WSAA: CMS en DER (base64) con contenido incluido (NO detached),
   * firmado con SHA256.
   *
   * Comando equivalente clásico:
   * openssl smime -sign -in tra.xml -signer cert.pem -inkey key.pem
   *   -outform DER -out cms.der -nodetach -binary -md sha256
   */
  private static function signTRA_wsaa_der_sha256(
    string $traXml,
    string $certPath,
    string $keyPath,
    string $keyPass,
    string $opensslBin,
    bool $debugLog
  ): string {
    if (!function_exists('proc_open')) {
      throw new RuntimeException("proc_open está deshabilitado. Necesito poder ejecutar openssl para firmar en SHA256 (WSAA).");
    }

    $tmpDir = sys_get_temp_dir();
    $in  = tempnam($tmpDir, 'tra_') ?: ($tmpDir . '/tra_' . uniqid() . '.xml');
    $out = tempnam($tmpDir, 'der_') ?: ($tmpDir . '/der_' . uniqid() . '.der');

    file_put_contents($in, $traXml);

    $cmd = [
      $opensslBin, 'smime',
      '-sign',
      '-in', $in,
      '-signer', $certPath,
      '-inkey', $keyPath,
      '-outform', 'DER',
      '-out', $out,
      '-nodetach',
      '-binary',
      '-md', 'sha256',
    ];

    $env = null;
    if ($keyPass !== '') {
      $cmd[] = '-passin';
      $cmd[] = 'env:ARCA_KEY_PASS';
      $env = array_merge($_ENV, ['ARCA_KEY_PASS' => $keyPass]);
    }

    [$code, $stdout, $stderr] = self::runCmd($cmd, $env);

    if ($code !== 0 || !file_exists($out) || filesize($out) < 64) {
      @unlink($in); @unlink($out);
      $msg = "OpenSSL CLI falló firmando WSAA (DER sha256). code=$code";
      if ($stderr) $msg .= " stderr=" . trim($stderr);
      throw new RuntimeException($msg);
    }

    $der = file_get_contents($out) ?: '';
    @unlink($in); @unlink($out);

    // base64 sin saltos
    $cms = base64_encode($der);

    if ($debugLog) error_log("[ARCA WSAA] DER len=" . strlen($der) . " CMS(b64) len=" . strlen($cms) . " preview=" . substr($cms, 0, 80));

    // validación base64 estricta
    if (base64_decode($cms, true) === false) {
      throw new RuntimeException("CMS generado no es base64 válido (raro).");
    }

    return $cms;
  }

  private static function runCmd(array $cmd, ?array $env): array
  {
    $desc = [
      0 => ['pipe', 'r'],
      1 => ['pipe', 'w'],
      2 => ['pipe', 'w'],
    ];
    $p = proc_open($cmd, $desc, $pipes, null, $env);
    if (!is_resource($p)) return [1, '', 'proc_open failed'];

    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]); fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]); fclose($pipes[2]);
    $code = proc_close($p);

    return [$code, (string)$stdout, (string)$stderr];
  }
}
