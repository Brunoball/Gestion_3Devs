<?php
// ✅ REEMPLAZAR COMPLETO
// backend/modules/pagos/factura_guardar_pdf.php
declare(strict_types=1);

if (!function_exists('require_method')) {
  function require_method(string $method): void {
    $m = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($m !== strtoupper($method)) {
      json_error("Método no permitido. Se requiere $method.", ['method' => $m], 405);
    }
  }
}

if (!function_exists('json_ok')) {
  function json_ok(array $payload = []): void {
    if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('json_error')) {
  function json_error(string $message, array $extra = [], int $code = 400): void {
    if (!headers_sent()) {
      http_response_code($code);
      header('Content-Type: application/json; charset=utf-8');
    }
    $out = ['exito' => false, 'error' => $message];
    if ($extra) $out['extra'] = $extra;
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
  }
}

function pagos_factura_guardar_pdf(): void
{
  global $pdo;

  require_method('POST');

  if (!($pdo instanceof PDO)) json_error("Conexión PDO no disponible.");

  $metaRaw = $_POST['meta'] ?? '';
  if (!is_string($metaRaw) || trim($metaRaw) === '') json_error("Falta campo 'meta' (JSON).");

  $meta = json_decode($metaRaw, true);
  if (!is_array($meta)) json_error("Campo 'meta' inválido (no JSON).");

  if (!isset($_FILES['pdf']) || !is_array($_FILES['pdf'])) json_error("Falta archivo 'pdf'.");

  $f = $_FILES['pdf'];
  if (($f['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
    json_error("Error subiendo PDF.", ['upload_error' => (int)($f['error'] ?? -1)]);
  }

  $tmp = (string)($f['tmp_name'] ?? '');
  $origName = (string)($f['name'] ?? 'factura.pdf');
  if ($tmp === '' || !is_uploaded_file($tmp)) json_error("Archivo PDF inválido (tmp_name).");

  $mime = '';
  if (function_exists('finfo_open')) {
    $fi = finfo_open(FILEINFO_MIME_TYPE);
    if ($fi) {
      $mime = (string)finfo_file($fi, $tmp);
      finfo_close($fi);
    }
  }
  if ($mime !== '' && stripos($mime, 'pdf') === false) {
    json_error("El archivo subido no parece ser un PDF.", ['mime' => $mime]);
  }

  $estado = (string)($meta['estado'] ?? 'solo_pdf');
  $aplicarATodos = !isset($meta['aplicar_a_todos_sistemas']) ? true : (bool)$meta['aplicar_a_todos_sistemas'];

  $id_pago    = (isset($meta['id_pago']) && is_numeric($meta['id_pago'])) ? (int)$meta['id_pago'] : null;
  $id_sistema = (isset($meta['id_sistema']) && is_numeric($meta['id_sistema'])) ? (int)$meta['id_sistema'] : null;

  $anio   = (isset($meta['anio']) && is_numeric($meta['anio'])) ? (int)$meta['anio'] : 0;
  $id_mes = (isset($meta['id_mes']) && is_numeric($meta['id_mes'])) ? (int)$meta['id_mes'] : 0;

  if (!($id_pago || $id_sistema)) json_error("Falta id_pago o id_sistema.");
  if ($anio < 2000 || $anio > 2100) json_error("Año inválido.");
  if ($id_mes < 1 || $id_mes > 12) json_error("Mes inválido.");

  $baseDir = __DIR__ . '/../../uploads/facturas';
  $subDir  = $baseDir . '/' . $anio . '/' . str_pad((string)$id_mes, 2, '0', STR_PAD_LEFT);

  if (!is_dir($subDir)) {
    if (!@mkdir($subDir, 0775, true) && !is_dir($subDir)) {
      json_error("No se pudo crear directorio de facturas.", ['dir' => $subDir]);
    }
  }

  $safeName = preg_replace('/[^a-zA-Z0-9_\-\.]+/', '_', $origName);
  if (!$safeName) $safeName = 'factura.pdf';
  if (!preg_match('/\.pdf$/i', $safeName)) $safeName .= '.pdf';

  $uniq = bin2hex(random_bytes(8));
  $finalName = $uniq . '_' . $safeName;
  $destAbs = $subDir . '/' . $finalName;

  if (!@move_uploaded_file($tmp, $destAbs)) {
    json_error("No se pudo guardar el PDF en el servidor.", ['dest' => $destAbs]);
  }

  // ⚠️ Ajustá al dominio real donde servís /api/uploads/
  $baseUrl = 'https://app.3devsnet.com/api/uploads/facturas';
  $urlPath = $baseUrl . '/' . $anio . '/' . str_pad((string)$id_mes, 2, '0', STR_PAD_LEFT) . '/' . $finalName;

  $monto_ars = (isset($meta['monto_ars']) && is_numeric($meta['monto_ars'])) ? (float)$meta['monto_ars'] : 0.0;

  $doc_tipo  = (isset($meta['doc_tipo']) && is_numeric($meta['doc_tipo'])) ? (int)$meta['doc_tipo'] : null;
  $doc_nro   = isset($meta['doc_nro']) ? preg_replace('/\D+/', '', (string)$meta['doc_nro']) : null;
  $cbte_tipo = (isset($meta['cbte_tipo']) && is_numeric($meta['cbte_tipo'])) ? (int)$meta['cbte_tipo'] : null;
  $pto_vta   = (isset($meta['pto_vta']) && is_numeric($meta['pto_vta'])) ? (int)$meta['pto_vta'] : null;

  $cae       = isset($meta['cae']) ? (string)$meta['cae'] : null;
  $cae_vto   = isset($meta['cae_vto']) ? (string)$meta['cae_vto'] : null;
  $cbte_nro  = (isset($meta['cbte_nro']) && is_numeric($meta['cbte_nro'])) ? (int)$meta['cbte_nro'] : null;
  $fecha_cbte = isset($meta['fecha_cbte']) ? (string)$meta['fecha_cbte'] : null;

  $items_facturacion = $meta['items_facturacion'] ?? [];
  $items_json = json_encode(is_array($items_facturacion) ? $items_facturacion : [], JSON_UNESCAPED_UNICODE);

  $usd_rate  = (isset($meta['usd_rate']) && is_numeric($meta['usd_rate'])) ? (float)$meta['usd_rate'] : null;
  $total_usd = (isset($meta['total_usd']) && is_numeric($meta['total_usd'])) ? (float)$meta['total_usd'] : null;
  $total_ars = (isset($meta['total_ars']) && is_numeric($meta['total_ars'])) ? (float)$meta['total_ars'] : null;

  $periodo_desde = isset($meta['periodo_desde']) ? (string)$meta['periodo_desde'] : null;
  $periodo_hasta = isset($meta['periodo_hasta']) ? (string)$meta['periodo_hasta'] : null;
  $vto_pago      = isset($meta['vto_pago']) ? (string)$meta['vto_pago'] : null;

  try {
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    // Resolver id_cliente
    $id_cliente = 0;

    if ($id_sistema) {
      $st = $pdo->prepare("SELECT id_cliente FROM clientes_sistemas WHERE id_sistema = ? LIMIT 1");
      $st->execute([$id_sistema]);
      $id_cliente = (int)($st->fetchColumn() ?: 0);
    } else if ($id_pago) {
      $st = $pdo->prepare("
        SELECT cs.id_cliente, p.id_sistema
        FROM pagos p
        INNER JOIN clientes_sistemas cs ON cs.id_sistema = p.id_sistema
        WHERE p.id_pago = ?
        LIMIT 1
      ");
      $st->execute([$id_pago]);
      $row = $st->fetch(PDO::FETCH_ASSOC);
      $id_cliente = (int)($row['id_cliente'] ?? 0);
      if (!$id_sistema) $id_sistema = (int)($row['id_sistema'] ?? 0);
    }

    if ($id_cliente <= 0) {
      json_error("No se pudo resolver id_cliente para replicar factura.", [
        'id_sistema' => $id_sistema,
        'id_pago' => $id_pago
      ]);
    }

    // Sistemas destino
    $sistemas = [];
    if ($aplicarATodos) {
      $stS = $pdo->prepare("
        SELECT id_sistema
        FROM clientes_sistemas
        WHERE id_cliente = ?
          AND (estado = 'activo' OR estado = 1)
        ORDER BY id_sistema ASC
      ");
      $stS->execute([$id_cliente]);
      $sistemas = array_map('intval', $stS->fetchAll(PDO::FETCH_COLUMN));
    } else {
      $sistemas = $id_sistema ? [(int)$id_sistema] : [];
    }

    if (!count($sistemas)) {
      json_error("El cliente no tiene sistemas activos para replicar.", ['id_cliente' => $id_cliente]);
    }

    $pdo->beginTransaction();

    // ✅ Upsert: si ya existe factura para sistema+periodo, actualiza en vez de duplicar
    $stFind = $pdo->prepare("
      SELECT id_factura
      FROM facturas
      WHERE id_sistema = :id_sistema AND anio = :anio AND id_mes = :id_mes
      ORDER BY created_at DESC, id_factura DESC
      LIMIT 1
    ");

    $stUpd = $pdo->prepare("
      UPDATE facturas
      SET
        estado = :estado,
        monto_ars = :monto_ars,
        doc_tipo = :doc_tipo,
        doc_nro = :doc_nro,
        cbte_tipo = :cbte_tipo,
        pto_vta = :pto_vta,
        cae = :cae,
        cae_vto = :cae_vto,
        cbte_nro = :cbte_nro,
        fecha_cbte = :fecha_cbte,
        pdf_path = :pdf_path,
        items_facturacion_json = :items_json,
        usd_rate = :usd_rate,
        total_usd = :total_usd,
        total_ars = :total_ars,
        periodo_desde = :periodo_desde,
        periodo_hasta = :periodo_hasta,
        vto_pago = :vto_pago,
        created_at = NOW()
      WHERE id_factura = :id_factura
      LIMIT 1
    ");

    $stIns = $pdo->prepare("
      INSERT INTO facturas (
        id_sistema, anio, id_mes,
        estado, monto_ars,
        doc_tipo, doc_nro, cbte_tipo, pto_vta,
        cae, cae_vto, cbte_nro, fecha_cbte,
        pdf_path,
        items_facturacion_json,
        usd_rate, total_usd, total_ars,
        periodo_desde, periodo_hasta, vto_pago,
        created_at
      ) VALUES (
        :id_sistema, :anio, :id_mes,
        :estado, :monto_ars,
        :doc_tipo, :doc_nro, :cbte_tipo, :pto_vta,
        :cae, :cae_vto, :cbte_nro, :fecha_cbte,
        :pdf_path,
        :items_json,
        :usd_rate, :total_usd, :total_ars,
        :periodo_desde, :periodo_hasta, :vto_pago,
        NOW()
      )
    ");

    // ✅ Linkear pago -> factura (si existe pago del período)
    $stLinkPago = $pdo->prepare("
      UPDATE pagos
      SET id_factura = :id_factura
      WHERE id_sistema = :id_sistema
        AND id_mes = :id_mes
        AND YEAR(fecha_pago) = :anio
        AND (id_factura IS NULL OR id_factura = 0)
    ");

    $inserted = [];

    foreach ($sistemas as $sid) {
      // si existe, update; si no, insert
      $stFind->execute([':id_sistema' => $sid, ':anio' => $anio, ':id_mes' => $id_mes]);
      $existingId = (int)($stFind->fetchColumn() ?: 0);

      $params = [
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
        ':pdf_path' => $urlPath,
        ':items_json' => $items_json,
        ':usd_rate' => $usd_rate,
        ':total_usd' => $total_usd,
        ':total_ars' => $total_ars,
        ':periodo_desde' => $periodo_desde,
        ':periodo_hasta' => $periodo_hasta,
        ':vto_pago' => $vto_pago,
      ];

      if ($existingId > 0) {
        $stUpd->execute($params + [':id_factura' => $existingId]);
        $facturaId = $existingId;
      } else {
        $stIns->execute($params + [
          ':id_sistema' => $sid,
          ':anio' => $anio,
          ':id_mes' => $id_mes,
        ]);
        $facturaId = (int)$pdo->lastInsertId();
      }

      // ✅ link pago del período (si existe)
      $stLinkPago->execute([
        ':id_factura' => $facturaId,
        ':id_sistema' => $sid,
        ':id_mes' => $id_mes,
        ':anio' => $anio,
      ]);

      $inserted[] = [
        'id_factura' => $facturaId,
        'id_sistema' => (int)$sid,
      ];
    }

    $pdo->commit();

    json_ok([
      'exito' => true,
      'mensaje' => 'Factura guardada (upsert) y linkeada a pagos por período.',
      'pdf_url' => $urlPath,
      'id_cliente' => $id_cliente,
      'estado' => $estado,
      'replicadas' => count($inserted),
      'inserted' => $inserted,
    ]);
  } catch (Throwable $e) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
    json_error("Error DB al guardar factura.", ['error' => $e->getMessage()]);
  }
}