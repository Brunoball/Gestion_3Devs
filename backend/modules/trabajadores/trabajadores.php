<?php
// backend/modules/trabajadores/trabajadores.php
declare(strict_types=1);

global $pdo;

$op = $_GET['op'] ?? '';

if (!headers_sent()) {
  header('Content-Type: application/json; charset=utf-8');
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

if (!function_exists('trab_json_ok')) {
  function trab_json_ok(array $extra = []): void {
    http_response_code(200);
    if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['exito' => true], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('trab_json_fail')) {
  function trab_json_fail(string $mensaje, array $extra = []): void {
    http_response_code(200);
    if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['exito' => false, 'mensaje' => $mensaje], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('trab_req_method')) {
  function trab_req_method(): string {
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
  }
}

if (!function_exists('trab_table_exists')) {
  function trab_table_exists(PDO $pdo, string $table): bool {
    static $cache = [];
    if (array_key_exists($table, $cache)) return (bool)$cache[$table];

    $st = $pdo->prepare("\n      SELECT COUNT(*)\n      FROM information_schema.TABLES\n      WHERE TABLE_SCHEMA = DATABASE()\n        AND TABLE_NAME = :table\n    ");
    $st->execute([':table' => $table]);
    $cache[$table] = ((int)$st->fetchColumn()) > 0;
    return (bool)$cache[$table];
  }
}

if (!function_exists('trab_api_root')) {
  function trab_api_root(): string {
    $apiRoot = realpath(__DIR__ . '/../../');
    if (!$apiRoot) $apiRoot = __DIR__ . '/../../';
    return rtrim($apiRoot, DIRECTORY_SEPARATOR);
  }
}

if (!function_exists('trab_abs_path_from_api_rel')) {
  function trab_abs_path_from_api_rel(string $apiRelPath): string {
    $apiRoot = trab_api_root();
    $rel = ltrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $apiRelPath), DIRECTORY_SEPARATOR);
    return $apiRoot . DIRECTORY_SEPARATOR . $rel;
  }
}

if (!function_exists('trab_public_api_base')) {
  function trab_public_api_base(): string {
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

if (!function_exists('trab_upload_comprobante')) {
  function trab_upload_comprobante(string $subdir, string $fieldName = 'comprobante'): array {
    if (!isset($_FILES[$fieldName])) {
      throw new RuntimeException('No llegó ningún archivo comprobante.');
    }

    $f = $_FILES[$fieldName];
    if (!is_array($f) || ((int)($f['error'] ?? UPLOAD_ERR_NO_FILE)) === UPLOAD_ERR_NO_FILE) {
      throw new RuntimeException('No llegó ningún archivo comprobante.');
    }

    $err = (int)($f['error'] ?? UPLOAD_ERR_OK);
    if ($err !== UPLOAD_ERR_OK) {
      throw new RuntimeException('Error subiendo archivo. Código: ' . $err);
    }

    $tmp  = (string)($f['tmp_name'] ?? '');
    $orig = (string)($f['name'] ?? 'comprobante');
    $size = (int)($f['size'] ?? 0);

    if ($tmp === '' || !is_uploaded_file($tmp)) {
      throw new RuntimeException('Archivo inválido o no subido correctamente.');
    }

    $maxBytes = 8 * 1024 * 1024;
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
    $allowedMime = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
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
    $destDir = trab_abs_path_from_api_rel('uploads/' . $subdir);

    if (!is_dir($destDir)) {
      if (!mkdir($destDir, 0775, true) && !is_dir($destDir)) {
        throw new RuntimeException('No se pudo crear la carpeta api/uploads/' . $subdir);
      }
    }

    $destPath = rtrim($destDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $fileName;
    if (!move_uploaded_file($tmp, $destPath)) {
      throw new RuntimeException('No se pudo guardar el archivo en el servidor.');
    }

    $publicBase = trab_public_api_base();
    return [
      'archivo_url' => $publicBase . '/uploads/' . $subdir . '/' . $fileName,
      'archivo_nombre' => $orig,
      'archivo_tipo' => $mime ?: null,
      'archivo_size' => $size,
    ];
  }
}

try {
  if (!($pdo instanceof PDO)) trab_json_fail('Conexión PDO no disponible.');
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  switch ($op) {

    /* =========================
       LISTAR (activos o todos)
    ========================== */
    case 'listar': {
      $soloActivos = isset($_GET['activos']) ? (int)$_GET['activos'] : 1;
      $hasComprobantes = trab_table_exists($pdo, 'trabajadores_comprobantes');

      $selectComprobante = $hasComprobantes ? "
        ,(
          SELECT tc.archivo_url
          FROM trabajadores_comprobantes tc
          WHERE tc.id_trabajador = t.id
          ORDER BY tc.created_at DESC, tc.id DESC
          LIMIT 1
        ) AS comprobante_pago
        ,(
          SELECT tc.created_at
          FROM trabajadores_comprobantes tc
          WHERE tc.id_trabajador = t.id
          ORDER BY tc.created_at DESC, tc.id DESC
          LIMIT 1
        ) AS comprobante_pago_fecha
      " : ", NULL AS comprobante_pago, NULL AS comprobante_pago_fecha";

      $sql = "SELECT t.id, t.nombre, t.apellido, t.email, t.rol, t.alias_pago, t.activo, t.fecha_alta
                     {$selectComprobante}
              FROM trabajadores t
              " . ($soloActivos ? "WHERE t.activo = 1" : "") . "
              ORDER BY t.id DESC";

      $st = $pdo->prepare($sql);
      $st->execute();
      $data = $st->fetchAll(PDO::FETCH_ASSOC);

      trab_json_ok(['data' => $data]);
    }

    /* =========================
       GET 1
    ========================== */
    case 'get': {
      $id = (int)($_GET['id'] ?? 0);
      if ($id <= 0) trab_json_fail('ID inválido');

      $hasComprobantes = trab_table_exists($pdo, 'trabajadores_comprobantes');
      $selectComprobante = $hasComprobantes ? "
        ,(
          SELECT tc.archivo_url
          FROM trabajadores_comprobantes tc
          WHERE tc.id_trabajador = t.id
          ORDER BY tc.created_at DESC, tc.id DESC
          LIMIT 1
        ) AS comprobante_pago
      " : ", NULL AS comprobante_pago";

      $st = $pdo->prepare("SELECT t.id, t.nombre, t.apellido, t.email, t.rol, t.alias_pago, t.activo, t.fecha_alta
                                  {$selectComprobante}
                           FROM trabajadores t
                           WHERE t.id = ? LIMIT 1");
      $st->execute([$id]);
      $row = $st->fetch(PDO::FETCH_ASSOC);

      trab_json_ok(['data' => $row, 'encontrado' => (bool)$row]);
    }

    /* =========================
       SUBIR COMPROBANTE TRABAJADOR
    ========================== */
    case 'subir_comprobante': {
      if (trab_req_method() !== 'POST') trab_json_fail('Método no permitido. Se esperaba POST.');
      if (!trab_table_exists($pdo, 'trabajadores_comprobantes')) {
        trab_json_fail('Falta crear la tabla trabajadores_comprobantes. Ejecutá el SQL incluido en el zip.');
      }

      $idTrabajador = (int)($_POST['id_trabajador'] ?? 0);
      if ($idTrabajador <= 0) trab_json_fail('ID de trabajador inválido.');

      $stT = $pdo->prepare("SELECT id, nombre, apellido FROM trabajadores WHERE id = ? LIMIT 1");
      $stT->execute([$idTrabajador]);
      $trab = $stT->fetch(PDO::FETCH_ASSOC);
      if (!$trab) trab_json_fail('El trabajador no existe.');

      $fileData = trab_upload_comprobante('trabajadores_comprobantes/' . $idTrabajador, 'comprobante');

      $st = $pdo->prepare("INSERT INTO trabajadores_comprobantes
        (id_trabajador, archivo_url, archivo_nombre, archivo_tipo, archivo_size)
        VALUES (:id_trabajador, :archivo_url, :archivo_nombre, :archivo_tipo, :archivo_size)");
      $st->execute([
        ':id_trabajador' => $idTrabajador,
        ':archivo_url' => $fileData['archivo_url'],
        ':archivo_nombre' => $fileData['archivo_nombre'],
        ':archivo_tipo' => $fileData['archivo_tipo'],
        ':archivo_size' => $fileData['archivo_size'],
      ]);

      $idComp = (int)$pdo->lastInsertId();
      trab_json_ok([
        'id' => $idComp,
        'comprobante' => array_merge(['id' => $idComp, 'id_trabajador' => $idTrabajador], $fileData),
      ]);
    }

    /* =========================
       VER ÚLTIMO COMPROBANTE
    ========================== */
    case 'comprobante_latest': {
      $idTrabajador = (int)($_GET['id'] ?? 0);
      if ($idTrabajador <= 0) trab_json_fail('ID de trabajador inválido.');
      if (!trab_table_exists($pdo, 'trabajadores_comprobantes')) {
        trab_json_ok(['data' => null, 'mensaje' => 'Sin tabla de comprobantes creada.']);
      }

      $st = $pdo->prepare("SELECT id, id_trabajador, archivo_url, archivo_nombre, archivo_tipo, archivo_size, created_at
                           FROM trabajadores_comprobantes
                           WHERE id_trabajador = :id
                           ORDER BY created_at DESC, id DESC
                           LIMIT 1");
      $st->execute([':id' => $idTrabajador]);
      $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;

      trab_json_ok(['data' => $row]);
    }

    /* =========================
       HISTORIAL COMPROBANTES
    ========================== */
    case 'comprobantes_listar': {
      $idTrabajador = (int)($_GET['id'] ?? 0);
      if ($idTrabajador <= 0) trab_json_fail('ID de trabajador inválido.');
      if (!trab_table_exists($pdo, 'trabajadores_comprobantes')) {
        trab_json_ok(['data' => []]);
      }

      $st = $pdo->prepare("SELECT id, id_trabajador, archivo_url, archivo_nombre, archivo_tipo, archivo_size, created_at
                           FROM trabajadores_comprobantes
                           WHERE id_trabajador = :id
                           ORDER BY created_at DESC, id DESC");
      $st->execute([':id' => $idTrabajador]);
      trab_json_ok(['data' => $st->fetchAll(PDO::FETCH_ASSOC)]);
    }

    /* =========================
       CREAR
    ========================== */
    case 'crear': {
      $body = json_decode(file_get_contents('php://input'), true) ?: [];

      $nombre    = trim((string)($body['nombre'] ?? ''));
      $apellido  = trim((string)($body['apellido'] ?? ''));
      $email     = trim((string)($body['email'] ?? ''));
      $rol       = trim((string)($body['rol'] ?? 'vista'));
      $aliasPago = trim((string)($body['alias_pago'] ?? ''));

      if ($nombre === '' || $apellido === '') trab_json_fail('Nombre y apellido son obligatorios');

      $rolesValidos = ['admin','desarrollador','soporte','vista'];
      if (!in_array($rol, $rolesValidos, true)) $rol = 'vista';

      $emailDb = ($email === '') ? null : $email;
      $aliasDb = ($aliasPago === '') ? null : $aliasPago;

      $st = $pdo->prepare("INSERT INTO trabajadores (nombre, apellido, email, rol, alias_pago, activo)
                           VALUES (?, ?, ?, ?, ?, 1)");
      $st->execute([$nombre, $apellido, $emailDb, $rol, $aliasDb]);

      trab_json_ok(['id' => (int)$pdo->lastInsertId()]);
    }

    /* =========================
       EDITAR
    ========================== */
    case 'editar': {
      $body = json_decode(file_get_contents('php://input'), true) ?: [];

      $id        = (int)($body['id'] ?? 0);
      $nombre    = trim((string)($body['nombre'] ?? ''));
      $apellido  = trim((string)($body['apellido'] ?? ''));
      $email     = trim((string)($body['email'] ?? ''));
      $rol       = trim((string)($body['rol'] ?? 'vista'));
      $aliasPago = trim((string)($body['alias_pago'] ?? ''));
      $activo    = isset($body['activo']) ? (int)!!$body['activo'] : 1;

      if ($id <= 0) trab_json_fail('ID inválido');
      if ($nombre === '' || $apellido === '') trab_json_fail('Nombre y apellido son obligatorios');

      $rolesValidos = ['admin','desarrollador','soporte','vista'];
      if (!in_array($rol, $rolesValidos, true)) $rol = 'vista';

      $emailDb = ($email === '') ? null : $email;
      $aliasDb = ($aliasPago === '') ? null : $aliasPago;

      $st = $pdo->prepare("UPDATE trabajadores
                           SET nombre = ?, apellido = ?, email = ?, rol = ?, alias_pago = ?, activo = ?
                           WHERE id = ? LIMIT 1");
      $st->execute([$nombre, $apellido, $emailDb, $rol, $aliasDb, $activo, $id]);

      trab_json_ok();
    }

    /* =========================
       BAJA LÓGICA (DAR DE BAJA)
       activo = 0
    ========================== */
    case 'baja': {
      $body = json_decode(file_get_contents('php://input'), true) ?: [];
      $id = (int)($body['id'] ?? 0);

      if ($id <= 0) trab_json_fail('ID inválido');

      $st = $pdo->prepare("UPDATE trabajadores SET activo = 0 WHERE id = ? LIMIT 1");
      $st->execute([$id]);

      if ($st->rowCount() === 0) trab_json_fail('No existe el trabajador.');

      trab_json_ok();
    }

    /* =========================
       REACTIVAR
       activo = 1
    ========================== */
    case 'reactivar': {
      $body = json_decode(file_get_contents('php://input'), true) ?: [];
      $id = (int)($body['id'] ?? 0);

      if ($id <= 0) trab_json_fail('ID inválido');

      $st = $pdo->prepare("UPDATE trabajadores SET activo = 1 WHERE id = ? LIMIT 1");
      $st->execute([$id]);

      if ($st->rowCount() === 0) trab_json_fail('No existe el trabajador.');

      trab_json_ok();
    }

    /* =========================
       ELIMINAR PERMANENTE
       (DELETE físico)
    ========================== */
    case 'eliminar': {
      $body = json_decode(file_get_contents('php://input'), true) ?: [];
      $id = (int)($body['id'] ?? 0);

      if ($id <= 0) trab_json_fail('ID inválido');

      $st = $pdo->prepare("DELETE FROM trabajadores WHERE id = ? LIMIT 1");
      $st->execute([$id]);

      if ($st->rowCount() === 0) trab_json_fail('No existe el trabajador o ya fue eliminado.');

      trab_json_ok();
    }

    default: {
      trab_json_fail('OP inválida: ' . $op);
    }
  }

} catch (PDOException $e) {
  $mysqlCode = isset($e->errorInfo[1]) ? (int)$e->errorInfo[1] : 0;
  $msg = $e->getMessage();

  // ✅ Duplicados (1062)
  if ($mysqlCode === 1062 || str_contains($msg, 'Duplicate entry')) {
    trab_json_fail('Ya existe un trabajador con ese correo.');
  }

  // ✅ FK constraint (1451) típico al DELETE
  if ($mysqlCode === 1451 || str_contains($msg, 'a foreign key constraint fails')) {
    trab_json_fail('No se puede eliminar: el trabajador está referenciado por otros registros.');
  }

  trab_json_fail('Error de base de datos al operar trabajadores.');

} catch (Throwable $e) {
  trab_json_fail($e->getMessage() ?: 'Error interno al operar trabajadores.');
}
