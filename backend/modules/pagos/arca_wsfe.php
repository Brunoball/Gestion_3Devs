<?php
// backend/modules/pagos/arca_wsfe.php
declare(strict_types=1);

final class ArcaWsfe
{
  private SoapClient $client;

  public function __construct(string $wsfeWsdl, bool $sslVerify = true)
  {
    $ctx = stream_context_create([
      'ssl' => [
        'verify_peer' => $sslVerify,
        'verify_peer_name' => $sslVerify,
      ],
    ]);

    $this->client = new SoapClient($wsfeWsdl, [
      'soap_version' => SOAP_1_1,
      'exceptions' => true,
      'trace' => false,
      'cache_wsdl' => WSDL_CACHE_NONE,
      'connection_timeout' => 30,
      'stream_context' => $ctx,
    ]);
  }

  /** @return array */
  public function FECompUltimoAutorizado(array $auth, int $ptoVta, int $cbteTipo): array
  {
    $resp = $this->client->FECompUltimoAutorizado([
      'Auth' => $auth,
      'PtoVta' => $ptoVta,
      'CbteTipo' => $cbteTipo,
    ]);

    $r = $resp->FECompUltimoAutorizadoResult ?? null;
    if (!$r) throw new RuntimeException("WSFE sin FECompUltimoAutorizadoResult");

    if (!empty($r->Errors)) {
      throw new RuntimeException("WSFE Error (FECompUltimoAutorizado): " . self::formatErrors($r->Errors));
    }

    return json_decode(json_encode($r), true) ?: [];
  }

  /** @return array */
  public function FECAESolicitar(array $auth, array $feCAEReq): array
  {
    $resp = $this->client->FECAESolicitar([
      'Auth' => $auth,
      'FeCAEReq' => $feCAEReq,
    ]);

    $r = $resp->FECAESolicitarResult ?? null;
    if (!$r) throw new RuntimeException("WSFE sin FECAESolicitarResult");

    if (!empty($r->Errors)) {
      throw new RuntimeException("WSFE Error (FECAESolicitar): " . self::formatErrors($r->Errors));
    }

    return json_decode(json_encode($r), true) ?: [];
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
}
