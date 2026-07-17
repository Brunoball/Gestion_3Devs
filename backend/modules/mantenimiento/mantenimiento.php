<?php
// backend/modules/mantenimiento/mantenimiento.php
declare(strict_types=1);

global $pdo;
$op = strtolower(trim((string)($_GET['op'] ?? '')));

if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');

function mant_ok(array $extra = []): never
{
  http_response_code(200);
  echo json_encode(array_merge(['exito' => true], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

function mant_fail(string $mensaje, int $status = 422, array $extra = []): never
{
  http_response_code($status);
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $mensaje], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

function mant_auth(): array
{
  $ctx = $GLOBALS['MANTENIMIENTO_AUTH'] ?? null;
  if (!is_array($ctx) || empty($ctx['id_organizacion'])) {
    mant_fail('No se pudo resolver la organización activa.', 401);
  }
  return $ctx;
}

function mant_org_id(): int
{
  return (int)mant_auth()['id_organizacion'];
}

function mant_require_write(): void
{
  $role = strtolower((string)(mant_auth()['rol_organizacion'] ?? 'vista'));
  if (!in_array($role, ['admin', 'contador'], true)) {
    mant_fail('Tu usuario tiene acceso de solo lectura en esta entidad.', 403);
  }
}

function mant_body(): array
{
  $raw = file_get_contents('php://input');
  $json = json_decode($raw ?: '{}', true);
  return array_merge($_POST ?? [], is_array($json) ? $json : []);
}

function mant_method(string $expected): void
{
  if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== strtoupper($expected)) {
    mant_fail('Método no permitido.', 405);
  }
}

function mant_str(mixed $value, int $max): string
{
  $value = trim((string)$value);
  return mb_strlen($value) > $max ? mb_substr($value, 0, $max) : $value;
}

function mant_money(mixed $value): float
{
  $normalized = str_replace(',', '.', trim((string)$value));
  if ($normalized === '' || !is_numeric($normalized)) return -1;
  return round((float)$normalized, 2);
}

try {
  if (!($pdo instanceof PDO)) mant_fail('Conexión PDO no disponible.', 500);
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $org = mant_org_id();

  switch ($op) {
    case 'ping':
      mant_ok(['modulo' => 'mantenimiento', 'organizacion' => $org]);

    case 'planes': {
      $verInactivos = (int)($_GET['ver_inactivos'] ?? 0) === 1;
      $sql = "
        SELECT id, id_organizacion, nombre, descripcion, monto, activo, fecha_creacion
        FROM planes_mantenimiento
        WHERE id_organizacion = :org
      ";
      if (!$verInactivos) $sql .= ' AND activo = 1';
      $sql .= ' ORDER BY activo DESC, nombre ASC';
      $st = $pdo->prepare($sql);
      $st->execute([':org' => $org]);
      mant_ok([
        'planes' => $st->fetchAll(PDO::FETCH_ASSOC) ?: [],
        'organizacion' => [
          'id_organizacion' => $org,
          'codigo' => (string)mant_auth()['organizacion_codigo'],
          'nombre' => (string)mant_auth()['organizacion_nombre'],
        ],
      ]);
    }

    case 'plan_get': {
      $id = (int)($_GET['id'] ?? 0);
      if ($id <= 0) mant_fail('ID inválido.');
      $st = $pdo->prepare("
        SELECT id, id_organizacion, nombre, descripcion, monto, activo, fecha_creacion
        FROM planes_mantenimiento
        WHERE id_organizacion = :org AND id = :id
        LIMIT 1
      ");
      $st->execute([':org' => $org, ':id' => $id]);
      $row = $st->fetch(PDO::FETCH_ASSOC);
      if (!$row) mant_fail('Plan no encontrado en esta entidad.', 404);
      mant_ok(['plan' => $row]);
    }

    case 'crear_plan': {
      mant_method('POST');
      mant_require_write();
      $in = mant_body();
      $nombre = mant_str($in['nombre'] ?? '', 80);
      $descripcion = mant_str($in['descripcion'] ?? '', 255);
      $monto = mant_money($in['monto'] ?? '');
      $activo = (int)($in['activo'] ?? 1) === 1 ? 1 : 0;
      if ($nombre === '') mant_fail('El nombre es obligatorio.');
      if ($monto < 0) mant_fail('El monto es inválido.');

      try {
        $st = $pdo->prepare("
          INSERT INTO planes_mantenimiento
            (id_organizacion, nombre, descripcion, monto, activo)
          VALUES
            (:org, :nombre, :descripcion, :monto, :activo)
        ");
        $st->execute([
          ':org' => $org,
          ':nombre' => $nombre,
          ':descripcion' => $descripcion === '' ? null : $descripcion,
          ':monto' => $monto,
          ':activo' => $activo,
        ]);
        mant_ok(['mensaje' => 'Plan creado.', 'id' => (int)$pdo->lastInsertId()]);
      } catch (PDOException $e) {
        if ((string)$e->getCode() === '23000') mant_fail('Ya existe un plan con ese nombre en esta entidad.', 409);
        throw $e;
      }
    }

    case 'editar_plan': {
      mant_method('POST');
      mant_require_write();
      $in = mant_body();
      $id = (int)($in['id'] ?? 0);
      $nombre = mant_str($in['nombre'] ?? '', 80);
      $descripcion = mant_str($in['descripcion'] ?? '', 255);
      $monto = mant_money($in['monto'] ?? '');
      $activo = (int)($in['activo'] ?? 1) === 1 ? 1 : 0;
      if ($id <= 0 || $nombre === '') mant_fail('Datos del plan incompletos.');
      if ($monto < 0) mant_fail('El monto es inválido.');

      try {
        $st = $pdo->prepare("
          UPDATE planes_mantenimiento
          SET nombre = :nombre,
              descripcion = :descripcion,
              monto = :monto,
              activo = :activo
          WHERE id_organizacion = :org AND id = :id
        ");
        $st->execute([
          ':nombre' => $nombre,
          ':descripcion' => $descripcion === '' ? null : $descripcion,
          ':monto' => $monto,
          ':activo' => $activo,
          ':org' => $org,
          ':id' => $id,
        ]);
        if ($st->rowCount() === 0) {
          $check = $pdo->prepare('SELECT 1 FROM planes_mantenimiento WHERE id_organizacion=:org AND id=:id');
          $check->execute([':org' => $org, ':id' => $id]);
          if (!$check->fetchColumn()) mant_fail('Plan no encontrado en esta entidad.', 404);
        }
        mant_ok(['mensaje' => 'Plan actualizado.']);
      } catch (PDOException $e) {
        if ((string)$e->getCode() === '23000') mant_fail('Ya existe un plan con ese nombre en esta entidad.', 409);
        throw $e;
      }
    }

    case 'eliminar_plan': {
      mant_method('POST');
      mant_require_write();
      $id = (int)(mant_body()['id'] ?? 0);
      if ($id <= 0) mant_fail('ID inválido.');

      // Baja lógica: un sistema puede seguir referenciando el plan históricamente.
      $st = $pdo->prepare("
        UPDATE planes_mantenimiento
        SET activo = 0
        WHERE id_organizacion = :org AND id = :id
      ");
      $st->execute([':org' => $org, ':id' => $id]);
      if ($st->rowCount() === 0) mant_fail('Plan no encontrado o ya inactivo.', 404);
      mant_ok(['mensaje' => 'Plan dado de baja.']);
    }

    default:
      mant_fail('OP no válida en mantenimiento: ' . $op, 404);
  }
} catch (Throwable $e) {
  mant_fail('Error interno en Mantenimiento.', 500, ['detalle' => $e->getMessage()]);
}
