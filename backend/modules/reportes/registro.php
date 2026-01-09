<?php
// backend/modules/reportes/registro.php
declare(strict_types=1);

global $pdo;

$op = $_GET['op'] ?? '';

/* =========================
   Helpers JSON
========================= */
if (!function_exists('repreg_json_ok')) {
  function repreg_json_ok(array $extra = []): void {
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['exito' => true], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}
if (!function_exists('repreg_json_fail')) {
  function repreg_json_fail(string $mensaje, array $extra = []): void {
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['exito' => false, 'mensaje' => $mensaje], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('repreg_req_method')) {
  function repreg_req_method(): string {
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
  }
}

if (!function_exists('repreg_int')) {
  function repreg_int(string $key, int $default = 0): int {
    $v = $_GET[$key] ?? null;
    if ($v === null || $v === '') return $default;
    return (int)$v;
  }
}

if (!function_exists('repreg_read_json_body')) {
  function repreg_read_json_body(): array {
    $raw = file_get_contents('php://input');
    $raw = is_string($raw) ? trim($raw) : '';
    if ($raw === '') return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
  }
}

if (!function_exists('repreg_is_multipart')) {
  function repreg_is_multipart(): bool {
    $ct = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
    $ct = strtolower((string)$ct);
    return str_contains($ct, 'multipart/form-data');
  }
}

/* =========================
   Paths (API ROOT)
========================= */
if (!function_exists('repreg_api_root')) {
  function repreg_api_root(): string {
    $apiRoot = realpath(__DIR__ . '/../../'); // api/
    if (!$apiRoot) $apiRoot = __DIR__ . '/../../';
    return rtrim($apiRoot, DIRECTORY_SEPARATOR);
  }
}

if (!function_exists('repreg_abs_path_from_api_rel')) {
  function repreg_abs_path_from_api_rel(string $apiRelPath): string {
    $apiRoot = repreg_api_root();
    $rel = ltrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $apiRelPath), DIRECTORY_SEPARATOR);
    return $apiRoot . DIRECTORY_SEPARATOR . $rel;
  }
}

/* =========================
   Public base URL: https://dominio.com/api
========================= */
if (!function_exists('repreg_public_api_base')) {
  function repreg_public_api_base(): string {
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    $scheme = $https ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';

    $script = (string)($_SERVER['SCRIPT_NAME'] ?? '');
    $basePath = '/api';

    $pos = strpos($script, '/api/');
    if ($pos !== false) {
      $basePath = substr($script, 0, $pos + 4);
    } else {
      $basePath = rtrim(dirname($script), '/');
      if ($basePath === '') $basePath = '/api';
    }

    if (str_ends_with($basePath, '/api/routes')) {
      $basePath = '/api';
    }

    return $scheme . '://' . $host . $basePath;
  }
}

/* =========================
   Extraer "uploads/..." aunque en DB haya URL completa
========================= */
if (!function_exists('repreg_extract_uploads_rel')) {
  function repreg_extract_uploads_rel(?string $pathOrUrl): string {
    $p = trim((string)$pathOrUrl);
    if ($p === '') return '';

    if (preg_match('~^https?://~i', $p)) {
      $u = parse_url($p);
      $path = (string)($u['path'] ?? '');
      $ix = stripos($path, '/uploads/');
      if ($ix !== false) {
        return ltrim(substr($path, $ix + 1), '/'); // uploads/...
      }
      return '';
    }

    $p = ltrim($p, '/');
    $ix2 = stripos($p, 'uploads/');
    if ($ix2 !== false) {
      return substr($p, $ix2);
    }

    return $p;
  }
}

if (!function_exists('repreg_delete_file_if_exists')) {
  function repreg_delete_file_if_exists(?string $pathOrUrl): void {
    $rel = repreg_extract_uploads_rel($pathOrUrl);
    if ($rel === '') return;

    $abs = repreg_abs_path_from_api_rel($rel);
    if (file_exists($abs)) {
      @unlink($abs);
    }
  }
}

