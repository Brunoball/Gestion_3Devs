<?php
// ✅ REEMPLAZAR COMPLETO
// backend/modules/reportes/trabajadores.php
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

if (!function_exists('reptra_json_ok')) {
  function reptra_json_ok(array $extra = []): void {
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['exito' => true], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}
if (!function_exists('reptra_json_fail')) {
  function reptra_json_fail(string $mensaje, array $extra = []): void {
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['exito' => false, 'mensaje' => $mensaje], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}
if (!function_exists('reptra_req_method')) {
  function reptra_req_method(): string {
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
  }
}
if (!function_exists('reptra_table_exists')) {
  function reptra_table_exists(PDO $pdo, string $table): bool {
    static $cache = [];
    if (array_key_exists($table, $cache)) return (bool)$cache[$table];

    $st = $pdo->prepare("
      SELECT COUNT(*)
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :table
    ");
    $st->execute([':table' => $table]);
    $cache[$table] = ((int)$st->fetchColumn()) > 0;
    return (bool)$cache[$table];
  }
}
if (!function_exists('reptra_column_exists')) {
  function reptra_column_exists(PDO $pdo, string $table, string $column): bool {
    static $cache = [];
    $key = $table . '.' . $column;
    if (array_key_exists($key, $cache)) return (bool)$cache[$key];

    $st = $pdo->prepare("
      SELECT COUNT(*)
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :table
        AND COLUMN_NAME = :column
    ");
    $st->execute([':table' => $table, ':column' => $column]);
    $cache[$key] = ((int)$st->fetchColumn()) > 0;
    return (bool)$cache[$key];
  }
}
if (!function_exists('reptra_valid_periodo_trabajador')) {
  function reptra_valid_periodo_trabajador(array $src): array {
    $idMes = (int)($src['id_mes'] ?? $src['mes'] ?? 0);
    $anio = (int)($src['anio'] ?? 0);

    if ($idMes < 1 || $idMes > 12) {
      throw new RuntimeException('Mes inválido. Seleccioná un mes puntual para el comprobante.');
    }
    if ($anio < 2000 || $anio > 2100) {
      throw new RuntimeException('Año inválido. Seleccioná un año puntual para el comprobante.');
    }

    return [$idMes, $anio];
  }
}
if (!function_exists('reptra_assert_comprobantes_periodo_cols')) {
  function reptra_assert_comprobantes_periodo_cols(PDO $pdo): void {
    if (!reptra_table_exists($pdo, 'trabajadores_comprobantes')) {
      throw new RuntimeException('Falta crear la tabla trabajadores_comprobantes. Ejecutá el SQL incluido en el zip.');
    }
    if (!reptra_column_exists($pdo, 'trabajadores_comprobantes', 'id_mes') ||
        !reptra_column_exists($pdo, 'trabajadores_comprobantes', 'anio')) {
      throw new RuntimeException('Falta actualizar trabajadores_comprobantes con id_mes y anio. Ejecutá el SQL incluido en este zip.');
    }
  }
}
if (!function_exists('reptra_int')) {
  function reptra_int(string $key, int $default = 0): int {
    $v = $_GET[$key] ?? null;
    if ($v === null || $v === '') return $default;
    return (int)$v;
  }
}

if (!function_exists('reptra_api_root')) {
  function reptra_api_root(): string {
    $apiRoot = realpath(__DIR__ . '/../../');
    if (!$apiRoot) $apiRoot = __DIR__ . '/../../';
    return rtrim($apiRoot, DIRECTORY_SEPARATOR);
  }
}
if (!function_exists('reptra_abs_path_from_api_rel')) {
  function reptra_abs_path_from_api_rel(string $apiRelPath): string {
    $apiRoot = reptra_api_root();
    $rel = ltrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $apiRelPath), DIRECTORY_SEPARATOR);
    return $apiRoot . DIRECTORY_SEPARATOR . $rel;
  }
}
if (!function_exists('reptra_public_api_base')) {
  function reptra_public_api_base(): string {
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

    if (function_exists('str_ends_with') && str_ends_with($basePath, '/api/routes')) {
      $basePath = '/api';
    }

    return $scheme . '://' . $host . $basePath;
  }
}
if (!function_exists('reptra_upload_comprobante')) {
  function reptra_upload_comprobante(string $subdir, string $fieldName = 'comprobante'): array {
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
    $destDir = reptra_abs_path_from_api_rel('uploads/' . $subdir);

    if (!is_dir($destDir)) {
      if (!mkdir($destDir, 0775, true) && !is_dir($destDir)) {
        throw new RuntimeException('No se pudo crear la carpeta api/uploads/' . $subdir);
      }
    }

    $destPath = rtrim($destDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $fileName;
    if (!move_uploaded_file($tmp, $destPath)) {
      throw new RuntimeException('No se pudo guardar el archivo en el servidor.');
    }

    $publicBase = reptra_public_api_base();
    return [
      'archivo_url' => $publicBase . '/uploads/' . $subdir . '/' . $fileName,
      'archivo_nombre' => $orig,
      'archivo_tipo' => $mime ?: null,
      'archivo_size' => $size,
    ];
  }
}

try {
  if (!($pdo instanceof PDO)) reptra_json_fail('Conexión PDO no disponible.');

  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  if (!in_array($op, [
    'trabajadores',
    'trabajadores_activos',
    'trabajador_subir_comprobante',
    'trabajador_comprobante_latest',
    'trabajador_comprobantes_listar',
  ], true)) {
    reptra_json_fail('op no válida en reportes/trabajadores: ' . $op);
  }

  /* =========================================================
     COMPROBANTES DE PAGO A TRABAJADORES
     Estos endpoints viven en REPORTES porque el botón está en
     Reportes -> Trabajadores.
  ========================================================= */
  if ($op === 'trabajador_subir_comprobante') {
    if (reptra_req_method() !== 'POST') reptra_json_fail('Método no permitido. Se esperaba POST.');

    try {
      reptra_assert_comprobantes_periodo_cols($pdo);
      [$idMes, $anioPeriodo] = reptra_valid_periodo_trabajador($_POST);
    } catch (Throwable $e) {
      reptra_json_fail($e->getMessage());
    }

    $idTrabajador = (int)($_POST['id_trabajador'] ?? 0);
    if ($idTrabajador <= 0) reptra_json_fail('ID de trabajador inválido.');

    $stT = $pdo->prepare("SELECT id, nombre, apellido FROM trabajadores WHERE id = ? LIMIT 1");
    $stT->execute([$idTrabajador]);
    $trab = $stT->fetch(PDO::FETCH_ASSOC);
    if (!$trab) reptra_json_fail('El trabajador no existe.');

    $fileData = reptra_upload_comprobante('trabajadores_comprobantes/' . $idTrabajador . '/' . $anioPeriodo . '/' . $idMes, 'comprobante');

    $st = $pdo->prepare("INSERT INTO trabajadores_comprobantes
      (id_trabajador, id_mes, anio, archivo_url, archivo_nombre, archivo_tipo, archivo_size)
      VALUES (:id_trabajador, :id_mes, :anio, :archivo_url, :archivo_nombre, :archivo_tipo, :archivo_size)");
    $st->execute([
      ':id_trabajador' => $idTrabajador,
      ':id_mes' => $idMes,
      ':anio' => $anioPeriodo,
      ':archivo_url' => $fileData['archivo_url'],
      ':archivo_nombre' => $fileData['archivo_nombre'],
      ':archivo_tipo' => $fileData['archivo_tipo'],
      ':archivo_size' => $fileData['archivo_size'],
    ]);

    $idComp = (int)$pdo->lastInsertId();
    reptra_json_ok([
      'id' => $idComp,
      'comprobante' => array_merge([
        'id' => $idComp,
        'id_trabajador' => $idTrabajador,
        'id_mes' => $idMes,
        'anio' => $anioPeriodo,
      ], $fileData),
    ]);
  }

  if ($op === 'trabajador_comprobante_latest') {
    if (reptra_req_method() !== 'GET') reptra_json_fail('Método no permitido. Se esperaba GET.');

    $idTrabajador = (int)($_GET['id'] ?? 0);
    if ($idTrabajador <= 0) reptra_json_fail('ID de trabajador inválido.');

    if (!reptra_table_exists($pdo, 'trabajadores_comprobantes')) {
      reptra_json_ok(['data' => null, 'mensaje' => 'Sin tabla de comprobantes creada.']);
    }

    try {
      reptra_assert_comprobantes_periodo_cols($pdo);
      [$idMes, $anioPeriodo] = reptra_valid_periodo_trabajador($_GET);
    } catch (Throwable $e) {
      reptra_json_fail($e->getMessage());
    }

    $st = $pdo->prepare("SELECT id, id_trabajador, id_mes, anio, archivo_url, archivo_nombre, archivo_tipo, archivo_size, created_at
                         FROM trabajadores_comprobantes
                         WHERE id_trabajador = :id
                           AND id_mes = :id_mes
                           AND anio = :anio
                         ORDER BY created_at DESC, id DESC
                         LIMIT 1");
    $st->execute([':id' => $idTrabajador, ':id_mes' => $idMes, ':anio' => $anioPeriodo]);
    $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;

    reptra_json_ok(['data' => $row]);
  }

  if ($op === 'trabajador_comprobantes_listar') {
    if (reptra_req_method() !== 'GET') reptra_json_fail('Método no permitido. Se esperaba GET.');

    $idTrabajador = (int)($_GET['id'] ?? 0);
    if ($idTrabajador <= 0) reptra_json_fail('ID de trabajador inválido.');

    if (!reptra_table_exists($pdo, 'trabajadores_comprobantes')) {
      reptra_json_ok(['data' => []]);
    }

    $hasPeriodoCols = reptra_column_exists($pdo, 'trabajadores_comprobantes', 'id_mes') &&
      reptra_column_exists($pdo, 'trabajadores_comprobantes', 'anio');

    if (!$hasPeriodoCols) {
      $st = $pdo->prepare("SELECT id, id_trabajador, archivo_url, archivo_nombre, archivo_tipo, archivo_size, created_at
                           FROM trabajadores_comprobantes
                           WHERE id_trabajador = :id
                           ORDER BY created_at DESC, id DESC");
      $st->execute([':id' => $idTrabajador]);
      reptra_json_ok(['data' => $st->fetchAll(PDO::FETCH_ASSOC)]);
    }

    $params = [':id' => $idTrabajador];
    $wherePeriodo = '';
    $idMes = (int)($_GET['id_mes'] ?? $_GET['mes'] ?? 0);
    $anioPeriodo = (int)($_GET['anio'] ?? 0);
    if ($idMes >= 1 && $idMes <= 12 && $anioPeriodo >= 2000 && $anioPeriodo <= 2100) {
      $wherePeriodo = ' AND id_mes = :id_mes AND anio = :anio ';
      $params[':id_mes'] = $idMes;
      $params[':anio'] = $anioPeriodo;
    }

    $st = $pdo->prepare("SELECT id, id_trabajador, id_mes, anio, archivo_url, archivo_nombre, archivo_tipo, archivo_size, created_at
                         FROM trabajadores_comprobantes
                         WHERE id_trabajador = :id
                         {$wherePeriodo}
                         ORDER BY anio DESC, id_mes DESC, created_at DESC, id DESC");
    $st->execute($params);
    reptra_json_ok(['data' => $st->fetchAll(PDO::FETCH_ASSOC)]);
  }

  if (reptra_req_method() !== 'GET') {
    reptra_json_fail('Método no permitido. Se esperaba GET');
  }

  /* =========================================================
     ✅ NUEVO: LISTA SIMPLE DE TRABAJADORES ACTIVOS
     GET /api.php?action=reportes&op=trabajadores_activos
  ========================================================= */
  if ($op === 'trabajadores_activos') {
    $sql = "
      SELECT
        t.id,
        t.nombre,
        t.apellido,
        t.email,
        t.rol,
        t.alias_pago
      FROM trabajadores t
      WHERE t.activo = 1
      ORDER BY t.apellido ASC, t.nombre ASC
    ";

    $st = $pdo->prepare($sql);
    $st->execute();

    $trabajadores = $st->fetchAll(PDO::FETCH_ASSOC);

    reptra_json_ok([
      'trabajadores' => $trabajadores,
    ]);
  }

  $mes  = reptra_int('mes', 0);
  $anio = reptra_int('anio', 0);

  $sqlSys = "
    SELECT
      p.id_sistema,
      cs.nombre AS sistema_nombre,
      SUM(p.monto) AS total_monto
    FROM pagos p
    JOIN clientes_sistemas cs ON cs.id_sistema = p.id_sistema
    WHERE 1=1
  ";

  $paramsSys = [];

  if ($mes > 0) {
    $sqlSys .= " AND MONTH(p.fecha_pago) = :mes ";
    $paramsSys[':mes'] = $mes;
  }
  if ($anio > 0) {
    $sqlSys .= " AND YEAR(p.fecha_pago) = :anio ";
    $paramsSys[':anio'] = $anio;
  }

  $sqlSys .= "
    GROUP BY p.id_sistema, cs.nombre
    HAVING SUM(p.monto) > 0
    ORDER BY total_monto DESC
  ";

  $stSys = $pdo->prepare($sqlSys);
  $stSys->execute($paramsSys);
  $sistemasPagados = $stSys->fetchAll(PDO::FETCH_ASSOC);

  $sqlEg = "
    SELECT
      e.id_trabajador,
      t.nombre,
      t.apellido,
      t.email,
      t.rol,
      t.alias_pago,
      SUM(e.monto) AS total_egresos
    FROM egresos e
    JOIN trabajadores t ON t.id = e.id_trabajador
    WHERE e.id_trabajador IS NOT NULL
      AND t.activo = 1
  ";

  $paramsEg = [];

  if ($mes > 0) {
    $sqlEg .= " AND MONTH(e.fecha) = :mes ";
    $paramsEg[':mes'] = $mes;
  }
  if ($anio > 0) {
    $sqlEg .= " AND YEAR(e.fecha) = :anio ";
    $paramsEg[':anio'] = $anio;
  }

  $sqlEg .= "
    GROUP BY
      e.id_trabajador,
      t.nombre,
      t.apellido,
      t.email,
      t.rol,
      t.alias_pago
    ORDER BY t.apellido, t.nombre
  ";

  $stEg = $pdo->prepare($sqlEg);
  $stEg->execute($paramsEg);
  $egresosPorTrabajador = $stEg->fetchAll(PDO::FETCH_ASSOC);

  $acc = [];
  $sinAsignar = [];
  $detalleSistemas = [];

  foreach ($egresosPorTrabajador as $eg) {
    $idT = (int)($eg['id_trabajador'] ?? 0);
    if ($idT <= 0) continue;

    if (!isset($acc[$idT])) {
      $acc[$idT] = [
        'id' => $idT,
        'nombre' => (string)($eg['nombre'] ?? ''),
        'apellido' => (string)($eg['apellido'] ?? ''),
        'email' => (string)($eg['email'] ?? ''),
        'rol' => (string)($eg['rol'] ?? ''),
        'alias_pago' => (string)($eg['alias_pago'] ?? ''),
        'sistemas_cobrados' => 0,
        'monto_reembolso' => 0.0,
        'monto_sistemas' => 0.0,
        'monto' => 0.0,
        'comprobante_pago' => null,
        'comprobante_pago_fecha' => null,
        'comprobante_pago_nombre' => null,
        'comprobante_pago_tipo' => null,
        'comprobante_pago_id_mes' => null,
        'comprobante_pago_anio' => null,
      ];
    }

    $reembolso = (float)($eg['total_egresos'] ?? 0);
    $acc[$idT]['monto_reembolso'] += $reembolso;
    $acc[$idT]['monto'] += $reembolso;
  }

  $totalIngresos = 0.0;
  foreach ($sistemasPagados as $sys) {
    $totalIngresos += (float)($sys['total_monto'] ?? 0);
  }

  $totalEgresosReembolsables = 0.0;
  foreach ($egresosPorTrabajador as $eg) {
    $totalEgresosReembolsables += (float)($eg['total_egresos'] ?? 0);
  }

  $ingresoLimpio = $totalIngresos - $totalEgresosReembolsables;
  if ($ingresoLimpio < 0) $ingresoLimpio = 0.0;

  $sqlTrab = "
    SELECT
      st.id_trabajador,
      t.nombre,
      t.apellido,
      t.email,
      t.rol,
      t.alias_pago
    FROM sistemas_trabajadores st
    JOIN trabajadores t ON t.id = st.id_trabajador
    WHERE st.id_sistema = :id_sistema
      AND t.activo = 1
  ";
  $stTrab = $pdo->prepare($sqlTrab);

  foreach ($sistemasPagados as $sys) {
    $idSistema = (int)($sys['id_sistema'] ?? 0);
    $sistemaNombre = (string)($sys['sistema_nombre'] ?? '');
    $totalMontoSistema = (float)($sys['total_monto'] ?? 0);

    if ($idSistema <= 0 || $totalMontoSistema <= 0) continue;

    $stTrab->execute([':id_sistema' => $idSistema]);
    $trabDelSistema = $stTrab->fetchAll(PDO::FETCH_ASSOC);

    $cantTrab = count($trabDelSistema);

    if ($cantTrab === 0) {
      $sinAsignar[] = [
        'id_sistema' => $idSistema,
        'sistema' => $sistemaNombre,
        'total_monto' => $totalMontoSistema,
        'motivo' => 'Sin trabajadores asignados en sistemas_trabajadores',
      ];
      continue;
    }

    $montoSistemaLimpio = $totalIngresos > 0
      ? ($ingresoLimpio * ($totalMontoSistema / $totalIngresos))
      : 0.0;

    $share = $cantTrab > 0 ? ($montoSistemaLimpio / $cantTrab) : 0.0;

    $detalleSistemas[] = [
      'id_sistema' => $idSistema,
      'sistema' => $sistemaNombre,
      'ingreso_bruto' => round($totalMontoSistema, 2),
      'ingreso_limpio_asignado' => round($montoSistemaLimpio, 2),
      'cantidad_trabajadores' => $cantTrab,
      'share_por_trabajador' => round($share, 2),
    ];

    foreach ($trabDelSistema as $t) {
      $idT = (int)($t['id_trabajador'] ?? 0);
      if ($idT <= 0) continue;

      if (!isset($acc[$idT])) {
        $acc[$idT] = [
          'id' => $idT,
          'nombre' => (string)($t['nombre'] ?? ''),
          'apellido' => (string)($t['apellido'] ?? ''),
          'email' => (string)($t['email'] ?? ''),
          'rol' => (string)($t['rol'] ?? ''),
          'alias_pago' => (string)($t['alias_pago'] ?? ''),
          'sistemas_cobrados' => 0,
          'monto_reembolso' => 0.0,
          'monto_sistemas' => 0.0,
          'monto' => 0.0,
          'comprobante_pago' => null,
          'comprobante_pago_fecha' => null,
          'comprobante_pago_nombre' => null,
          'comprobante_pago_tipo' => null,
          'comprobante_pago_id_mes' => null,
          'comprobante_pago_anio' => null,
        ];
      }

      $acc[$idT]['monto_sistemas'] += $share;
      $acc[$idT]['monto'] += $share;
      $acc[$idT]['sistemas_cobrados'] = (int)$acc[$idT]['sistemas_cobrados'] + 1;
    }
  }

  if (
    $mes > 0 && $anio > 0 &&
    !empty($acc) &&
    reptra_table_exists($pdo, 'trabajadores_comprobantes') &&
    reptra_column_exists($pdo, 'trabajadores_comprobantes', 'id_mes') &&
    reptra_column_exists($pdo, 'trabajadores_comprobantes', 'anio')
  ) {
    $idsTrab = array_values(array_filter(array_map('intval', array_keys($acc)), fn($id) => $id > 0));

    if (!empty($idsTrab)) {
      $placeholders = implode(',', array_fill(0, count($idsTrab), '?'));
      $paramsComp = array_merge($idsTrab, [$mes, $anio]);
      $stComp = $pdo->prepare("
        SELECT id_trabajador, id_mes, anio, archivo_url, archivo_nombre, archivo_tipo, created_at
        FROM trabajadores_comprobantes
        WHERE id_trabajador IN ($placeholders)
          AND id_mes = ?
          AND anio = ?
        ORDER BY id_trabajador ASC, created_at DESC, id DESC
      ");
      $stComp->execute($paramsComp);

      while ($comp = $stComp->fetch(PDO::FETCH_ASSOC)) {
        $idTC = (int)($comp['id_trabajador'] ?? 0);
        if ($idTC <= 0 || !isset($acc[$idTC])) continue;
        if (!empty($acc[$idTC]['comprobante_pago'])) continue;

        $acc[$idTC]['comprobante_pago'] = (string)($comp['archivo_url'] ?? '');
        $acc[$idTC]['comprobante_pago_fecha'] = (string)($comp['created_at'] ?? '');
        $acc[$idTC]['comprobante_pago_nombre'] = (string)($comp['archivo_nombre'] ?? '');
        $acc[$idTC]['comprobante_pago_tipo'] = (string)($comp['archivo_tipo'] ?? '');
        $acc[$idTC]['comprobante_pago_id_mes'] = (int)($comp['id_mes'] ?? 0) ?: null;
        $acc[$idTC]['comprobante_pago_anio'] = (int)($comp['anio'] ?? 0) ?: null;
      }
    }
  }

  $trabajadores = array_values($acc);

  foreach ($trabajadores as &$tr) {
    $tr['monto_reembolso'] = round((float)$tr['monto_reembolso'], 2);
    $tr['monto_sistemas'] = round((float)$tr['monto_sistemas'], 2);
    $tr['monto'] = round((float)$tr['monto'], 2);
  }
  unset($tr);

  usort($trabajadores, function ($a, $b) {
    return ($b['monto'] <=> $a['monto']);
  });

  reptra_json_ok([
    'filtros' => [
      'mes'  => $mes > 0 ? $mes : null,
      'anio' => $anio > 0 ? $anio : null,
    ],
    'resumen' => [
      'total_ingresos' => round($totalIngresos, 2),
      'total_egresos_reembolsables' => round($totalEgresosReembolsables, 2),
      'ingreso_limpio' => round($ingresoLimpio, 2),
    ],
    'trabajadores' => $trabajadores,
    'sistemas_sin_asignar' => $sinAsignar,
    'detalle_sistemas' => $detalleSistemas,
  ]);

} catch (Throwable $e) {
  reptra_json_fail('Error en reportes/trabajadores: ' . $e->getMessage());
}