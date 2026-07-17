<?php
// backend/modules/global/obtener_listas.php
declare(strict_types=1);

global $pdo;

$auth = $GLOBALS['GLOBAL_AUTH'] ?? null;
if (!is_array($auth) || empty($auth['id_organizacion'])) {
  auth_json_error('Sesión multiempresa requerida.', 401);
}
$idOrganizacion = (int)$auth['id_organizacion'];

try {
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec('SET NAMES utf8mb4');

  $st = $pdo->prepare("\n    SELECT\n      t.id, t.nombre, t.apellido, t.email, t.alias_pago, t.fecha_alta,\n      tro.rol_en_organizacion AS rol, tro.activo\n    FROM trabajadores_organizaciones tro\n    INNER JOIN trabajadores t ON t.id = tro.id_trabajador\n    WHERE tro.id_organizacion = :org\n      AND tro.activo = 1\n    ORDER BY t.apellido, t.nombre\n  ");
  $st->execute([':org' => $idOrganizacion]);
  $trabajadores = array_map(static fn(array $r): array => [
    'id' => (int)$r['id'],
    'nombre' => (string)$r['nombre'],
    'apellido' => (string)$r['apellido'],
    'email' => $r['email'] !== null ? (string)$r['email'] : null,
    'rol' => (string)$r['rol'],
    'alias_pago' => $r['alias_pago'] !== null ? (string)$r['alias_pago'] : null,
    'activo' => (int)$r['activo'],
    'fecha_alta' => (string)$r['fecha_alta'],
  ], $st->fetchAll(PDO::FETCH_ASSOC) ?: []);

  $st = $pdo->prepare("\n    SELECT id_medio_pago AS id, nombre, activo\n    FROM medios_pago\n    WHERE id_organizacion = :org AND activo = 1\n    ORDER BY nombre\n  ");
  $st->execute([':org' => $idOrganizacion]);
  $mediosPago = array_map(static fn(array $r): array => [
    'id' => (int)$r['id'],
    'nombre' => (string)$r['nombre'],
    'activo' => (int)$r['activo'],
  ], $st->fetchAll(PDO::FETCH_ASSOC) ?: []);

  $st = $pdo->prepare("\n    SELECT id, nombre, descripcion, monto, activo, fecha_creacion\n    FROM planes_mantenimiento\n    WHERE id_organizacion = :org AND activo = 1\n    ORDER BY nombre\n  ");
  $st->execute([':org' => $idOrganizacion]);
  $planes = array_map(static fn(array $r): array => [
    'id' => (int)$r['id'],
    'nombre' => (string)$r['nombre'],
    'descripcion' => $r['descripcion'] !== null ? (string)$r['descripcion'] : null,
    'monto' => (float)$r['monto'],
    'activo' => (int)$r['activo'],
    'fecha_creacion' => (string)$r['fecha_creacion'],
  ], $st->fetchAll(PDO::FETCH_ASSOC) ?: []);

  $meses = array_map(static fn(array $r): array => [
    'id' => (int)$r['id'],
    'mes' => (string)$r['mes'],
  ], $pdo->query('SELECT id_mes AS id, mes FROM meses ORDER BY id_mes', PDO::FETCH_ASSOC)->fetchAll() ?: []);

  $st = $pdo->prepare("\n    SELECT DISTINCT anio_periodo AS anio\n    FROM pagos\n    WHERE id_organizacion = :org\n    ORDER BY anio DESC\n  ");
  $st->execute([':org' => $idOrganizacion]);
  $anios = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN) ?: []);

  $iva = array_map(static fn(array $r): array => [
    'id' => (int)$r['id'],
    'descripcion' => (string)$r['descripcion'],
    'clases_permitidas' => (string)$r['clases_permitidas'],
    'activo' => (int)$r['activo'],
  ], $pdo->query("\n    SELECT id_condicion_iva AS id, descripcion, clases_permitidas, activo\n    FROM iva_condiciones\n    WHERE activo = 1\n    ORDER BY id_condicion_iva\n  ", PDO::FETCH_ASSOC)->fetchAll() ?: []);

  echo json_encode([
    'exito' => true,
    'id_organizacion' => $idOrganizacion,
    'listas' => [
      'trabajadores' => $trabajadores,
      'medios_pago' => $mediosPago,
      'planes_mantenimiento' => $planes,
      'meses' => $meses,
      'anios' => $anios,
      'iva_condiciones' => $iva,
    ],
  ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'Error cargando listas: ' . $e->getMessage(),
  ], JSON_UNESCAPED_UNICODE);
}