/* =========================
   Upload genérico a subcarpeta
   Guarda URL pública completa en DB
========================= */
if (!function_exists('repreg_upload_to_subdir')) {
  function repreg_upload_to_subdir(string $subdir, string $fieldName = 'comprobante'): ?string {
    if (!isset($_FILES[$fieldName])) return null;

    $f = $_FILES[$fieldName];
    if (!is_array($f) || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
      return null;
    }

    $err = (int)($f['error'] ?? UPLOAD_ERR_OK);
    if ($err !== UPLOAD_ERR_OK) {
      throw new RuntimeException('Error subiendo archivo. Código: ' . $err);
    }

    $tmp  = (string)($f['tmp_name'] ?? '');
    $orig = (string)($f['name'] ?? 'archivo');
    $size = (int)($f['size'] ?? 0);

    if ($tmp === '' || !is_uploaded_file($tmp)) {
      throw new RuntimeException('Archivo inválido o no subido correctamente.');
    }

    $maxBytes = 8 * 1024 * 1024; // 8MB
    if ($size <= 0 || $size > $maxBytes) {
      throw new RuntimeException('El archivo debe pesar entre 1 byte y 8MB.');
    }

    $ext = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
    $allowedExt = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
    if (!in_array($ext, $allowedExt, true)) {
      throw new RuntimeException('Tipo de archivo no permitido. Solo PDF o imágenes (JPG/PNG/WEBP).');
    }
    if ($ext === 'jpeg') $ext = 'jpg';

    $mime = '';
    if (function_exists('mime_content_type')) {
      $mime = (string)(mime_content_type($tmp) ?: '');
    }
    $allowedMime = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ];
    if ($mime !== '' && !in_array($mime, $allowedMime, true)) {
      throw new RuntimeException('Tipo MIME no permitido: ' . $mime);
    }

    $safeBase = preg_replace('/[^a-zA-Z0-9_-]+/', '_', pathinfo($orig, PATHINFO_FILENAME));
    $safeBase = trim((string)$safeBase, '_');
    if ($safeBase === '') $safeBase = 'comprobante';

    $stamp = date('Ymd_His');
    $rand  = bin2hex(random_bytes(5));
    $fileName = "{$stamp}_{$rand}_{$safeBase}.{$ext}";

    $subdir = trim($subdir, "/\\");
    $destDir = repreg_abs_path_from_api_rel('uploads/' . $subdir);

    if (!is_dir($destDir)) {
      if (!mkdir($destDir, 0775, true) && !is_dir($destDir)) {
        throw new RuntimeException('No se pudo crear la carpeta api/uploads/' . $subdir);
      }
    }

    $destPath = rtrim($destDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $fileName;

    if (!move_uploaded_file($tmp, $destPath)) {
      throw new RuntimeException('No se pudo guardar el archivo en el servidor.');
    }

    $publicBase = repreg_public_api_base(); // https://dominio.com/api
    $publicUrl  = $publicBase . '/uploads/' . $subdir . '/' . $fileName;

    return $publicUrl;
  }
}

