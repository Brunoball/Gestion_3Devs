<?php
// backend/modules/pagos/arca_nota_credito.php
// Emisión de Nota de Crédito ARCA (WSFE) asociada a una factura con CAE.
// Lo usa pagos_factura_anular_con_nc() en pagos.php.
declare(strict_types=1);

require_once __DIR__ . '/arca_wsaa.php';
require_once __DIR__ . '/arca_wsfe.php';

/**
 * Normaliza una fecha a YYYYMMDD (formato ARCA).
 * Acepta: YYYYMMDD, YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, DD-MM-YYYY y datetime.
 * Devuelve '' si no se puede interpretar.
 */
function pagos_arca_fecha_ymd8($value): string
{
  $s = trim((string)($value ?? ''));
  if ($s === '') return '';

  if (preg_match('/^(\d{4})(\d{2})(\d{2})$/', $s, $m)) {
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? $s : '';
  }
  if (preg_match('/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/', $s, $m)) {
    [$y, $mo, $d] = [(int)$m[1], (int)$m[2], (int)$m[3]];
    return checkdate($mo, $d, $y) ? sprintf('%04d%02d%02d', $y, $mo, $d) : '';
  }
  if (preg_match('/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/', $s, $m)) {
    [$d, $mo, $y] = [(int)$m[1], (int)$m[2], (int)$m[3]];
    return checkdate($mo, $d, $y) ? sprintf('%04d%02d%02d', $y, $mo, $d) : '';
  }

  $t = strtotime($s);
  return $t !== false ? date('Ymd', $t) : '';
}

/** Tipo de Nota de Crédito que corresponde a cada tipo de factura. */
function pagos_arca_tipo_nc_para_factura(int $cbteTipoFactura): int
{
  $map = [
    1  => 3,   // Factura A  → NC A
    6  => 8,   // Factura B  → NC B
    11 => 13,  // Factura C  → NC C
    51 => 53,  // Factura M  → NC M
  ];
  if (!isset($map[$cbteTipoFactura])) {
    throw new RuntimeException("No hay Nota de Crédito configurada para el tipo de comprobante $cbteTipoFactura.");
  }
  return $map[$cbteTipoFactura];
}

/**
 * Emite en ARCA una Nota de Crédito por el total de la factura original.
 * Lanza RuntimeException ante cualquier error (el llamador hace rollback y avisa).
 *
 * @param array  $factura Fila de `facturas` (con cbte_tipo, pto_vta, cbte_nro, cae, fecha_cbte,
 *                        doc_tipo, doc_nro, total_ars/monto_ars, periodo_desde/hasta).
 * @param string $motivo  Motivo de la anulación (se guarda localmente).
 * @return array Datos de la NC autorizada (mismo formato que guarda pagos.php en json_arca).
 */
