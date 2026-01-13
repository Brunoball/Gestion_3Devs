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
    bool $sslVerify = true
  ): array {
    if (!file_exists($certPath)) throw new RuntimeException("No existe cert: $certPath");
    if (!file_exists($keyPath)) throw new RuntimeException("No existe key: $keyPath");

    $tra = self::buildTRA($wsn);
    $cms = self::signTRA($tra, $certPath, $keyPath, $keyPass);

    $ctx = stream_context_create([
      'ssl' => [
        'verify_peer' => $sslVerify,
        'verify_peer_name' => $sslVerify,
      ],
    ]);

    $client = new SoapClient($wsaaWsdl, [
      'soap_version' => SOAP_1_1,
      'exceptions' => true,
      'trace' => false,
      'cache_wsdl' => WSDL_CACHE_NONE,
      'connection_timeout' => 30,
      'stream_context' => $ctx,
    ]);

    $resp = $client->loginCms(['in0' => $cms]);
    $xml = $resp->loginCmsReturn ?? null;
    if (!$xml) throw new RuntimeException("WSAA sin respuesta loginCmsReturn");

    $sx = @new SimpleXMLElement($xml);
    if (!$sx) throw new RuntimeException("WSAA devolvió XML inválido");

    $token = (string)$sx->credentials->token;
    $sign  = (string)$sx->credentials->sign;
    $exp   = (string)$sx->header->expirationTime;

    if ($token === '' || $sign === '') {
      throw new RuntimeException("WSAA devolvió credenciales vacías");
    }

    return ['token' => $token, 'sign' => $sign, 'expirationTime' => $exp];
  }

  private static function buildTRA(string $wsn): string
  {
    $uniqueId = (string)time();
    $genTime = (new DateTime('-5 minutes'))->format('c');
    $expTime = (new DateTime('+12 hours'))->format('c');

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
   * Firma TRA en PKCS#7 (CMS) usando openssl_pkcs7_sign.
   * Devuelve el CMS base64 (contenido del .p7m sin headers).
   */
  private static function signTRA(string $traXml, string $certPath, string $keyPath, string $keyPass = ''): string
  {
    $tmpDir = sys_get_temp_dir();
    $in  = tempnam($tmpDir, 'tra_') ?: ($tmpDir . '/tra_' . uniqid() . '.xml');
    $out = tempnam($tmpDir, 'cms_') ?: ($tmpDir . '/cms_' . uniqid() . '.p7m');

    file_put_contents($in, $traXml);

    $cert = 'file://' . realpath($certPath);
    $key  = ['file://' . realpath($keyPath), $keyPass];

    $ok = openssl_pkcs7_sign(
      $in,
      $out,
      $cert,
      $key,
      [],
      PKCS7_BINARY | PKCS7_DETACHED
    );

    if (!$ok) {
      @unlink($in);
      @unlink($out);
      throw new RuntimeException("No se pudo firmar TRA (openssl_pkcs7_sign)");
    }

    $p7 = file_get_contents($out) ?: '';
    @unlink($in);
    @unlink($out);

    // Tomar cuerpo después del primer doble salto de línea
    $parts = preg_split("/\R\R/", $p7, 2);
    $body = $parts[1] ?? $p7;

    $body = trim($body);
    $body = str_replace(["\r", "\n"], "", $body);
    $body = preg_replace('/-----BEGIN.*?-----/i', '', (string)$body);
    $body = preg_replace('/-----END.*?-----/i', '', (string)$body);
    $body = trim((string)$body);

    if ($body === '') {
      throw new RuntimeException("CMS vacío luego de firmar TRA");
    }

    return $body;
  }
}
