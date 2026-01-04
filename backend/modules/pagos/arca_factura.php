<?php
// backend/modules/pagos/arca_factura.php
declare(strict_types=1);

require_once __DIR__ . '/arca_wsaa.php';
require_once __DIR__ . '/arca_wsfe.php';

/**
 * POST /api.php?action=pagos&op=factura_arca
 * Body JSON:
 * {
 *   "id_pago": 123,
 *   "doc_tipo": 80|96,
 *   "doc_nro": 2030...,
 *   "cbte_tipo": 11|6|1,
 *   "pto_vta": 1
 * }
 *
 * Devuelve:
 * { exito:true, factura:{...} }
 */

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

  if ($id_pago <= 0) json_error("Falta id_pago");
  if (!in_array($doc_tipo, [80, 96], true)) json_error("doc_tipo inválido (80=CUIT, 96=DNI)");
  if ($doc_nro <= 0) json_error("doc_nro inválido");
  if (!in_array($cbte_tipo, [11, 6, 1], true)) json_error("cbte_tipo inválido");
  if ($pto_vta <= 0) json_error("pto_vta inválido (obligatorio)");

  // ⚠️ En este módulo dejamos “perfecto” para Factura C (11) sin IVA detallado.
  // Para A/B necesitás IVA y/o condición fiscal (si querés lo sumamos después).
  if ($cbte_tipo !== 11) {
    json_error("Por ahora, el endpoint está configurado para FACTURA C (11). Para A/B agregamos IVA y datos fiscales.");
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

  $mode = $cfg['mode'] ?? 'homo';
  if (!in_array($mode, ['homo', 'prod'], true)) $mode = 'homo';

  $cuit = (int)($cfg['cuit'] ?? 0);
  if ($cuit <= 0) json_error("Config ARCA inválida: CUIT emisor faltante");

  $certPath = (string)($cfg['cert_path'] ?? '');
  $keyPath  = (string)($cfg['key_path'] ?? '');
  $keyPass  = (string)($cfg['key_pass'] ?? '');
  $wsn      = (string)($cfg['wsn'] ?? 'wsfe');

  $wsaaWsdl = (string)($cfg['wsaa'][$mode] ?? '');
  $wsfeWsdl = (string)($cfg['wsfe'][$mode] ?? '');
  if ($wsaaWsdl === '' || $wsfeWsdl === '') json_error("Config ARCA inválida: endpoints wsaa/wsfe faltan");

  $concepto = (int)($cfg['defaults']['concepto'] ?? 2);
  $moneda   = (string)($cfg['defaults']['moneda'] ?? 'PES');
  $cotiz    = (float)($cfg['defaults']['cotiz'] ?? 1.0);

  // 3) WSAA login (token+sign)
  try {
    $ta = ArcaWsaa::login($wsaaWsdl, $wsn, $certPath, $keyPath, $keyPass);
  } catch (Throwable $e) {
    json_error("ARCA WSAA: no pude obtener Ticket de Acceso", ['error' => $e->getMessage()]);
  }

  // 4) WSFE emitir CAE
  try {
    $wsfe = new ArcaWsfe($wsfeWsdl);

    $auth = [
      'Token' => $ta['token'],
      'Sign'  => $ta['sign'],
      'Cuit'  => $cuit,
    ];

    // Último comprobante autorizado para numerar
    $ult = $wsfe->FECompUltimoAutorizado($auth, $pto_vta, $cbte_tipo);
    $lastNro = (int)($ult['CbteNro'] ?? 0);
    $cbte_nro = $lastNro + 1;

    // Fecha comprobante (AAAAMMDD)
    $fecha = (string)($p['fecha_pago'] ?? date('Y-m-d'));
    $fecha = substr($fecha, 0, 10);
    $dt = DateTime::createFromFormat('Y-m-d', $fecha) ?: new DateTime();
    $fecha_cbte = $dt->format('Ymd');

    // Factura C sin IVA detallado:
    $impTotal = round($importe, 2);
    $impNeto  = $impTotal;

    $feCAEReq = [
      'FeCabReq' => [
        'CantReg' => 1,
        'PtoVta'  => $pto_vta,
        'CbteTipo'=> $cbte_tipo,
      ],
      'FeDetReq' => [
        'FECAEDetRequest' => [
          [
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

            // Para servicios a veces se requieren FchServDesde/Hasta/VtoPago.
            // Si te lo pide ARCA, lo agregamos. Por default lo dejamos vacío.
          ]
        ],
      ],
    ];

    $res = $wsfe->FECAESolicitar($auth, $feCAEReq);

    $cab = $res['FeCabResp'] ?? [];
    $detWrap = $res['FeDetResp'] ?? [];
    $det = $detWrap['FECAEDetResponse'][0] ?? $detWrap['FECAEDetResponse'] ?? null;

    if (!$det) {
      json_error("WSFE: respuesta sin detalle (FECAEDetResponse)");
    }

    $resultado = (string)($det['Resultado'] ?? '');
    if ($resultado !== 'A') {
      // Observaciones
      $obs = $det['Observaciones'] ?? null;
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

      json_error("ARCA rechazó el comprobante (Resultado=$resultado) $msgObs", [
        'wsfe' => ['cab' => $cab, 'det' => $det],
      ]);
    }

    $cae = (string)($det['CAE'] ?? '');
    $cae_vto = (string)($det['CAEFchVto'] ?? '');

    if ($cae === '' || $cae_vto === '') {
      json_error("WSFE: CAE o Vto CAE vacío", ['wsfe' => ['det' => $det]]);
    }

    // 5) QR oficial (URL)
    // Especificación QR: :contentReference[oaicite:5]{index=5}
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

    // Respuesta al frontend
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

        // datos útiles para tu PDF
        'id_pago' => $id_pago,
        'id_sistema' => (int)$p['id_sistema'],
        'cliente' => (string)($p['cliente'] ?? ''),
        'sistema' => (string)($p['sistema'] ?? ''),
        'sistema_desc' => (string)($p['sistema_desc'] ?? ''),
      ],
    ]);

  } catch (Throwable $e) {
    json_error("ARCA WSFE: no pude emitir CAE", ['error' => $e->getMessage()]);
  }
}