try {
  if (!($pdo instanceof PDO)) repreg_json_fail('Conexión PDO no disponible.');

  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  if ($op === '') repreg_json_fail('Falta parámetro op en reportes');

  if (!in_array($op, [
    'movimientos',
    'registros',
    'crear_egreso',
    'editar_movimiento',
    'eliminar_egreso',
    'pago_comprobante', // ✅ NUEVO
  ], true)) {
    repreg_json_fail('op no válida en registros: ' . $op);
  }

  /* =========================
     ✅ NUEVO: COMPROBANTE DE PAGO (POST multipart)
  ========================= */
  if ($op === 'pago_comprobante') {
    if (repreg_req_method() !== 'POST') repreg_json_fail('Método no permitido. Se esperaba POST');
    if (!repreg_is_multipart()) repreg_json_fail('Se esperaba multipart/form-data (archivo).');

    $body = $_POST ?? [];

    $id = $body['id'] ?? null;
    if (!is_numeric($id)) repreg_json_fail('ID inválido.');
    $idInt = (int)$id;
    if ($idInt <= 0) repreg_json_fail('ID inválido.');

    $stCur = $pdo->prepare("SELECT comprobante FROM pagos WHERE id_pago = :id LIMIT 1");
    $stCur->execute([':id' => $idInt]);
    $cur = $stCur->fetch(PDO::FETCH_ASSOC);
    if (!$cur) repreg_json_fail('El pago no existe.');

    $curComp = (string)($cur['comprobante'] ?? '');
    $newComp = $curComp !== '' ? $curComp : null;

    $deleteComp = (string)($body['delete_comprobante'] ?? '0');
    $wantsDelete = ($deleteComp === '1' || strtolower($deleteComp) === 'true');

    $uploadedUrl = null;
    try {
      $uploadedUrl = repreg_upload_to_subdir('pagos', 'comprobante'); // ✅ api/uploads/pagos
    } catch (Throwable $upErr) {
      repreg_json_fail('Comprobante: ' . $upErr->getMessage());
    }

    if ($wantsDelete) {
      if ($curComp !== '') repreg_delete_file_if_exists($curComp);
      $newComp = null;
    }

    if ($uploadedUrl) {
      if ($curComp !== '') repreg_delete_file_if_exists($curComp);
      $newComp = $uploadedUrl;
    }

    if (!$wantsDelete && !$uploadedUrl) {
      repreg_json_fail('No se recibió archivo ni se solicitó eliminar.');
    }

    $stUp = $pdo->prepare("UPDATE pagos SET comprobante = :c WHERE id_pago = :id");
    $stUp->execute([
      ':c' => $newComp,
      ':id' => $idInt,
    ]);

    repreg_json_ok([
      'mensaje' => 'Comprobante de pago actualizado.',
      'comprobante' => $newComp ?? '',
    ]);
  }

  /* =========================
     CREAR EGRESO (POST)
  ========================= */
  if ($op === 'crear_egreso') {
    if (repreg_req_method() !== 'POST') repreg_json_fail('Método no permitido. Se esperaba POST');

    $body = repreg_is_multipart() ? ($_POST ?? []) : repreg_read_json_body();

    $fecha       = (string)($body['fecha'] ?? '');
    $concepto    = trim((string)($body['concepto'] ?? ''));
    $descripcion = trim((string)($body['descripcion'] ?? ''));
    $monto       = $body['monto'] ?? null;
    $idMedio     = $body['id_medio_pago'] ?? null;

    if ($fecha === '') repreg_json_fail('La fecha es obligatoria.');
    if ($concepto === '') repreg_json_fail('El concepto es obligatorio.');
    if (!is_numeric($monto)) repreg_json_fail('El monto debe ser numérico.');

    $montoNum = (float)$monto;
    if ($montoNum <= 0) repreg_json_fail('El monto debe ser mayor a 0.');

    $idMedioInt = null;
    if ($idMedio !== null && $idMedio !== '') {
      if (!is_numeric($idMedio)) repreg_json_fail('El id_medio_pago debe ser numérico o null.');
      $idMedioInt = (int)$idMedio;
      if ($idMedioInt <= 0) $idMedioInt = null;
    }

    $rutaComprobante = null;
    if (repreg_is_multipart()) {
      try {
        $rutaComprobante = repreg_upload_to_subdir('egresos', 'comprobante');
      } catch (Throwable $upErr) {
        repreg_json_fail('Comprobante: ' . $upErr->getMessage());
      }
    }

    $sql = "INSERT INTO egresos (fecha, concepto, descripcion, monto, id_medio_pago, comprobante)
            VALUES (:fecha, :concepto, :descripcion, :monto, :id_medio_pago, :comprobante)";
    $st = $pdo->prepare($sql);
    $st->execute([
      ':fecha' => $fecha,
      ':concepto' => $concepto,
      ':descripcion' => ($descripcion !== '' ? $descripcion : null),
      ':monto' => $montoNum,
      ':id_medio_pago' => $idMedioInt,
      ':comprobante' => $rutaComprobante,
    ]);

    $newId = (int)$pdo->lastInsertId();

    repreg_json_ok([
      'id' => $newId,
      'comprobante' => $rutaComprobante,
      'mensaje' => 'Egreso creado correctamente.'
    ]);
  }

  /* =========================
     EDITAR MOVIMIENTO (POST)
  ========================= */
  if ($op === 'editar_movimiento') {
    if (repreg_req_method() !== 'POST') repreg_json_fail('Método no permitido. Se esperaba POST');

    $isMp = repreg_is_multipart();
    $body = $isMp ? ($_POST ?? []) : repreg_read_json_body();

    $tipo = (string)($body['tipo'] ?? '');
    $id = $body['id'] ?? null;

    if ($tipo === '') repreg_json_fail('Falta tipo.');
    if (!is_numeric($id)) repreg_json_fail('ID inválido.');

    $idInt = (int)$id;
    if ($idInt <= 0) repreg_json_fail('ID inválido.');

    $idMedio = $body['id_medio_pago'] ?? null;
    $idMedioInt = null;
    if ($idMedio !== null && $idMedio !== '') {
      if (!is_numeric($idMedio)) repreg_json_fail('El id_medio_pago debe ser numérico o null.');
      $idMedioInt = (int)$idMedio;
      if ($idMedioInt <= 0) $idMedioInt = null;
    }

    if ($tipo === 'egreso') {
      $fecha = (string)($body['fecha'] ?? '');
      $concepto = trim((string)($body['concepto'] ?? ''));
      $descripcion = trim((string)($body['descripcion'] ?? ''));
      $monto = $body['monto'] ?? null;

      if ($fecha === '') repreg_json_fail('La fecha es obligatoria.');
      if ($concepto === '') repreg_json_fail('El concepto es obligatorio.');
      if (!is_numeric($monto)) repreg_json_fail('El monto debe ser numérico.');

      $montoNum = (float)$monto;
      if ($montoNum <= 0) repreg_json_fail('El monto debe ser mayor a 0.');

      $stCur = $pdo->prepare("SELECT comprobante FROM egresos WHERE id_egreso = :id LIMIT 1");
      $stCur->execute([':id' => $idInt]);
      $cur = $stCur->fetch(PDO::FETCH_ASSOC);
      if (!$cur) repreg_json_fail('El egreso no existe.');

      $curComp = (string)($cur['comprobante'] ?? '');
      $newComp = $curComp !== '' ? $curComp : null;

      $deleteComp = (string)($body['delete_comprobante'] ?? '0');
      $wantsDelete = ($deleteComp === '1' || strtolower($deleteComp) === 'true');

      $uploadedUrl = null;
      if ($isMp) {
        try {
          $uploadedUrl = repreg_upload_to_subdir('egresos', 'comprobante');
        } catch (Throwable $upErr) {
          repreg_json_fail('Comprobante: ' . $upErr->getMessage());
        }
      }

      if ($wantsDelete) {
        if ($curComp !== '') repreg_delete_file_if_exists($curComp);
        $newComp = null;
      }

      if ($uploadedUrl) {
        if ($curComp !== '') repreg_delete_file_if_exists($curComp);
        $newComp = $uploadedUrl;
      }

      $sql = "UPDATE egresos
              SET fecha = :fecha,
                  concepto = :concepto,
                  descripcion = :descripcion,
                  monto = :monto,
                  id_medio_pago = :id_medio_pago,
                  comprobante = :comprobante
              WHERE id_egreso = :id";
      $st = $pdo->prepare($sql);
      $st->execute([
        ':fecha' => $fecha,
        ':concepto' => $concepto,
        ':descripcion' => ($descripcion !== '' ? $descripcion : null),
        ':monto' => $montoNum,
        ':id_medio_pago' => $idMedioInt,
        ':comprobante' => $newComp,
        ':id' => $idInt,
      ]);

      repreg_json_ok([
        'mensaje' => 'Egreso actualizado.',
        'comprobante' => $newComp ?? '',
      ]);
    }

    if ($tipo === 'pago') {
      $fecha = (string)($body['fecha'] ?? '');
      $monto = $body['monto'] ?? null;

      if ($fecha === '') repreg_json_fail('La fecha es obligatoria.');
      if (!is_numeric($monto)) repreg_json_fail('El monto debe ser numérico.');

      $montoNum = (float)$monto;
      if ($montoNum <= 0) repreg_json_fail('El monto debe ser mayor a 0.');

      $sql = "UPDATE pagos
              SET fecha_pago = :fecha,
                  monto = :monto,
                  id_medio_pago = :id_medio_pago
              WHERE id_pago = :id";
      $st = $pdo->prepare($sql);
      $st->execute([
        ':fecha' => $fecha,
        ':monto' => $montoNum,
        ':id_medio_pago' => $idMedioInt,
        ':id' => $idInt,
      ]);

      repreg_json_ok(['mensaje' => 'Pago actualizado.']);
    }

    if ($tipo === 'trabajador') {
      repreg_json_fail('Edición de trabajador aún no implementada en backend.');
    }

    repreg_json_fail('Tipo inválido: ' . $tipo);
  }

  /* =========================
     ELIMINAR EGRESO (POST)
  ========================= */
  if ($op === 'eliminar_egreso') {
    if (repreg_req_method() !== 'POST') repreg_json_fail('Método no permitido. Se esperaba POST');

    $body = repreg_read_json_body();
    $id = $body['id'] ?? null;

    if (!is_numeric($id)) repreg_json_fail('ID inválido.');
    $idInt = (int)$id;
    if ($idInt <= 0) repreg_json_fail('ID inválido.');

    $stChk = $pdo->prepare("SELECT id_egreso, comprobante FROM egresos WHERE id_egreso = :id LIMIT 1");
    $stChk->execute([':id' => $idInt]);
    $row = $stChk->fetch(PDO::FETCH_ASSOC);
    if (!$row) repreg_json_fail('El egreso no existe o ya fue eliminado.');

    $comp = (string)($row['comprobante'] ?? '');
    if ($comp !== '') {
      repreg_delete_file_if_exists($comp);
    }

    $st = $pdo->prepare("DELETE FROM egresos WHERE id_egreso = :id");
    $st->execute([':id' => $idInt]);

    if ($st->rowCount() < 1) repreg_json_fail('No se pudo eliminar el egreso.');

    repreg_json_ok(['mensaje' => 'Egreso eliminado correctamente.']);
  }

  /* =========================
     LISTADOS (GET)
  ========================= */
  if (repreg_req_method() !== 'GET') repreg_json_fail('Método no permitido. Se esperaba GET');

  $mes  = repreg_int('mes', 0);
  $anio = repreg_int('anio', 0);

  /* =========================
     PAGOS (✅ ARREGLO MESES: usa MONTH(p.fecha_pago) para el nombre del mes)
  ========================= */
  $sqlP = "
    SELECT
      p.id_pago    AS id,
      p.fecha_pago AS fecha,
      c.nombre     AS cliente_nombre,
      cs.nombre    AS sistema_nombre,
      CONCAT(c.nombre, ' - ', cs.nombre) AS concepto,
      COALESCE(m.mes, '')        AS categoria,
      COALESCE(mp.nombre, '')   AS medio,
      p.id_medio_pago           AS id_medio_pago,
      COALESCE(p.monto, 0)      AS monto,
      COALESCE(p.comprobante, '') AS comprobante
    FROM pagos p
    JOIN clientes_sistemas cs ON cs.id_sistema = p.id_sistema
    JOIN clientes c          ON c.id_cliente  = cs.id_cliente
    LEFT JOIN meses m        ON m.id_mes      = MONTH(p.fecha_pago)   -- ✅ FIX CLAVE
    LEFT JOIN medios_pago mp ON mp.id_medio_pago = p.id_medio_pago
    WHERE 1=1
  ";

  $paramsP = [];
  if ($mes > 0) {
    $sqlP .= " AND MONTH(p.fecha_pago) = :mes ";
    $paramsP[':mes'] = $mes;
  }
  if ($anio > 0) {
    $sqlP .= " AND YEAR(p.fecha_pago) = :anio ";
    $paramsP[':anio'] = $anio;
  }
  $sqlP .= " ORDER BY p.fecha_pago DESC, p.id_pago DESC ";

  $stP = $pdo->prepare($sqlP);
  $stP->execute($paramsP);
  $pagos = $stP->fetchAll(PDO::FETCH_ASSOC);

  /* =========================
     EGRESOS
  ========================= */
  $sqlE = "
    SELECT
      e.id_egreso AS id,
      e.fecha     AS fecha,
      e.concepto  AS concepto,
      COALESCE(e.descripcion, '') AS descripcion,
      COALESCE(m.mes, '')      AS categoria,
      COALESCE(mp.nombre, '') AS medio,
      e.id_medio_pago         AS id_medio_pago,
      COALESCE(e.monto, 0)    AS monto,
      COALESCE(e.comprobante, '') AS comprobante
    FROM egresos e
    LEFT JOIN meses m ON m.id_mes = MONTH(e.fecha)
    LEFT JOIN medios_pago mp ON mp.id_medio_pago = e.id_medio_pago
    WHERE 1=1
  ";

  $paramsE = [];
  if ($anio > 0) {
    $sqlE .= " AND YEAR(e.fecha) = :anio ";
    $paramsE[':anio'] = $anio;
  }
  if ($mes > 0) {
    $sqlE .= " AND MONTH(e.fecha) = :mes ";
    $paramsE[':mes'] = $mes;
  }
  $sqlE .= " ORDER BY e.fecha DESC, e.id_egreso DESC ";

  $stE = $pdo->prepare($sqlE);
  $stE->execute($paramsE);
  $egresos = $stE->fetchAll(PDO::FETCH_ASSOC);

  repreg_json_ok([
    'filtros' => [
      'mes'  => $mes > 0 ? $mes : null,
      'anio' => $anio > 0 ? $anio : null,
    ],
    'pagos'   => $pagos,
    'egresos' => $egresos,
  ]);

} catch (Throwable $e) {
  repreg_json_fail('Error en reportes/registro: ' . $e->getMessage());
}
