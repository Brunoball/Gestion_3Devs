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
    echo json_encode(array_merge(['exito' => true], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}
if (!function_exists('repreg_json_fail')) {
  function repreg_json_fail(string $mensaje, array $extra = []): void {
    http_response_code(200);
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

try {
  if (!($pdo instanceof PDO)) repreg_json_fail('Conexión PDO no disponible.');

  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  if ($op === '') repreg_json_fail('Falta parámetro op en reportes');

  // ✅ Soportamos: movimientos / registros / crear_egreso / editar_movimiento / eliminar_egreso
  if (!in_array($op, ['movimientos', 'registros', 'crear_egreso', 'editar_movimiento', 'eliminar_egreso'], true)) {
    repreg_json_fail('op no válida en registros: ' . $op);
  }

  /* =========================
     CREAR EGRESO (POST)
     POST action=reportes&op=crear_egreso
     -> Tabla egresos: concepto, descripcion, monto, fecha, id_medio_pago
  ========================= */
  if ($op === 'crear_egreso') {
    if (repreg_req_method() !== 'POST') repreg_json_fail('Método no permitido. Se esperaba POST');

    $body = repreg_read_json_body();

    $fecha = (string)($body['fecha'] ?? '');
    $concepto = trim((string)($body['concepto'] ?? ''));
    $descripcion = trim((string)($body['descripcion'] ?? ''));
    $monto = $body['monto'] ?? null;
    $idMedio = $body['id_medio_pago'] ?? null;

    if ($fecha === '') repreg_json_fail('La fecha es obligatoria.');
    if ($concepto === '') repreg_json_fail('El concepto es obligatorio.');
    if (!is_numeric($monto)) repreg_json_fail('El monto debe ser numérico.');

    $montoNum = (float)$monto;
    if ($montoNum <= 0) repreg_json_fail('El monto debe ser mayor a 0.');

    // id_medio_pago puede ser null
    $idMedioInt = null;
    if ($idMedio !== null && $idMedio !== '') {
      if (!is_numeric($idMedio)) repreg_json_fail('El id_medio_pago debe ser numérico o null.');
      $idMedioInt = (int)$idMedio;
      if ($idMedioInt <= 0) $idMedioInt = null;
    }

    // ✅ Insert incluyendo descripcion (puede ser NULL)
    $sql = "INSERT INTO egresos (fecha, concepto, descripcion, monto, id_medio_pago)
            VALUES (:fecha, :concepto, :descripcion, :monto, :id_medio_pago)";

    $st = $pdo->prepare($sql);
    $st->execute([
      ':fecha' => $fecha,
      ':concepto' => $concepto,
      ':descripcion' => ($descripcion !== '' ? $descripcion : null),
      ':monto' => $montoNum,
      ':id_medio_pago' => $idMedioInt,
    ]);

    $newId = (int)$pdo->lastInsertId();

    repreg_json_ok([
      'id' => $newId,
      'mensaje' => 'Egreso creado correctamente.'
    ]);
  }

  /* =========================
     EDITAR MOVIMIENTO (POST)
     POST action=reportes&op=editar_movimiento
     payload:
      - tipo: "egreso" | "pago" | "trabajador"
      - egreso/pago: id, fecha, concepto, descripcion, monto, id_medio_pago
      - trabajador: id, nombre, apellido, rol, alias_pago, sistemas_cobrados, monto
  ========================= */
  if ($op === 'editar_movimiento') {
    if (repreg_req_method() !== 'POST') repreg_json_fail('Método no permitido. Se esperaba POST');

    $body = repreg_read_json_body();

    $tipo = (string)($body['tipo'] ?? '');
    $id = $body['id'] ?? null;

    if ($tipo === '') repreg_json_fail('Falta tipo.');
    if (!is_numeric($id)) repreg_json_fail('ID inválido.');

    $idInt = (int)$id;
    if ($idInt <= 0) repreg_json_fail('ID inválido.');

    // id_medio_pago puede ser null
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

      $sql = "UPDATE egresos
              SET fecha = :fecha,
                  concepto = :concepto,
                  descripcion = :descripcion,
                  monto = :monto,
                  id_medio_pago = :id_medio_pago
              WHERE id_egreso = :id";

      $st = $pdo->prepare($sql);
      $st->execute([
        ':fecha' => $fecha,
        ':concepto' => $concepto,
        ':descripcion' => ($descripcion !== '' ? $descripcion : null),
        ':monto' => $montoNum,
        ':id_medio_pago' => $idMedioInt,
        ':id' => $idInt,
      ]);

      repreg_json_ok(['mensaje' => 'Egreso actualizado.']);
    }

    if ($tipo === 'pago') {
      $fecha = (string)($body['fecha'] ?? '');
      $monto = $body['monto'] ?? null;

      if ($fecha === '') repreg_json_fail('La fecha es obligatoria.');
      if (!is_numeric($monto)) repreg_json_fail('El monto debe ser numérico.');

      $montoNum = (float)$monto;
      if ($montoNum <= 0) repreg_json_fail('El monto debe ser mayor a 0.');

      // ✅ En pagos normalmente NO se edita concepto (es cliente-sistema)
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
      // ⚠️ Depende de tu tabla real. Si me pasás la estructura lo implemento.
      repreg_json_fail('Edición de trabajador aún no implementada en backend.');
    }

    repreg_json_fail('Tipo inválido: ' . $tipo);
  }

  /* =========================
     ELIMINAR EGRESO (POST)
     POST action=reportes&op=eliminar_egreso
     body: { id }
  ========================= */
  if ($op === 'eliminar_egreso') {
    if (repreg_req_method() !== 'POST') repreg_json_fail('Método no permitido. Se esperaba POST');

    $body = repreg_read_json_body();
    $id = $body['id'] ?? null;

    if (!is_numeric($id)) repreg_json_fail('ID inválido.');
    $idInt = (int)$id;
    if ($idInt <= 0) repreg_json_fail('ID inválido.');

    // ✅ verificar que exista (mensaje lindo)
    $stChk = $pdo->prepare("SELECT id_egreso FROM egresos WHERE id_egreso = :id LIMIT 1");
    $stChk->execute([':id' => $idInt]);
    $exists = $stChk->fetchColumn();
    if (!$exists) repreg_json_fail('El egreso no existe o ya fue eliminado.');

    // ✅ borrar
    $st = $pdo->prepare("DELETE FROM egresos WHERE id_egreso = :id");
    $st->execute([':id' => $idInt]);

    if ($st->rowCount() < 1) repreg_json_fail('No se pudo eliminar el egreso.');

    repreg_json_ok(['mensaje' => 'Egreso eliminado correctamente.']);
  }

  /* =========================
     LISTADOS (GET)
  ========================= */
  if (repreg_req_method() !== 'GET') repreg_json_fail('Método no permitido. Se esperaba GET');

  $mes  = repreg_int('mes', 0);    // id_mes (1..12)
  $anio = repreg_int('anio', 0);   // YEAR(fecha)

  /* =========================
     PAGOS
     ✅ devuelve id_medio_pago
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
      COALESCE(p.monto, 0)      AS monto
    FROM pagos p
    JOIN clientes_sistemas cs ON cs.id_sistema = p.id_sistema
    JOIN clientes c          ON c.id_cliente  = cs.id_cliente
    LEFT JOIN meses m        ON m.id_mes      = p.id_mes
    LEFT JOIN medios_pago mp ON mp.id_medio_pago = p.id_medio_pago
    WHERE 1=1
  ";

  $paramsP = [];

  if ($mes > 0) {
    $sqlP .= " AND p.id_mes = :mes ";
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
     ✅ devuelve id_medio_pago
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
      COALESCE(e.monto, 0)    AS monto
    FROM egresos e
    LEFT JOIN meses m
      ON m.id_mes = MONTH(e.fecha)
    LEFT JOIN medios_pago mp
      ON mp.id_medio_pago = e.id_medio_pago
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