function pagos_emitir_nota_credito_arca(array $factura, string $motivo): array
{
  // --- Datos de la factura original ---
  $factTipo = (int)($factura['cbte_tipo'] ?? 0);
  $ptoVta   = (int)($factura['pto_vta'] ?? 0);
  $factNro  = (int)($factura['cbte_nro'] ?? 0);
  $factFch  = pagos_arca_fecha_ymd8($factura['fecha_cbte'] ?? '');
  $docTipo  = (int)($factura['doc_tipo'] ?? 0);
  $docNro   = (int)preg_replace('/\D+/', '', (string)($factura['doc_nro'] ?? ''));
  $totalArs = (float)($factura['total_ars'] ?? 0);
  $importe  = round($totalArs > 0 ? $totalArs : (float)($factura['monto_ars'] ?? 0), 2);

  if ($factTipo <= 0 || $ptoVta <= 0 || $factNro <= 0) {
    throw new RuntimeException('La factura original no tiene tipo, punto de venta o número válidos.');
  }
  if ($importe <= 0) throw new RuntimeException('La factura original no tiene un importe válido.');
  if ($docTipo <= 0 || $docNro <= 0) {
    throw new RuntimeException('La factura original no tiene documento del receptor válido.');
  }

  $ncTipo = pagos_arca_tipo_nc_para_factura($factTipo);

  // --- Config ARCA (la misma que usa la emisión de facturas) ---
  $cfg = require __DIR__ . '/arca_config.php';

  $mode = strtolower(trim((string)($cfg['mode'] ?? 'homo')));
  if (!in_array($mode, ['homo', 'prod'], true)) $mode = 'homo';

  $cuit = (int)($cfg['cuit'] ?? 0);
  if ($cuit <= 0) throw new RuntimeException('Config ARCA inválida: CUIT emisor faltante.');

  $certPath = (string)($cfg['cert_path'] ?? '');
  $keyPath  = (string)($cfg['key_path'] ?? '');
  $keyPass  = (string)($cfg['key_pass'] ?? '');
  $wsn      = (string)($cfg['wsn'] ?? 'wsfe');

  $concepto = (int)($cfg['defaults']['concepto'] ?? 2);
  $moneda   = (string)($cfg['defaults']['moneda'] ?? 'PES');
  $cotiz    = (float)($cfg['defaults']['cotiz'] ?? 1.0);

  $caFile        = (string)($cfg['ca_file'] ?? '');
  $fallback      = (bool)($cfg['ssl_fallback_if_fail'] ?? false);
  $debugLog      = (bool)($cfg['debug_log'] ?? false);
  $sslVerifyWsaa = (bool)($cfg['wsaa_ssl_verify'] ?? true);
  $sslVerifyWsfe = (bool)($cfg['wsfe_ssl_verify'] ?? true);

  $wsaaWsdl     = (string)($cfg['wsaa'][$mode] ?? '');
  $wsfeWsdl     = (string)($cfg['wsfe'][$mode . '_wsdl'] ?? '');
  $wsfeEndpoint = (string)($cfg['wsfe'][$mode . '_endpoint'] ?? '');

  if ($wsaaWsdl === '' || $wsfeWsdl === '' || $wsfeEndpoint === '') {
    throw new RuntimeException("Config ARCA inválida: endpoints wsaa/wsfe faltan (mode=$mode).");
  }
  if (!file_exists($certPath)) throw new RuntimeException("No existe cert_path: $certPath");
  if (!file_exists($keyPath))  throw new RuntimeException("No existe key_path: $keyPath");
  if (!file_exists($wsfeWsdl)) throw new RuntimeException("No existe WSFE WSDL local: $wsfeWsdl");

  // --- Login WSAA ---
  try {
    $ta = ArcaWsaa::login(
      $wsaaWsdl, $wsn, $certPath, $keyPath, $keyPass,
      $sslVerifyWsaa, $caFile, $fallback, $debugLog
    );
  } catch (Throwable $e) {
    throw new RuntimeException('ARCA WSAA: no pude obtener Ticket de Acceso. Detalle: ' . $e->getMessage());
  }

  $auth = [
    'Token' => $ta['token'],
    'Sign'  => $ta['sign'],
    'Cuit'  => $cuit,
  ];

  // --- WSFE: número siguiente y solicitud de CAE ---
  $wsfe = new ArcaWsfe($wsfeWsdl, $wsfeEndpoint, $sslVerifyWsfe, $caFile, $debugLog);

  $ult = $wsfe->FECompUltimoAutorizado($auth, $ptoVta, $ncTipo);
  $ncNro = (int)($ult['CbteNro'] ?? 0) + 1;

  $hoy = new DateTimeImmutable('now', new DateTimeZone('America/Argentina/Buenos_Aires'));
  $fechaNc = $hoy->format('Ymd');

  $det = [
    'Concepto'   => $concepto,
    'DocTipo'    => $docTipo,
    'DocNro'     => $docNro,
    'CbteDesde'  => $ncNro,
    'CbteHasta'  => $ncNro,
    'CbteFch'    => $fechaNc,
    'ImpTotal'   => $importe,
    'ImpTotConc' => 0.0,
    'ImpNeto'    => $importe,
    'ImpOpEx'    => 0.0,
    'ImpIVA'     => 0.0,
    'ImpTrib'    => 0.0,
    'MonId'      => $moneda,
    'MonCotiz'   => $cotiz,
  ];

  // Servicios (concepto 2/3): mismo período de servicio que la factura original.
  if (in_array($concepto, [2, 3], true)) {
    $desde = pagos_arca_fecha_ymd8($factura['periodo_desde'] ?? '') ?: ($factFch ?: $fechaNc);
    $hasta = pagos_arca_fecha_ymd8($factura['periodo_hasta'] ?? '') ?: ($factFch ?: $fechaNc);
    if ($hasta < $desde) $hasta = $desde;
    $det['FchServDesde'] = $desde;
    $det['FchServHasta'] = $hasta;
    // El vencimiento de pago no puede ser anterior a la fecha de la NC.
    $det['FchVtoPago'] = $fechaNc;
  }

  // Comprobante asociado (obligatorio en Notas de Crédito).
  $cbteAsoc = [
    'Tipo'   => $factTipo,
    'PtoVta' => $ptoVta,
    'Nro'    => $factNro,
    'Cuit'   => (string)$cuit,
  ];
  if ($factFch !== '') $cbteAsoc['CbteFch'] = $factFch;
  $det['CbtesAsoc'] = ['CbteAsoc' => [$cbteAsoc]];

  $feCAEReq = [
    'FeCabReq' => [
      'CantReg'  => 1,
      'PtoVta'   => $ptoVta,
      'CbteTipo' => $ncTipo,
    ],
    'FeDetReq' => [
      'FECAEDetRequest' => [$det],
    ],
  ];

  if ($debugLog) {
    error_log("[ARCA NC] mode=$mode pto_vta=$ptoVta nc_tipo=$ncTipo nc_nro=$ncNro asoc=$factTipo-$ptoVta-$factNro imp=$importe");
  }

  $res = $wsfe->FECAESolicitar($auth, $feCAEReq);

  $detWrap = $res['FeDetResp'] ?? [];
  $detResp = $detWrap['FECAEDetResponse'][0] ?? $detWrap['FECAEDetResponse'] ?? null;
  if (!$detResp) throw new RuntimeException('WSFE: respuesta sin detalle (FECAEDetResponse).');

  $resultado = (string)($detResp['Resultado'] ?? '');
  if ($resultado !== 'A') {
    $msgObs = '';
    $obs = $detResp['Observaciones'] ?? null;
    if ($obs) {
      $o = json_decode(json_encode($obs), true);
      $items = $o['Obs'] ?? $o ?? [];
      if (isset($items['Code']) || isset($items['Msg'])) $items = [$items];
      $tmp = [];
      foreach ((array)$items as $it) {
        $tmp[] = trim(($it['Code'] ?? '') . ' ' . ($it['Msg'] ?? ''));
      }
      $msgObs = implode(' | ', array_filter($tmp));
    }
    throw new RuntimeException("ARCA rechazó la Nota de Crédito (Resultado=$resultado) $msgObs");
  }

  $cae    = (string)($detResp['CAE'] ?? '');
  $caeVto = (string)($detResp['CAEFchVto'] ?? '');
  if ($cae === '' || $caeVto === '') throw new RuntimeException('WSFE: CAE o Vto CAE vacío en la Nota de Crédito.');

  // QR ARCA de la NC
  $qrPayload = [
    'ver'        => 1,
    'fecha'      => $hoy->format('Y-m-d'),
    'cuit'       => $cuit,
    'ptoVta'     => $ptoVta,
    'tipoCmp'    => $ncTipo,
    'nroCmp'     => $ncNro,
    'importe'    => $importe,
    'moneda'     => $moneda,
    'ctz'        => $cotiz,
    'tipoDocRec' => $docTipo,
    'nroDocRec'  => $docNro,
    'tipoCodAut' => 'E',
    'codAut'     => $cae,
  ];
  $qrUrl = 'https://www.afip.gob.ar/fe/qr/?p=' . base64_encode(json_encode($qrPayload, JSON_UNESCAPED_UNICODE) ?: '{}');

  return [
    'modo'        => $mode,
    'cuit_emisor' => $cuit,
    'pto_vta'     => $ptoVta,
    'cbte_tipo'   => $ncTipo,
    'cbte_nro'    => $ncNro,
    'fecha_cbte'  => $fechaNc,
    'cae'         => $cae,
    'cae_vto'     => $caeVto,
    'doc_tipo'    => $docTipo,
    'doc_nro'     => $docNro,
    'importe'     => $importe,
    'moneda'      => $moneda,
    'cotiz'       => $cotiz,
    'motivo'      => $motivo,
    'qr_url'      => $qrUrl,
    'cbtes_asoc'  => [[
      'Tipo'    => $factTipo,
      'PtoVta'  => $ptoVta,
      'Nro'     => $factNro,
      'CbteFch' => $factFch,
    ]],
  ];
}
