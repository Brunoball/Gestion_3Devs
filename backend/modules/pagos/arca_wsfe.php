<?php
// backend/modules/pagos/arca_wsfe.php
declare(strict_types=1);

/**
 * WSFEv1 (Factura Electrónica v1)
 * Docs: :contentReference[oaicite:4]{index=4}
 */

final class ArcaWsfe
{
  private SoapClient $client;

  public function __construct(string $wsfeWsdl)
  {
    $this->client = new SoapClient($wsfeWsdl, [
      'soap_version' => SOAP_1_2,
      'exceptions' => true,
      'trace' => false,
      'cache_wsdl' => WSDL_CACHE_NONE,
      'connection_timeout' => 30,
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

    // Normalización
    $r = $resp->FECompUltimoAutorizadoResult ?? null;
    if (!$r) throw new RuntimeException("WSFE sin FECompUltimoAutorizadoResult");

    if (isset($r->Errors) && $r->Errors) {
      $msg = self::formatErrors($r->Errors);
      throw new RuntimeException("WSFE Error (FECompUltimoAutorizado): $msg");
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

    if (isset($r->Errors) && $r->Errors) {
      $msg = self::formatErrors($r->Errors);
      throw new RuntimeException("WSFE Error (FECAESolicitar): $msg");
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
