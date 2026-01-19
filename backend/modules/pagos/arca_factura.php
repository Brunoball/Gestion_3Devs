<?php
// backend/modules/pagos/arca_factura.php
declare(strict_types=1);

require_once __DIR__ . '/arca_wsaa.php';
require_once __DIR__ . '/arca_wsfe.php';

function pagos_factura_arca(): void
{
  global $pdo;

  require_method('POST');
  $in = read_json_body();

  $id_pago   = isset($in['id_pago']) && is_numeric($in['id_pago']) ? (int)$in['id_pago'] : 0;
  $doc_tipo  = isset($in['doc_tipo']) && is_numeric($in['doc_tipo']) ? (int)$in['doc_tipo'] : 0;
  $doc_nro   = isset($in['doc_nro']) && is_numeric($in['doc_nro']) ? (int)$in['doc_nro'] : 0;
  $cbte_tipo = isset($in['cbte_tipo']) && is_numeric($in['cbte_tipo']) ? (int)$in['cbte_tipo'] : 0;
  $pto_vta   = isset($in['pto_vta']) && is_numeric($in['pto_vta']) ? (int)$in['pto_vta'] : 0;

  // ✅ NUEVO: fechas período desde el modal (YYYYMMDD)
  $periodo_desde = isset($in['periodo_desde']) ? preg_replace('/\D+/', '', (string)$in['periodo_desde']) : '';
  $periodo_hasta = isset($in['periodo_hasta']) ? preg_replace('/\D+/', '', (string)$in['periodo_hasta']) : '';
  $vto_pago      = isset($in['vto_pago'])      ? preg_replace('/\D+/', '', (string)$in['vto_pago'])      : '';

  if ($id_pago <= 0) json_error("Falta id_pago");
  if (!in_array($doc_tipo, [80, 96], true)) json_error("doc_tipo inválido (80=CUIT, 96=DNI)");
  if ($doc_nro <= 0) json_error("doc_nro inválido");
  if ($pto_vta <= 0) json_error("pto_vta inválido (obligatorio)");

  // Por ahora fijo a Factura C
  if ($cbte_tipo !== 11) {
    json_error("Por ahora, este endpoint está configurado para FACTURA C (11).");
  }

  // ✅ Validación simple de fechas si vienen
  // (No las hago obligatorias para no romper nada; pero si vienen, deben ser válidas)
  $isYmd8 = static function (string $s): bool {
    return (bool)preg_match('/^\d{8}$/', $s);
  };

  if ($periodo_desde !== '' && !$isYmd8($periodo_desde)) json_error("periodo_desde inválido (debe ser YYYYMMDD)");
  if ($periodo_hasta !== '' && !$isYmd8($periodo_hasta)) json_error("periodo_hasta inválido (debe ser YYYYMMDD)");
  if ($vto_pago      !== '' && !$isYmd8($vto_pago))      json_error("vto_pago inválido (debe ser YYYYMMDD)");

  // si vienen desde/hasta, validar orden
  if ($isYmd8($periodo_desde) && $isYmd8($periodo_hasta) && $periodo_hasta < $periodo_desde) {
    json_error("Período inválido: periodo_hasta no puede ser menor que periodo_desde");
  }

  // 1) Buscar el pago
  $sql = "
    SELECT
      p.id_pago, p.id_sistema, p.id_mes, p.id_medio_pago, p.monto, p.fecha_pago,
      cs.id_cliente, cs.nombre AS sistema, cs.descripcion AS sistema_desc,
      c.nombre AS cliente
    FROM pagos p
    INNER JOIN clientes_sistemas cs ON cs.id_sistema = p.id_sistema
    INNER JOIN clientes c ON c.id_cliente = cs.id_cliente
    WHERE p.id_pago = :id
    LIMIT 1
  ";
  $st = $pdo->prepare($sql);
  $st->execute([':id' => $id_pago]);
  $p = $st->fetch(PDO::FETCH_ASSOC);

  if (!$p) json_error("No existe el pago (id_pago=$id_pago)");

  $importe = isset($p['monto']) ? (float)$p['monto'] : 0.0;
  if ($importe <= 0) json_error("El pago tiene monto inválido (<=0)");

  // 2) Config ARCA
  $cfg = require __DIR__ . '/arca_config.php';

  $mode = (string)($cfg['mode'] ?? 'homo');
  $mode = strtolower(trim($mode));
  if (!in_array($mode, ['homo', 'prod'], true)) $mode = 'homo';

  $cuit = (int)($cfg['cuit'] ?? 0);
  if ($cuit <= 0) json_error("Config ARCA inválida: CUIT emisor faltante");

  $certPath = (string)($cfg['cert_path'] ?? '');
  $keyPath  = (string)($cfg['key_path'] ?? '');
  $keyPass  = (string)($cfg['key_pass'] ?? '');
  $wsn      = (string)($cfg['wsn'] ?? 'wsfe');

  // defaults
  $concepto = (int)($cfg['defaults']['concepto'] ?? 2);
  $moneda   = (string)($cfg['defaults']['moneda'] ?? 'PES');
  $cotiz    = (float)($cfg['defaults']['cotiz'] ?? 1.0);

  // SSL / CA / logs
  $caFile    = (string)($cfg['ca_file'] ?? '');
  $fallback  = (bool)($cfg['ssl_fallback_if_fail'] ?? false);
  $debugLog  = (bool)($cfg['debug_log'] ?? false);

  // verify flags (opcionales en tu config)
  $sslVerifyWsaa = (bool)($cfg['wsaa_ssl_verify'] ?? true);
  $sslVerifyWsfe = (bool)($cfg['wsfe_ssl_verify'] ?? true);

  // ✅ WSAA remoto
  $wsaaWsdl = (string)($cfg['wsaa'][$mode] ?? '');

  // ✅ WSFE: WSDL local + endpoint remoto
  $wsfeWsdl     = (string)($cfg['wsfe'][$mode . '_wsdl'] ?? '');
  $wsfeEndpoint = (string)($cfg['wsfe'][$mode . '_endpoint'] ?? '');

  // Validaciones mínimas de archivos/paths
  if ($wsaaWsdl === '' || $wsfeWsdl === '' || $wsfeEndpoint === '') {
    json_error("Config ARCA inválida: endpoints wsaa/wsfe faltan (mode=$mode)");
  }
  if (!file_exists($certPath)) json_error("No existe cert_path: $certPath");
  if (!file_exists($keyPath))  json_error("No existe key_path: $keyPath");
  if (!file_exists($wsfeWsdl)) json_error("No existe WSFE WSDL local: $wsfeWsdl");

  // ✅ LOG útil (solo si debug)
  if ($debugLog) {
    error_log("[ARCA] mode=$mode cuit=$cuit pto_vta=$pto_vta cbte_tipo=$cbte_tipo doc_tipo=$doc_tipo doc_nro=$doc_nro imp=$importe");
    error_log("[ARCA] WSAA wsdl=$wsaaWsdl (sslVerify=" . ($sslVerifyWsaa ? '1' : '0') . ")");
    error_log("[ARCA] WSFE wsdl(local)=$wsfeWsdl endpoint=$wsfeEndpoint (sslVerify=" . ($sslVerifyWsfe ? '1' : '0') . ")");
    if ($caFile !== '') error_log("[ARCA] CA file=$caFile");

    // ✅ log de fechas del modal (si vienen)
    if ($periodo_desde || $periodo_hasta || $vto_pago) {
      error_log("[ARCA] fechas modal: desde=$periodo_desde hasta=$periodo_hasta vto_pago=$vto_pago");
    }
  }

  // 3) WSAA login (token+sign)
  try {
    $ta = ArcaWsaa::login(
      $wsaaWsdl,
      $wsn,
      $certPath,
      $keyPath,
      $keyPass,
      $sslVerifyWsaa,
      $caFile,
      $fallback,
      $debugLog
    );
  } catch (Throwable $e) {
    json_error("ARCA WSAA: no pude obtener Ticket de Acceso. Detalle: " . $e->getMessage());
  }

  // 4) WSFE emitir CAE
  try {
    $wsfe = new ArcaWsfe($wsfeWsdl, $wsfeEndpoint, $sslVerifyWsfe, $caFile, $debugLog);

    $auth = [
      'Token' => $ta['token'],
      'Sign'  => $ta['sign'],
      'Cuit'  => $cuit,
    ];

    // último comprobante
    $ult = $wsfe->FECompUltimoAutorizado($auth, $pto_vta, $cbte_tipo);
    $lastNro = (int)($ult['CbteNro'] ?? 0);
    $cbte_nro = $lastNro + 1;

    // fecha comprobante
    $fecha = (string)($p['fecha_pago'] ?? date('Y-m-d'));
    $fecha = substr($fecha, 0, 10);
    $dt = DateTime::createFromFormat('Y-m-d', $fecha) ?: new DateTime();
    $fecha_cbte = $dt->format('Ymd');

    $impTotal = round($importe, 2);
    $impNeto  = $impTotal;

    $det = [
      'Concepto'    => $concepto,
      'DocTipo'     => $doc_tipo,
      'DocNro'      => $doc_nro,
      'CbteDesde'   => $cbte_nro,
      'CbteHasta'   => $cbte_nro,
      'CbteFch'     => $fecha_cbte,

      'ImpTotal'    => $impTotal,
      'ImpTotConc'  => 0.0,
      'ImpNeto'     => $impNeto,
      'ImpOpEx'     => 0.0,
      'ImpIVA'      => 0.0,
      'ImpTrib'     => 0.0,

      'MonId'       => $moneda,
      'MonCotiz'    => $cotiz,
    ];

    // ✅ Servicios (concepto 2 o 3): usar fechas del MODAL si vienen, sino fallback a fecha_cbte
    if (in_array($concepto, [2, 3], true)) {
      $fDesde = $isYmd8($periodo_desde) ? $periodo_desde : $fecha_cbte;
      $fHasta = $isYmd8($periodo_hasta) ? $periodo_hasta : $fecha_cbte;
      $fVto   = $isYmd8($vto_pago)      ? $vto_pago      : $fecha_cbte;

      // Seguridad extra: si por alguna razón quedaron invertidas, corregimos a fecha_cbte
      if ($fHasta < $fDesde) {
        $fDesde = $fecha_cbte;
        $fHasta = $fecha_cbte;
      }

      $det['FchServDesde'] = $fDesde;
      $det['FchServHasta'] = $fHasta;
      $det['FchVtoPago']   = $fVto;
    }

    $feCAEReq = [
      'FeCabReq' => [
        'CantReg'  => 1,
        'PtoVta'   => $pto_vta,
        'CbteTipo' => $cbte_tipo,
      ],
      'FeDetReq' => [
        'FECAEDetRequest' => [$det],
      ],
    ];

    $res = $wsfe->FECAESolicitar($auth, $feCAEReq);

    $detWrap = $res['FeDetResp'] ?? [];
    $detResp = $detWrap['FECAEDetResponse'][0] ?? $detWrap['FECAEDetResponse'] ?? null;
    if (!$detResp) json_error("WSFE: respuesta sin detalle (FECAEDetResponse)");

    $resultado = (string)($detResp['Resultado'] ?? '');
    if ($resultado !== 'A') {
      $obs = $detResp['Observaciones'] ?? null;
      $msgObs = '';

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

      json_error("ARCA rechazó el comprobante (Resultado=$resultado) $msgObs");
    }

    $cae = (string)($detResp['CAE'] ?? '');
    $cae_vto = (string)($detResp['CAEFchVto'] ?? '');
    if ($cae === '' || $cae_vto === '') json_error("WSFE: CAE o Vto CAE vacío");

    // QR AFIP/ARCA
    $qrPayload = [
      'ver' => 1,
      'fecha' => $dt->format('Y-m-d'),
      'cuit' => $cuit,
      'ptoVta' => $pto_vta,
      'tipoCmp' => $cbte_tipo,
      'nroCmp' => $cbte_nro,
      'importe' => $impTotal,
      'moneda' => $moneda,
      'ctz' => $cotiz,
      'tipoDocRec' => $doc_tipo,
      'nroDocRec' => $doc_nro,
      'tipoCodAut' => 'E',
      'codAut' => $cae,
    ];

    $qrJson = json_encode($qrPayload, JSON_UNESCAPED_UNICODE);
    $qrB64 = base64_encode($qrJson ?: '{}');
    $qrUrl = 'https://www.afip.gob.ar/fe/qr/?p=' . $qrB64;

    json_ok([
      'exito' => true,
      'factura' => [
        'modo' => $mode,
        'cuit_emisor' => $cuit,
        'pto_vta' => $pto_vta,
        'cbte_tipo' => $cbte_tipo,
        'cbte_nro' => $cbte_nro,
        'fecha_cbte' => $fecha_cbte,
        'cae' => $cae,
        'cae_vto' => $cae_vto,
        'doc_tipo' => $doc_tipo,
        'doc_nro' => $doc_nro,
        'importe' => $impTotal,
        'moneda' => $moneda,
        'cotiz' => $cotiz,
        'qr_url' => $qrUrl,
        'id_pago' => $id_pago,
        'id_sistema' => (int)$p['id_sistema'],
        'cliente' => (string)($p['cliente'] ?? ''),
        'sistema' => (string)($p['sistema'] ?? ''),
        'sistema_desc' => (string)($p['sistema_desc'] ?? ''),

        // ✅ DEVUELVO TAMBIÉN EL PERÍODO QUE SE USÓ (útil para PDF)
        'periodo_desde' => $isYmd8($periodo_desde) ? $periodo_desde : '',
        'periodo_hasta' => $isYmd8($periodo_hasta) ? $periodo_hasta : '',
        'vto_pago'      => $isYmd8($vto_pago)      ? $vto_pago      : '',
      ],
    ]);
  } catch (Throwable $e) {
    json_error("ARCA WSFE: no pude emitir CAE. Detalle: " . $e->getMessage());
  }
}
