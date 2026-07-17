<?php
// backend/modules/pagos/factura_guardar_pdf.php
declare(strict_types=1);

function pagos_factura_guardar_pdf(): void
{
  global $pdo;

  require_method('POST');
  pagos_require_write();
  $orgId = pagos_org_id();
  $orgCode = strtolower(preg_replace('/[^a-z0-9_-]+/i', '_', pagos_org_code()) ?: 'org_' . $orgId);

  if (!($pdo instanceof PDO)) json_error('Conexión PDO no disponible.');

  $metaRaw = $_POST['meta'] ?? '';
  if (!is_string($metaRaw) || trim($metaRaw) === '') json_error("Falta campo 'meta' (JSON).");
  $meta = json_decode($metaRaw, true);
  if (!is_array($meta)) json_error("Campo 'meta' inválido (no JSON).");
  if (!isset($_FILES['pdf']) || !is_array($_FILES['pdf'])) json_error("Falta archivo 'pdf'.");

  $file = $_FILES['pdf'];
  if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
    json_error('Error subiendo PDF.', ['upload_error' => (int)($file['error'] ?? -1)]);
  }

  $tmp = (string)($file['tmp_name'] ?? '');
  if ($tmp === '' || !is_uploaded_file($tmp)) json_error('Archivo PDF inválido.');
  if ((int)($file['size'] ?? 0) > 15 * 1024 * 1024) json_error('El PDF supera el límite de 15 MB.');

  if (function_exists('finfo_open')) {
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo ? (string)finfo_file($finfo, $tmp) : '';
    if ($finfo) finfo_close($finfo);
    if ($mime !== '' && stripos($mime, 'pdf') === false) json_error('El archivo subido no parece ser un PDF.');
  }

  $idPago = isset($meta['id_pago']) && is_numeric($meta['id_pago']) ? (int)$meta['id_pago'] : 0;
  $idSistema = isset($meta['id_sistema']) && is_numeric($meta['id_sistema']) ? (int)$meta['id_sistema'] : 0;
  $anio = isset($meta['anio']) && is_numeric($meta['anio']) ? (int)$meta['anio'] : 0;
  $idMes = isset($meta['id_mes']) && is_numeric($meta['id_mes']) ? (int)$meta['id_mes'] : 0;

  if ($idPago <= 0 && $idSistema <= 0) json_error('Falta id_pago o id_sistema.');
  if ($anio < 2000 || $anio > 2100) json_error('Año inválido.');
  if ($idMes < 1 || $idMes > 12) json_error('Mes inválido.');

  $idCliente = 0;
  if ($idPago > 0) {
    $st = $pdo->prepare("\n      SELECT p.id_sistema, cs.id_cliente\n      FROM pagos p\n      INNER JOIN clientes_sistemas cs\n        ON cs.id_organizacion = p.id_organizacion\n       AND cs.id_sistema = p.id_sistema\n      WHERE p.id_organizacion = :org AND p.id_pago = :pago\n      LIMIT 1\n    ");
    $st->execute([':org' => $orgId, ':pago' => $idPago]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) json_error('El pago no pertenece a la organización activa.');
    $idSistema = $idSistema > 0 ? $idSistema : (int)$row['id_sistema'];
    $idCliente = (int)$row['id_cliente'];
  }

  if ($idSistema > 0) {
    $st = $pdo->prepare("\n      SELECT id_cliente\n      FROM clientes_sistemas\n      WHERE id_organizacion = :org AND id_sistema = :sistema\n      LIMIT 1\n    ");
    $st->execute([':org' => $orgId, ':sistema' => $idSistema]);
    $clienteSistema = (int)($st->fetchColumn() ?: 0);
    if ($clienteSistema <= 0) json_error('El sistema no pertenece a la organización activa.');
    if ($idCliente > 0 && $idCliente !== $clienteSistema) json_error('El pago y el sistema pertenecen a clientes distintos.');
    $idCliente = $clienteSistema;
  }

  $solicitadosRaw = is_array($meta['sistemas_facturar_ids'] ?? null)
    ? $meta['sistemas_facturar_ids']
    : [$idSistema];
  $sistemasSolicitados = [];
  foreach ($solicitadosRaw as $valor) {
    if (!is_numeric($valor)) continue;
    $sistemaSolicitado = (int)$valor;
    if ($sistemaSolicitado > 0) $sistemasSolicitados[] = $sistemaSolicitado;
  }
  $sistemasSolicitados = array_values(array_unique($sistemasSolicitados));
  if (!$sistemasSolicitados && $idSistema > 0) $sistemasSolicitados = [$idSistema];
  if (!$sistemasSolicitados) json_error('Tenés que seleccionar al menos un sistema para facturar.');

  $st = $pdo->prepare("
    SELECT id_sistema
    FROM clientes_sistemas
    WHERE id_organizacion = :org
      AND id_cliente = :cliente
      AND estado = 'activo'
    ORDER BY id_sistema
  ");
  $st->execute([':org' => $orgId, ':cliente' => $idCliente]);
  $sistemasActivos = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN) ?: []);
  if (!$sistemasActivos) json_error('El cliente no tiene sistemas activos en la organización.');

  $sistemasInvalidos = array_values(array_diff($sistemasSolicitados, $sistemasActivos));
  if ($sistemasInvalidos) {
    json_error('Uno o más sistemas seleccionados no pertenecen al cliente o no están activos.', [
      'sistemas_invalidos' => $sistemasInvalidos,
    ]);
  }
  $sistemas = $sistemasSolicitados;

  $itemsFacturacion = is_array($meta['items_facturacion'] ?? null)
    ? array_values($meta['items_facturacion'])
    : [];
  $idsPermitidos = array_fill_keys($sistemas, true);
  $totalItems = 0.0;
  foreach ($itemsFacturacion as $indice => $item) {
    if (!is_array($item)) json_error('Hay un ítem de facturación inválido.', ['indice' => $indice]);

    $montoItem = 0.0;
    if (isset($item['ars']) && is_numeric($item['ars'])) {
      $montoItem = (float)$item['ars'];
      if ($montoItem < 0) json_error('Los ítems de facturación no pueden tener montos negativos.');
      $totalItems += $montoItem;
    }

    $referencias = [];
    if (isset($item['id_sistema']) && is_numeric($item['id_sistema'])) {
      $referencias[] = (int)$item['id_sistema'];
    }
    if (isset($item['sistema_id']) && is_numeric($item['sistema_id'])) {
      $referencias[] = (int)$item['sistema_id'];
    }
    if (is_array($item['sistemas_ids'] ?? null)) {
      foreach ($item['sistemas_ids'] as $referencia) {
        if (is_numeric($referencia)) $referencias[] = (int)$referencia;
      }
    }
    $referencias = array_values(array_unique(array_filter(
      $referencias,
      static fn(int $referencia): bool => $referencia > 0
    )));
    $modoItem = strtolower(trim((string)($item['modo'] ?? 'global')));
    if ($montoItem > 0 && !$referencias) {
      json_error(
        $modoItem === 'por_sistema'
          ? 'Un ítem personalizado no indica a qué sistema corresponde.'
          : 'Un ítem global no indica entre qué sistemas debe distribuirse.',
        ['indice' => $indice]
      );
    }
    foreach ($referencias as $referencia) {
      if (!isset($idsPermitidos[$referencia])) {
        json_error('Un ítem de la factura referencia un sistema no seleccionado.', [
          'indice' => $indice,
          'id_sistema' => $referencia,
        ]);
      }
    }
  }

  $montoArs = isset($meta['monto_ars']) && is_numeric($meta['monto_ars'])
    ? round((float)$meta['monto_ars'], 2)
    : 0.0;
  $totalArs = isset($meta['total_ars']) && is_numeric($meta['total_ars'])
    ? round((float)$meta['total_ars'], 2)
    : $montoArs;
  if ($montoArs <= 0 && $totalArs > 0) $montoArs = $totalArs;
  if ($totalArs <= 0 && $montoArs > 0) $totalArs = $montoArs;
  if ($montoArs <= 0 || $totalArs <= 0) json_error('El total de la factura debe ser mayor a cero.');
  if (abs($montoArs - $totalArs) > 0.01) json_error('El importe y el total de la factura no coinciden.');
  if ($itemsFacturacion && abs(round($totalItems, 2) - $totalArs) > 0.01) {
    json_error('La suma de los ítems no coincide con el total de la factura.', [
      'total_items' => round($totalItems, 2),
      'total_factura' => $totalArs,
    ]);
  }

  $desgloseFactura = pagos_desglose_desde_items_factura($itemsFacturacion);
  if (!$desgloseFactura || abs(round(array_sum($desgloseFactura), 2) - $totalArs) > 0.01) {
    json_error('No se pudo obtener un desglose exacto por sistema para la factura.');
  }
  $sistemasSinMonto = [];
  foreach ($sistemas as $sistemaFacturado) {
    if (round((float)($desgloseFactura[$sistemaFacturado] ?? 0), 2) <= 0) {
      $sistemasSinMonto[] = $sistemaFacturado;
    }
  }
  if ($sistemasSinMonto) {
    json_error('Todos los sistemas seleccionados deben tener al menos un importe asignado.', [
      'sistemas_sin_monto' => $sistemasSinMonto,
    ]);
  }
  try {
    $itemsJson = json_encode($itemsFacturacion, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
  } catch (JsonException $e) {
    json_error('No se pudo serializar el detalle de la factura.');
  }

  $estadoFactura = strtolower(trim((string)($meta['estado'] ?? 'solo_pdf')));
  if (!in_array($estadoFactura, ['solo_pdf', 'emitida'], true)) {
    json_error('Estado de factura inválido.');
  }
  $caeFactura = trim((string)($meta['cae'] ?? ''));
  $caeFacturaReal = $caeFactura !== '' && !preg_match('/^0+$/', $caeFactura);
  $cbteNumeroFactura = isset($meta['cbte_nro']) && is_numeric($meta['cbte_nro'])
    ? (int)$meta['cbte_nro']
    : 0;
  if ($estadoFactura === 'emitida' && (!$caeFacturaReal || $cbteNumeroFactura <= 0)) {
    json_error('Una factura emitida debe incluir CAE y número de comprobante válidos.');
  }

  $baseDir = __DIR__ . '/../../uploads/facturas/' . $orgCode . '/' . $anio . '/' . str_pad((string)$idMes, 2, '0', STR_PAD_LEFT);
  if (!is_dir($baseDir) && !@mkdir($baseDir, 0775, true) && !is_dir($baseDir)) {
    json_error('No se pudo crear el directorio de facturas.');
  }

  $originalName = (string)($file['name'] ?? 'factura.pdf');
  $safeName = preg_replace('/[^a-zA-Z0-9_.-]+/', '_', $originalName) ?: 'factura.pdf';
  if (!preg_match('/\.pdf$/i', $safeName)) $safeName .= '.pdf';
  $finalName = bin2hex(random_bytes(8)) . '_' . $safeName;
  $destAbs = $baseDir . '/' . $finalName;
  if (!@move_uploaded_file($tmp, $destAbs)) json_error('No se pudo guardar el PDF en el servidor.');

  $baseUrl = 'https://app.3devsnet.com/api/uploads/facturas';
  $urlPath = $baseUrl . '/' . rawurlencode($orgCode) . '/' . $anio . '/' . str_pad((string)$idMes, 2, '0', STR_PAD_LEFT) . '/' . rawurlencode($finalName);

  $paramsCommon = [
    ':estado' => $estadoFactura,
    ':monto_ars' => $montoArs,
    ':doc_tipo' => isset($meta['doc_tipo']) && is_numeric($meta['doc_tipo']) ? (int)$meta['doc_tipo'] : null,
    ':doc_nro' => isset($meta['doc_nro']) ? preg_replace('/\D+/', '', (string)$meta['doc_nro']) : null,
    ':cbte_tipo' => isset($meta['cbte_tipo']) && is_numeric($meta['cbte_tipo']) ? (int)$meta['cbte_tipo'] : null,
    ':pto_vta' => isset($meta['pto_vta']) && is_numeric($meta['pto_vta']) ? (int)$meta['pto_vta'] : null,
    ':cae' => isset($meta['cae']) ? (string)$meta['cae'] : null,
    ':cae_vto' => isset($meta['cae_vto']) ? (string)$meta['cae_vto'] : null,
    ':cbte_nro' => isset($meta['cbte_nro']) && is_numeric($meta['cbte_nro']) ? (int)$meta['cbte_nro'] : null,
    ':fecha_cbte' => isset($meta['fecha_cbte']) ? (string)$meta['fecha_cbte'] : null,
    ':pdf_path' => $urlPath,
    ':items_json' => $itemsJson,
    ':usd_rate' => isset($meta['usd_rate']) && is_numeric($meta['usd_rate']) ? (float)$meta['usd_rate'] : null,
    ':total_usd' => isset($meta['total_usd']) && is_numeric($meta['total_usd']) ? (float)$meta['total_usd'] : null,
    ':total_ars' => $totalArs,
    ':periodo_desde' => isset($meta['periodo_desde']) ? (string)$meta['periodo_desde'] : null,
    ':periodo_hasta' => isset($meta['periodo_hasta']) ? (string)$meta['periodo_hasta'] : null,
    ':vto_pago' => isset($meta['vto_pago']) ? (string)$meta['vto_pago'] : null,
  ];

  $dbCommitted = false;
  try {
    $pdo->beginTransaction();

    $find = $pdo->prepare("\n      SELECT id_factura, estado, cae, cbte_nro, cbte_tipo, pto_vta, pdf_path\n      FROM facturas\n      WHERE id_organizacion = :org\n        AND id_sistema = :sistema\n        AND anio = :anio\n        AND id_mes = :mes\n      ORDER BY id_factura DESC\n      LIMIT 1\n      FOR UPDATE\n    ");
    $update = $pdo->prepare("\n      UPDATE facturas SET\n        estado=:estado, monto_ars=:monto_ars, doc_tipo=:doc_tipo, doc_nro=:doc_nro,\n        cbte_tipo=:cbte_tipo, pto_vta=:pto_vta, cae=:cae, cae_vto=:cae_vto,\n        cbte_nro=:cbte_nro, fecha_cbte=:fecha_cbte, pdf_path=:pdf_path,\n        items_facturacion_json=:items_json, usd_rate=:usd_rate, total_usd=:total_usd,\n        total_ars=:total_ars, periodo_desde=:periodo_desde, periodo_hasta=:periodo_hasta,\n        vto_pago=:vto_pago, created_at=NOW()\n      WHERE id_organizacion=:org AND id_factura=:factura\n      LIMIT 1\n    ");
    $insert = $pdo->prepare("\n      INSERT INTO facturas (\n        id_organizacion,id_sistema,anio,id_mes,estado,monto_ars,doc_tipo,doc_nro,cbte_tipo,pto_vta,\n        cae,cae_vto,cbte_nro,fecha_cbte,pdf_path,items_facturacion_json,usd_rate,total_usd,total_ars,\n        periodo_desde,periodo_hasta,vto_pago,created_at\n      ) VALUES (\n        :org,:sistema,:anio,:mes,:estado,:monto_ars,:doc_tipo,:doc_nro,:cbte_tipo,:pto_vta,\n        :cae,:cae_vto,:cbte_nro,:fecha_cbte,:pdf_path,:items_json,:usd_rate,:total_usd,:total_ars,\n        :periodo_desde,:periodo_hasta,:vto_pago,NOW()\n      )\n    ");
    $link = $pdo->prepare("\n      UPDATE pagos SET id_factura = :factura\n      WHERE id_organizacion = :org\n        AND id_sistema = :sistema\n        AND anio_periodo = :anio\n        AND id_mes = :mes\n        AND (id_factura IS NULL OR id_factura = 0)\n    ");

    $guardadas = [];
    $pdfAnteriores = [];
    foreach ($sistemas as $sistemaId) {
      $find->execute([':org' => $orgId, ':sistema' => $sistemaId, ':anio' => $anio, ':mes' => $idMes]);
      $existente = $find->fetch(PDO::FETCH_ASSOC) ?: null;
      $facturaId = $existente ? (int)$existente['id_factura'] : 0;

      if ($facturaId > 0) {
        $caeExistente = trim((string)($existente['cae'] ?? ''));
        $caeExistenteReal = $caeExistente !== '' && !preg_match('/^0+$/', $caeExistente);
        $estadoExistente = strtolower(trim((string)($existente['estado'] ?? '')));
        $esFiscalExistente = $caeExistenteReal || $estadoExistente === 'emitida';

        if ($esFiscalExistente) {
          $mismaFacturaFiscal = $estadoFactura === 'emitida'
            && $caeFacturaReal
            && hash_equals($caeExistente, $caeFactura)
            && (int)($existente['cbte_nro'] ?? 0) === $cbteNumeroFactura
            && (int)($existente['cbte_tipo'] ?? 0) === (int)($meta['cbte_tipo'] ?? 0)
            && (int)($existente['pto_vta'] ?? 0) === (int)($meta['pto_vta'] ?? 0);
          if (!$mismaFacturaFiscal) {
            throw new LogicException(
              'Ya existe una factura emitida para uno de los sistemas y el período. No puede reemplazarse sin Nota de Crédito.'
            );
          }
        }

        $pdfAnterior = trim((string)($existente['pdf_path'] ?? ''));
        if ($pdfAnterior !== '' && $pdfAnterior !== $urlPath) $pdfAnteriores[] = $pdfAnterior;
        $update->execute($paramsCommon + [':org' => $orgId, ':factura' => $facturaId]);
      } else {
        $insert->execute($paramsCommon + [':org' => $orgId, ':sistema' => $sistemaId, ':anio' => $anio, ':mes' => $idMes]);
        $facturaId = (int)$pdo->lastInsertId();
      }
      $link->execute([':factura' => $facturaId, ':org' => $orgId, ':sistema' => $sistemaId, ':anio' => $anio, ':mes' => $idMes]);
      $guardadas[] = ['id_factura' => $facturaId, 'id_sistema' => $sistemaId];
    }

    $pdo->commit();
    $dbCommitted = true;

    foreach (array_values(array_unique($pdfAnteriores)) as $pdfAnterior) {
      try {
        $stReferences = $pdo->prepare('SELECT COUNT(*) FROM facturas WHERE id_organizacion = :org AND pdf_path = :pdf_path');
        $stReferences->execute([':org' => $orgId, ':pdf_path' => $pdfAnterior]);
        if ((int)$stReferences->fetchColumn() === 0) {
          $rutaAnterior = pagos_factura_ruta_local_segura($pdfAnterior);
          if ($rutaAnterior !== null && is_file($rutaAnterior)) @unlink($rutaAnterior);
        }
      } catch (Throwable $cleanupError) {
        error_log('No se pudo limpiar un PDF anterior: ' . $cleanupError->getMessage());
      }
    }

    json_ok([
      'exito' => true,
      'mensaje' => 'Factura guardada dentro de la organización activa.',
      'pdf_url' => $urlPath,
      'id_cliente' => $idCliente,
      'replicadas' => count($guardadas),
      'inserted' => $guardadas,
    ]);
  } catch (LogicException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if (!$dbCommitted) @unlink($destAbs);
    json_error($e->getMessage());
  } catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if (!$dbCommitted) @unlink($destAbs);
    if ((int)($e->errorInfo[1] ?? 0) === 1062) {
      json_error('La factura ya fue guardada para uno de los sistemas y el período seleccionado. Recargá la pantalla.');
    }
    json_error('Error DB al guardar factura.', ['error' => $e->getMessage()]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if (!$dbCommitted) @unlink($destAbs);
    json_error('Error DB al guardar factura.', ['error' => $e->getMessage()]);
  }
}
