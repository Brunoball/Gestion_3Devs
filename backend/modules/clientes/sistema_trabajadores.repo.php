<?php
// backend/modules/clientes/sistema_trabajadores.repo.php
declare(strict_types=1);

require_once __DIR__ . '/../reparto/reparto.service.php';

/** Mantiene compatible la columna histórica; los montos se dividen por cantidad. */
function sistema_trabajadores_rebalancear(PDO $pdo, int $idOrganizacion, int $idSistema): void
{
  $st = $pdo->prepare("
    SELECT id_trabajador
    FROM sistemas_trabajadores
    WHERE id_organizacion = :org AND id_sistema = :sistema
    ORDER BY id_trabajador
  ");
  $st->execute([':org' => $idOrganizacion, ':sistema' => $idSistema]);
  $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN) ?: []);
  $porcentajes = reparto_porcentajes_partes_iguales(count($ids));
  if (!$ids) return;

  $update = $pdo->prepare("
    UPDATE sistemas_trabajadores
    SET porcentaje_reparto = :porcentaje
    WHERE id_organizacion = :org
      AND id_sistema = :sistema
      AND id_trabajador = :trabajador
  ");
  foreach ($ids as $index => $idTrabajador) {
    $update->execute([
      ':porcentaje' => $porcentajes[$index],
      ':org' => $idOrganizacion,
      ':sistema' => $idSistema,
      ':trabajador' => $idTrabajador,
    ]);
  }
}

function sistema_trabajadores_listar(): void
{
  global $pdo;
  $idOrganizacion = clientes_org_id();
  $idSistema = (int)($_GET['id_sistema'] ?? 0);

  if ($idSistema <= 0) json_out(['exito' => false, 'mensaje' => 'id_sistema inválido'], 422);
  if (!clientes_sistema_exists($pdo, $idOrganizacion, $idSistema)) {
    json_out(['exito' => false, 'mensaje' => 'Sistema inexistente en esta organización.'], 404);
  }

  try {
    $org = reparto_organizacion_config($pdo, $idOrganizacion);
    $direct = reparto_items_sistema($pdo, $idOrganizacion, $idSistema);

    json_out([
      'exito' => true,
      'modelo_reparto' => $org['modelo_reparto'],
      'configurado' => $direct['configurado'],
      'total' => $direct['total'],
      'asignados' => $direct['items'],
    ]);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error listando el equipo del sistema.'], 500);
  }
}

