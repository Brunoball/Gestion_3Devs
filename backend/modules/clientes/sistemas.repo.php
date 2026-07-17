<?php
// backend/modules/clientes/sistemas.repo.php
declare(strict_types=1);

function clientes_validar_plan(PDO $pdo, int $idOrganizacion, ?int $idPlan): ?int
{
  if (!$idPlan || $idPlan <= 0) return null;

  $st = $pdo->prepare("
    SELECT id
    FROM planes_mantenimiento
    WHERE id_organizacion = :org
      AND id = :plan
      AND activo = 1
    LIMIT 1
  ");
  $st->execute([':org' => $idOrganizacion, ':plan' => $idPlan]);
  if (!$st->fetchColumn()) {
    json_out(['exito' => false, 'mensaje' => 'El plan no pertenece a la organización activa o está inactivo.'], 422);
  }
  return $idPlan;
}

function clientes_sistemas_listar(): void
{
  global $pdo;
  $idOrganizacion = clientes_org_id();
  $idCliente = (int)($_GET['id_cliente'] ?? 0);

  if ($idCliente <= 0) json_out(['exito' => false, 'mensaje' => 'id_cliente inválido'], 422);
  if (!clientes_cliente_exists($pdo, $idOrganizacion, $idCliente)) {
    json_out(['exito' => false, 'mensaje' => 'Cliente inexistente en esta organización.'], 404);
  }

  try {
    $st = $pdo->prepare("
      SELECT
        cs.id_sistema,
        cs.id_organizacion,
        cs.id_cliente,
        cs.nombre,
        cs.descripcion,
        cs.id_plan,
        pm.nombre AS plan_nombre,
        pm.monto AS plan_monto,
        cs.monto_mensual,
        cs.estado,
        cs.fecha_inicio,
        COALESCE((
          SELECT ROUND(SUM(st.porcentaje_reparto), 4)
          FROM sistemas_trabajadores st
          WHERE st.id_organizacion = cs.id_organizacion
            AND st.id_sistema = cs.id_sistema
        ), 0) AS reparto_total,
        (
          SELECT COUNT(*)
          FROM sistemas_trabajadores st
          WHERE st.id_organizacion = cs.id_organizacion
            AND st.id_sistema = cs.id_sistema
        ) AS integrantes
      FROM clientes_sistemas cs
      LEFT JOIN planes_mantenimiento pm
        ON pm.id_organizacion = cs.id_organizacion
       AND pm.id = cs.id_plan
      WHERE cs.id_organizacion = :id_organizacion
        AND cs.id_cliente = :id_cliente
      ORDER BY cs.nombre ASC
    ");
    $st->execute([
      ':id_organizacion' => $idOrganizacion,
      ':id_cliente' => $idCliente,
    ]);

    $org = reparto_organizacion_config($pdo, $idOrganizacion);
    json_out([
      'exito' => true,
      'modelo_reparto' => $org['modelo_reparto'],
      'sistemas' => $st->fetchAll(PDO::FETCH_ASSOC),
    ]);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error listando sistemas.'], 500);
  }
}

function clientes_sistemas_crear(): void
{
  global $pdo;
  clientes_require_write();

  $in = read_json();
  $idOrganizacion = clientes_org_id();
  $idCliente = (int)($in['id_cliente'] ?? 0);
  $nombre = trim((string)($in['nombre'] ?? ''));
  $descripcion = trim((string)($in['descripcion'] ?? ''));
  $idPlan = isset($in['id_plan']) && is_numeric($in['id_plan']) ? (int)$in['id_plan'] : null;
  $montoMensual = max(0, round((float)($in['monto_mensual'] ?? 0), 2));
  $estado = trim((string)($in['estado'] ?? 'activo'));
  $fechaInicio = trim((string)($in['fecha_inicio'] ?? ''));

  if ($idCliente <= 0) json_out(['exito' => false, 'mensaje' => 'id_cliente inválido'], 422);
  if ($nombre === '') json_out(['exito' => false, 'mensaje' => 'Nombre del sistema requerido'], 422);
  if (!clientes_cliente_exists($pdo, $idOrganizacion, $idCliente)) {
    json_out(['exito' => false, 'mensaje' => 'Cliente inexistente en esta organización.'], 404);
  }

  $idPlan = clientes_validar_plan($pdo, $idOrganizacion, $idPlan);
  if (!in_array($estado, ['activo', 'pausado', 'finalizado'], true)) $estado = 'activo';
  $fecha = preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaInicio) ? $fechaInicio : null;

  try {
    $st = $pdo->prepare("
      INSERT INTO clientes_sistemas
        (id_organizacion, id_cliente, nombre, descripcion, id_plan,
         plan, monto_desarrollo, monto_mensual, estado, fecha_inicio)
      VALUES
        (:id_organizacion, :id_cliente, :nombre, :descripcion, :id_plan,
         'mensual', 0, :monto_mensual, :estado, :fecha_inicio)
    ");
    $st->execute([
      ':id_organizacion' => $idOrganizacion,
      ':id_cliente' => $idCliente,
      ':nombre' => $nombre,
      ':descripcion' => $descripcion === '' ? null : $descripcion,
      ':id_plan' => $idPlan,
      ':monto_mensual' => $montoMensual,
      ':estado' => $estado,
      ':fecha_inicio' => $fecha,
    ]);

    json_out([
      'exito' => true,
      'mensaje' => 'Sistema agregado',
      'id_sistema' => (int)$pdo->lastInsertId(),
    ]);
  } catch (PDOException $e) {
    if ((string)$e->getCode() === '23000') {
      json_out(['exito' => false, 'mensaje' => 'Ya existe un sistema con ese nombre para este cliente.'], 409);
    }
    json_out(['exito' => false, 'mensaje' => 'Error agregando sistema.'], 500);
  }
}

function clientes_sistemas_actualizar(): void
{
  global $pdo;
  clientes_require_write();

  $in = read_json();
  $idOrganizacion = clientes_org_id();
  $idSistema = (int)($in['id_sistema'] ?? 0);
  $nombre = trim((string)($in['nombre'] ?? ''));
  $descripcion = trim((string)($in['descripcion'] ?? ''));
  $idPlan = isset($in['id_plan']) && is_numeric($in['id_plan']) ? (int)$in['id_plan'] : null;
  $montoMensual = max(0, round((float)($in['monto_mensual'] ?? 0), 2));
  $estado = trim((string)($in['estado'] ?? 'activo'));
  $fechaInicio = trim((string)($in['fecha_inicio'] ?? ''));

  if ($idSistema <= 0) json_out(['exito' => false, 'mensaje' => 'id_sistema inválido'], 422);
  if ($nombre === '') json_out(['exito' => false, 'mensaje' => 'Nombre requerido'], 422);
  if (!clientes_sistema_exists($pdo, $idOrganizacion, $idSistema)) {
    json_out(['exito' => false, 'mensaje' => 'Sistema inexistente en esta organización.'], 404);
  }

  $idPlan = clientes_validar_plan($pdo, $idOrganizacion, $idPlan);
  if (!in_array($estado, ['activo', 'pausado', 'finalizado'], true)) $estado = 'activo';
  $fecha = preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaInicio) ? $fechaInicio : null;

  try {
    $st = $pdo->prepare("
      UPDATE clientes_sistemas
      SET nombre = :nombre,
          descripcion = :descripcion,
          id_plan = :id_plan,
          plan = 'mensual',
          monto_desarrollo = 0,
          monto_mensual = :monto_mensual,
          estado = :estado,
          fecha_inicio = :fecha_inicio
      WHERE id_organizacion = :id_organizacion
        AND id_sistema = :id_sistema
    ");
    $st->execute([
      ':nombre' => $nombre,
      ':descripcion' => $descripcion === '' ? null : $descripcion,
      ':id_plan' => $idPlan,
      ':monto_mensual' => $montoMensual,
      ':estado' => $estado,
      ':fecha_inicio' => $fecha,
      ':id_organizacion' => $idOrganizacion,
      ':id_sistema' => $idSistema,
    ]);

    json_out(['exito' => true, 'mensaje' => 'Sistema actualizado']);
  } catch (PDOException $e) {
    if ((string)$e->getCode() === '23000') {
      json_out(['exito' => false, 'mensaje' => 'Ya existe un sistema con ese nombre para este cliente.'], 409);
    }
    json_out(['exito' => false, 'mensaje' => 'Error actualizando sistema.'], 500);
  }
}

function clientes_sistemas_eliminar(): void
{
  global $pdo;
  clientes_require_write();

  $in = read_json();
  $idOrganizacion = clientes_org_id();
  $idSistema = (int)($in['id_sistema'] ?? 0);

  if ($idSistema <= 0) json_out(['exito' => false, 'mensaje' => 'id_sistema inválido'], 422);

  try {
    $st = $pdo->prepare("
      DELETE FROM clientes_sistemas
      WHERE id_organizacion = :id_organizacion
        AND id_sistema = :id_sistema
    ");
    $st->execute([
      ':id_organizacion' => $idOrganizacion,
      ':id_sistema' => $idSistema,
    ]);

    if ($st->rowCount() === 0) {
      json_out(['exito' => false, 'mensaje' => 'Sistema inexistente en esta organización.'], 404);
    }

    json_out(['exito' => true, 'mensaje' => 'Sistema eliminado']);
  } catch (PDOException $e) {
    if ((string)$e->getCode() === '23000') {
      json_out([
        'exito' => false,
        'mensaje' => 'No se puede eliminar porque el sistema tiene pagos o facturas asociadas.',
      ], 409);
    }
    json_out(['exito' => false, 'mensaje' => 'Error eliminando sistema.'], 500);
  }
}
