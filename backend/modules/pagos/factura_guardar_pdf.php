<?php
// backend/modules/pagos/factura_guardar_pdf.php
declare(strict_types=1);

function pagos_factura_guardar_pdf(): void
{
  global $pdo;

  // ✅ debe ser POST multipart/form-data
  require_method('POST');

  if (!($pdo instanceof PDO)) {
    json_error("Conexión PDO no disponible.");
  }

  // meta llega como campo de form-data
  $metaRaw = $_POST['meta'] ?? '';
  if (!is_string($metaRaw) || trim($metaRaw) === '') {
    json_error("Falta campo 'meta' (JSON).");
  }

  $meta = json_decode($metaRaw, true);
  if (!is_array($meta)) {
    json_error("Campo 'meta' inválido (no JSON).");
  }

  // pdf llega como archivo
  if (!isset($_FILES['pdf']) || !is_array($_FILES['pdf'])) {
    json_error("Falta archivo 'pdf'.");
  }

  $f = $_FILES['pdf'];

  if (($f['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
    json_error("Error subiendo PDF.", ['upload_error' => (int)($f['error'] ?? -1)]);
  }

  $tmp = $f['tmp_name'] ?? '';
  $origName = (string)($f['name'] ?? 'factura.pdf');

  if ($tmp === '' || !is_uploaded_file($tmp)) {
    json_error("Archivo PDF inválido (tmp_name).");
  }

  // ✅ validar mínimos
  $estado = (string)($meta['estado'] ?? 'solo_pdf');

  $id_pago = isset($meta['id_pago']) && is_numeric($meta['id_pago']) ? (int)$meta['id_pago'] : null;
  $id_sistema = isset($meta['id_sistema']) && is_numeric($meta['id_sistema']) ? (int)$meta['id_sistema'] : null;

  $anio = isset($meta['anio']) && is_numeric($meta['anio']) ? (int)$meta['anio'] : 0;
  $id_mes = isset($meta['id_mes']) && is_numeric($meta['id_mes']) ? (int)$meta['id_mes'] : 0;

  if (!($id_pago || $id_sistema)) json_error("Falta id_pago o id_sistema.");
  if ($anio < 2000 || $anio > 2100) json_error("Año inválido.");
  if ($id_mes < 1 || $id_mes > 12) json_error("Mes inválido.");

  // ✅ destino de archivo - estructura de carpetas
  $baseDir = __DIR__ . '/../../uploads/facturas';
  $subDir = $baseDir . '/' . $anio . '/' . str_pad((string)$id_mes, 2, '0', STR_PAD_LEFT);

  if (!is_dir($subDir)) {
    if (!@mkdir($subDir, 0775, true) && !is_dir($subDir)) {
      json_error("No se pudo crear directorio de facturas.");
    }
  }

  // nombre único para el archivo
  $safeName = preg_replace('/[^a-zA-Z0-9_\-\.]+/', '_', $origName);
  if (!$safeName) $safeName = 'factura.pdf';

  $uniq = bin2hex(random_bytes(8));
  $finalName = $uniq . '_' . $safeName;
  $destAbs = $subDir . '/' . $finalName;

  if (!@move_uploaded_file($tmp, $destAbs)) {
    json_error("No se pudo guardar el PDF en el servidor.");
  }

  // ✅ URL completa para acceder desde la web
  // Ajusta la URL base según tu configuración de Hostinger
  $baseUrl = 'https://app.3devsnet.com/api/uploads/facturas';
  $urlPath = $baseUrl . '/' . $anio . '/' . str_pad((string)$id_mes, 2, '0', STR_PAD_LEFT) . '/' . $finalName;

  // ✅ preparar campos para DB
  $monto_ars = isset($meta['monto_ars']) && is_numeric($meta['monto_ars']) ? (float)$meta['monto_ars'] : 0.0;

  $doc_tipo = isset($meta['doc_tipo']) && is_numeric($meta['doc_tipo']) ? (int)$meta['doc_tipo'] : null;
  $doc_nro  = isset($meta['doc_nro']) ? preg_replace('/\D+/', '', (string)$meta['doc_nro']) : null;
  $cbte_tipo = isset($meta['cbte_tipo']) && is_numeric($meta['cbte_tipo']) ? (int)$meta['cbte_tipo'] : null;
  $pto_vta   = isset($meta['pto_vta']) && is_numeric($meta['pto_vta']) ? (int)$meta['pto_vta'] : null;

  $cae = isset($meta['cae']) ? (string)$meta['cae'] : null;
  $cae_vto = isset($meta['cae_vto']) ? (string)$meta['cae_vto'] : null;
  $cbte_nro = isset($meta['cbte_nro']) && is_numeric($meta['cbte_nro']) ? (int)$meta['cbte_nro'] : null;
  $fecha_cbte = isset($meta['fecha_cbte']) ? (string)$meta['fecha_cbte'] : null;

  $items_facturacion = $meta['items_facturacion'] ?? [];
  $items_json = json_encode(is_array($items_facturacion) ? $items_facturacion : [], JSON_UNESCAPED_UNICODE);

  $usd_rate = isset($meta['usd_rate']) && is_numeric($meta['usd_rate']) ? (float)$meta['usd_rate'] : null;
  $total_usd = isset($meta['total_usd']) && is_numeric($meta['total_usd']) ? (float)$meta['total_usd'] : null;
  $total_ars = isset($meta['total_ars']) && is_numeric($meta['total_ars']) ? (float)$meta['total_ars'] : null;

  $periodo_desde = isset($meta['periodo_desde']) ? (string)$meta['periodo_desde'] : null;
  $periodo_hasta = isset($meta['periodo_hasta']) ? (string)$meta['periodo_hasta'] : null;
  $vto_pago      = isset($meta['vto_pago']) ? (string)$meta['vto_pago'] : null;

  try {
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    $sql = "
      INSERT INTO facturas (
        id_pago, id_sistema, anio, id_mes,
        estado, monto_ars,
        doc_tipo, doc_nro, cbte_tipo, pto_vta,
        cae, cae_vto, cbte_nro, fecha_cbte,
        pdf_path,
        items_facturacion_json,
        usd_rate, total_usd, total_ars,
        periodo_desde, periodo_hasta, vto_pago,
        created_at
      ) VALUES (
        :id_pago, :id_sistema, :anio, :id_mes,
        :estado, :monto_ars,
        :doc_tipo, :doc_nro, :cbte_tipo, :pto_vta,
        :cae, :cae_vto, :cbte_nro, :fecha_cbte,
        :pdf_path,
        :items_json,
        :usd_rate, :total_usd, :total_ars,
        :periodo_desde, :periodo_hasta, :vto_pago,
        NOW()
      )
    ";

    $st = $pdo->prepare($sql);
    $st->execute([
      ':id_pago' => $id_pago,
      ':id_sistema' => $id_sistema,
      ':anio' => $anio,
      ':id_mes' => $id_mes,
      ':estado' => $estado,
      ':monto_ars' => $monto_ars,

      ':doc_tipo' => $doc_tipo,
      ':doc_nro' => $doc_nro,
      ':cbte_tipo' => $cbte_tipo,
      ':pto_vta' => $pto_vta,

      ':cae' => $cae,
      ':cae_vto' => $cae_vto,
      ':cbte_nro' => $cbte_nro,
      ':fecha_cbte' => $fecha_cbte,

      ':pdf_path' => $urlPath,  // ✅ GUARDAMOS URL COMPLETA
      ':items_json' => $items_json,

      ':usd_rate' => $usd_rate,
      ':total_usd' => $total_usd,
      ':total_ars' => $total_ars,

      ':periodo_desde' => $periodo_desde,
      ':periodo_hasta' => $periodo_hasta,
      ':vto_pago' => $vto_pago,
    ]);

    $id_factura = (int)$pdo->lastInsertId();

    json_ok([
      'exito' => true,
      'id_factura' => $id_factura,
      'pdf_url' => $urlPath,  // ✅ Devuelve URL completa
      'mensaje' => 'Factura guardada correctamente con URL completa.',
    ]);
  } catch (Throwable $e) {
    json_error("Error DB al guardar factura.", ['error' => $e->getMessage()]);
  }
}