function sistema_trabajadores_agregar(): void
{
  global $pdo;
  clientes_require_write();

  $in = read_json();
  $idOrganizacion = clientes_org_id();
  $idSistema = (int)($in['id_sistema'] ?? 0);
  $idTrabajador = (int)($in['id_trabajador'] ?? 0);

  if ($idSistema <= 0) json_out(['exito' => false, 'mensaje' => 'id_sistema inválido'], 422);
  if ($idTrabajador <= 0) json_out(['exito' => false, 'mensaje' => 'id_trabajador inválido'], 422);
  if (!clientes_sistema_exists($pdo, $idOrganizacion, $idSistema)) {
    json_out(['exito' => false, 'mensaje' => 'Sistema inexistente en esta organización.'], 404);
  }

  $org = reparto_organizacion_config($pdo, $idOrganizacion);
  if ($org['modelo_reparto'] !== 'por_sistema') {
    json_out([
      'exito' => false,
      'mensaje' => 'Esta entidad usa un reparto general. No es necesario asignar trabajadores a cada sistema.',
    ], 409);
  }

  try {
    $check = $pdo->prepare("
      SELECT 1
      FROM trabajadores_organizaciones tro
      INNER JOIN trabajadores t ON t.id = tro.id_trabajador
      WHERE tro.id_organizacion = :id_organizacion
        AND tro.id_trabajador = :id_trabajador
        AND tro.activo = 1
        AND t.activo = 1
      LIMIT 1
    ");
    $check->execute([
      ':id_organizacion' => $idOrganizacion,
      ':id_trabajador' => $idTrabajador,
    ]);
    if (!$check->fetchColumn()) {
      json_out(['exito' => false, 'mensaje' => 'Trabajador inexistente o inactivo en esta organización.'], 404);
    }

    $pdo->beginTransaction();
    $st = $pdo->prepare("
      INSERT INTO sistemas_trabajadores
        (id_organizacion, id_sistema, id_trabajador, porcentaje_reparto)
      VALUES
        (:id_organizacion, :id_sistema, :id_trabajador, 100)
      ON DUPLICATE KEY UPDATE
        id_trabajador = VALUES(id_trabajador)
    ");
    $st->execute([
      ':id_organizacion' => $idOrganizacion,
      ':id_sistema' => $idSistema,
      ':id_trabajador' => $idTrabajador,
    ]);
    sistema_trabajadores_rebalancear($pdo, $idOrganizacion, $idSistema);
    $pdo->commit();

    json_out(['exito' => true, 'mensaje' => 'Trabajador asignado. El monto se reparte en partes iguales.']);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_out(['exito' => false, 'mensaje' => 'Error asignando trabajador.'], 500);
  }
}

/**
 * Guarda el equipo completo de un sistema en una sola operación.
 * El monto se reparte en partes iguales entre sus integrantes.
 */
function sistema_trabajadores_guardar(): void
{
  global $pdo;
  clientes_require_write();

  $in = read_json();
  $idOrganizacion = clientes_org_id();
  $idSistema = (int)($in['id_sistema'] ?? 0);
  $items = $in['items'] ?? [];

  if ($idSistema <= 0) json_out(['exito' => false, 'mensaje' => 'id_sistema inválido'], 422);
  if (!is_array($items) || count($items) === 0) {
    json_out(['exito' => false, 'mensaje' => 'Asigná al menos un integrante al sistema.'], 422);
  }
  if (!clientes_sistema_exists($pdo, $idOrganizacion, $idSistema)) {
    json_out(['exito' => false, 'mensaje' => 'Sistema inexistente en esta organización.'], 404);
  }

  $org = reparto_organizacion_config($pdo, $idOrganizacion);
  if ($org['modelo_reparto'] !== 'por_sistema') {
    json_out([
      'exito' => false,
      'mensaje' => 'Esta entidad usa un reparto general y no necesita equipo contable por sistema.',
    ], 409);
  }

  $normalized = [];
  $seen = [];
  foreach ($items as $item) {
    $idTrabajador = (int)($item['id_trabajador'] ?? $item['id'] ?? 0);
    $rolSistema = trim((string)($item['rol_en_sistema'] ?? ''));

    if ($idTrabajador <= 0) {
      json_out(['exito' => false, 'mensaje' => 'Hay un integrante inválido.'], 422);
    }
    if (isset($seen[$idTrabajador])) {
      json_out(['exito' => false, 'mensaje' => 'No se puede repetir el mismo trabajador.'], 422);
    }
    $seen[$idTrabajador] = true;
    $normalized[] = [
      'id_trabajador' => $idTrabajador,
      'rol_en_sistema' => $rolSistema === '' ? null : mb_substr($rolSistema, 0, 60),
    ];
  }

  $porcentajesCompatibles = reparto_porcentajes_partes_iguales(count($normalized));
  foreach ($normalized as $index => &$item) {
    $item['porcentaje'] = $porcentajesCompatibles[$index];
  }
  unset($item);

  try {
    $ids = array_column($normalized, 'id_trabajador');
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $check = $pdo->prepare("
      SELECT tro.id_trabajador
      FROM trabajadores_organizaciones tro
      INNER JOIN trabajadores t ON t.id = tro.id_trabajador
      WHERE tro.id_organizacion = ?
        AND tro.activo = 1
        AND t.activo = 1
        AND tro.id_trabajador IN ($ph)
    ");
    $check->execute(array_merge([$idOrganizacion], $ids));
    $valid = array_map('intval', $check->fetchAll(PDO::FETCH_COLUMN) ?: []);
    sort($valid);
    $expected = array_map('intval', $ids);
    sort($expected);
    if ($valid !== $expected) {
      json_out(['exito' => false, 'mensaje' => 'Uno o más trabajadores no pertenecen a esta entidad.'], 422);
    }

    $pdo->beginTransaction();
    $pdo->prepare("
      DELETE FROM sistemas_trabajadores
      WHERE id_organizacion = :org AND id_sistema = :sistema
    ")->execute([':org' => $idOrganizacion, ':sistema' => $idSistema]);

    $ins = $pdo->prepare("
      INSERT INTO sistemas_trabajadores
        (id_organizacion, id_sistema, id_trabajador, rol_en_sistema, porcentaje_reparto)
      VALUES
        (:org, :sistema, :trabajador, :rol, :porcentaje)
    ");
    foreach ($normalized as $item) {
      $ins->execute([
        ':org' => $idOrganizacion,
        ':sistema' => $idSistema,
        ':trabajador' => $item['id_trabajador'],
        ':rol' => $item['rol_en_sistema'],
        ':porcentaje' => $item['porcentaje'],
      ]);
    }
    $pdo->commit();

    json_out([
      'exito' => true,
      'mensaje' => 'Equipo guardado. El monto se divide en partes iguales entre sus integrantes.',
      'cantidad_integrantes' => count($normalized),
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_out(['exito' => false, 'mensaje' => 'Error guardando el equipo del sistema.'], 500);
  }
}

function sistema_trabajadores_quitar(): void
{
  global $pdo;
  clientes_require_write();

  $in = read_json();
  $idOrganizacion = clientes_org_id();
  $idSistema = (int)($in['id_sistema'] ?? 0);
  $idTrabajador = (int)($in['id_trabajador'] ?? 0);

  if ($idSistema <= 0) json_out(['exito' => false, 'mensaje' => 'id_sistema inválido'], 422);
  if ($idTrabajador <= 0) json_out(['exito' => false, 'mensaje' => 'id_trabajador inválido'], 422);

  try {
    $pdo->beginTransaction();
    $st = $pdo->prepare("
      DELETE FROM sistemas_trabajadores
      WHERE id_organizacion = :id_organizacion
        AND id_sistema = :id_sistema
        AND id_trabajador = :id_trabajador
    ");
    $st->execute([
      ':id_organizacion' => $idOrganizacion,
      ':id_sistema' => $idSistema,
      ':id_trabajador' => $idTrabajador,
    ]);
    sistema_trabajadores_rebalancear($pdo, $idOrganizacion, $idSistema);
    $pdo->commit();

    json_out(['exito' => true, 'mensaje' => 'Trabajador quitado. El equipo restante se reparte en partes iguales.']);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_out(['exito' => false, 'mensaje' => 'Error quitando trabajador.'], 500);
  }
}
