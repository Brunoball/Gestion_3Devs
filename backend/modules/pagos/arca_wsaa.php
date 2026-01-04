<?php
// backend/modules/pagos/arca_wsaa.php
declare(strict_types=1);

/**
 * WSAA: genera Ticket de Acceso (TA) para consumir WSFEv1
 * Docs WSAA: :contentReference[oaicite:3]{index=3}
 */

final class ArcaWsaa
{
  /** @return array{token:string, sign:string, expirationTime:string} */
  public static function login(string $wsaaWsdl, string $wsn, string $certPath, string $keyPath, string $keyPass = ''): array
  {
    if (!file_exists($certPath)) throw new RuntimeException("No existe cert: $certPath");
    if (!file_exists($keyPath)) throw new RuntimeException("No existe key: $keyPath");

    $tra = self::buildTRA($wsn);
    $cms = self::signTRA($tra, $certPath, $keyPath, $keyPass);

    $client = new SoapClient($wsaaWsdl, [
      'soap_version' => SOAP_1_2,
      'exceptions' => true,
      'trace' => false,
      'cache_wsdl' => WSDL_CACHE_NONE,
      'connection_timeout' => 30,
      'stream_context' => stream_context_create([
        'ssl' => [
          'verify_peer' => true,
          'verify_peer_name' => true,
        ],
      ]),
    ]);

    // WSAA expone loginCms
    $resp = $client->loginCms(['in0' => $cms]);
    $xml = $resp->loginCmsReturn ?? null;
    if (!$xml) throw new RuntimeException("WSAA sin respuesta loginCmsReturn");

    $sx = new SimpleXMLElement($xml);
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

    $xml = <<<XML
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

    return $xml;
  }

  /**
   * Firma TRA en PKCS#7 (CMS) usando openssl_pkcs7_sign.
   * Devuelve el CMS base64 (contenido entre BEGIN/END CMS).
   */
  private static function signTRA(string $traXml, string $certPath, string $keyPath, string $keyPass = ''): string
  {
    $tmpDir = sys_get_temp_dir();
    $in = tempnam($tmpDir, 'tra_') ?: ($tmpDir . '/tra_' . uniqid() . '.xml');
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

    // El archivo viene con headers MIME. Nos quedamos con el bloque base64 del CMS.
    // Buscamos línea en blanco y tomamos todo lo que sigue.
    $parts = preg_split("/\R\R/", $p7, 2);
    $body = $parts[1] ?? $p7;

    $body = trim($body);
    $body = str_replace(["\r", "\n"], "", $body);

    // En algunos entornos aparece con encabezado "-----BEGIN PKCS7-----"
    $body = preg_replace('/-----BEGIN.*?-----/i', '', $body);
    $body = preg_replace('/-----END.*?-----/i', '', $body);
    $body = trim((string)$body);

    if ($body === '') {
      throw new RuntimeException("CMS vacío luego de firmar TRA");
    }

    return $body;
  }
}
