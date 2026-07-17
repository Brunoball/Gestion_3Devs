<?php
// backend/modules/clientes/clientes.repo.php
declare(strict_types=1);

function clientes_listar(): void
{
  global $pdo;
  $idOrganizacion = clientes_org_id();

  try {
    $st = $pdo->prepare("
      SELECT id_cliente, id_organizacion, nombre, notas, activo
      FROM clientes
      WHERE id_organizacion = :id_organizacion
      ORDER BY nombre ASC
    ");
    $st->execute([':id_organizacion' => $idOrganizacion]);

    json_out([
      'exito' => true,
      'organizacion' => [
        'id_organizacion' => $idOrganizacion,
        'codigo' => clientes_context()['organizacion_codigo'],
        'nombre' => clientes_context()['organizacion_nombre'],
      ],
      'clientes' => $st->fetchAll(PDO::FETCH_ASSOC),
    ]);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error listando clientes.'], 500);
  }
}

function clientes_crear(): void
{
  global $pdo;
  clientes_require_write();

  $in = read_json();
  $idOrganizacion = clientes_org_id();
  $nombre = trim((string)($in['nombre'] ?? ''));
  $notas = trim((string)($in['notas'] ?? ''));

  if ($nombre === '') json_out(['exito' => false, 'mensaje' => 'Nombre requerido'], 422);

  try {
    $st = $pdo->prepare("
      INSERT INTO clientes (id_organizacion, nombre, notas)
      VALUES (:id_organizacion, :nombre, :notas)
    ");
    $st->execute([
      ':id_organizacion' => $idOrganizacion,
      ':nombre' => $nombre,
      ':notas' => $notas === '' ? null : $notas,
    ]);

    json_out([
      'exito' => true,
      'mensaje' => 'Cliente creado',
      'id_cliente' => (int)$pdo->lastInsertId(),
    ]);
  } catch (PDOException $e) {
    if ((string)$e->getCode() === '23000') {
      json_out(['exito' => false, 'mensaje' => 'Ya existe un cliente con ese nombre en esta organización.'], 409);
    }
    json_out(['exito' => false, 'mensaje' => 'Error creando cliente.'], 500);
  }
}

function clientes_actualizar(): void
{
  global $pdo;
  clientes_require_write();

  $in = read_json();
  $idOrganizacion = clientes_org_id();
  $idCliente = (int)($in['id_cliente'] ?? 0);
  $nombre = trim((string)($in['nombre'] ?? ''));
  $notas = trim((string)($in['notas'] ?? ''));

  if ($idCliente <= 0) json_out(['exito' => false, 'mensaje' => 'id_cliente inválido'], 422);
  if ($nombre === '') json_out(['exito' => false, 'mensaje' => 'Nombre requerido'], 422);

  try {
    $st = $pdo->prepare("
      UPDATE clientes
      SET nombre = :nombre, notas = :notas
      WHERE id_organizacion = :id_organizacion
        AND id_cliente = :id_cliente
    ");
    $st->execute([
      ':nombre' => $nombre,
      ':notas' => $notas === '' ? null : $notas,
      ':id_organizacion' => $idOrganizacion,
      ':id_cliente' => $idCliente,
    ]);

    if ($st->rowCount() === 0 && !clientes_cliente_exists($pdo, $idOrganizacion, $idCliente)) {
      json_out(['exito' => false, 'mensaje' => 'Cliente inexistente en esta organización.'], 404);
    }

    json_out(['exito' => true, 'mensaje' => 'Cliente actualizado']);
  } catch (PDOException $e) {
    if ((string)$e->getCode() === '23000') {
      json_out(['exito' => false, 'mensaje' => 'Ya existe un cliente con ese nombre en esta organización.'], 409);
    }
    json_out(['exito' => false, 'mensaje' => 'Error actualizando cliente.'], 500);
  }
}

function clientes_eliminar(): void
{
  global $pdo;
  clientes_require_write();

  $in = read_json();
  $idOrganizacion = clientes_org_id();
  $idCliente = (int)($in['id_cliente'] ?? 0);

  if ($idCliente <= 0) json_out(['exito' => false, 'mensaje' => 'id_cliente inválido'], 422);

  try {
    $st = $pdo->prepare("
      DELETE FROM clientes
      WHERE id_organizacion = :id_organizacion
        AND id_cliente = :id_cliente
    ");
    $st->execute([
      ':id_organizacion' => $idOrganizacion,
      ':id_cliente' => $idCliente,
    ]);

    if ($st->rowCount() === 0) {
      json_out(['exito' => false, 'mensaje' => 'Cliente inexistente en esta organización.'], 404);
    }

    json_out(['exito' => true, 'mensaje' => 'Cliente eliminado']);
  } catch (PDOException $e) {
    if ((string)$e->getCode() === '23000') {
      json_out([
        'exito' => false,
        'mensaje' => 'No se puede eliminar porque el cliente tiene pagos o facturas asociadas.',
      ], 409);
    }
    json_out(['exito' => false, 'mensaje' => 'Error eliminando cliente.'], 500);
  }
}

function iva_condicion_existe(PDO $pdo, int $idCondicionIva): bool
{
  $st = $pdo->prepare("
    SELECT 1
    FROM iva_condiciones
    WHERE id_condicion_iva = :id_condicion_iva
      AND activo = 1
    LIMIT 1
  ");
  $st->execute([':id_condicion_iva' => $idCondicionIva]);
  return (bool)$st->fetchColumn();
}

function clientes_facturacion_get(PDO $pdo, int $idOrganizacion, int $idCliente): ?array
{
  $sql = "
    SELECT
      cf.id_cliente,
      cf.id_organizacion,
      cf.doc_tipo,
      cf.doc_nro,
      cf.razon_social,
      cf.domicilio,
      cf.id_condicion_iva,
      ic.descripcion AS condicion_iva_desc,
      cf.cond_venta,
      cf.created_at
    FROM clientes_facturacion cf
    LEFT JOIN iva_condiciones ic
      ON ic.id_condicion_iva = cf.id_condicion_iva
    WHERE cf.id_organizacion = :id_organizacion
      AND cf.id_cliente = :id_cliente
    LIMIT 1
  ";
  $st = $pdo->prepare($sql);
  $st->execute([
    ':id_organizacion' => $idOrganizacion,
    ':id_cliente' => $idCliente,
  ]);
  $row = $st->fetch(PDO::FETCH_ASSOC);

  return $row ?: null;
}

function clientes_facturacion_upsert(PDO $pdo, array $in): void
{
  $idOrganizacion = (int)($in['id_organizacion'] ?? 0);
  $idCliente = (int)($in['id_cliente'] ?? 0);
  $docTipo = (int)($in['doc_tipo'] ?? 0);
  $docNro = preg_replace('/\D+/', '', (string)($in['doc_nro'] ?? ''));
  $razonSocial = trim((string)($in['razon_social'] ?? ''));
  $domicilio = trim((string)($in['domicilio'] ?? ''));
  $idCondicionIva = (int)($in['id_condicion_iva'] ?? 4);
  $condVenta = trim((string)($in['cond_venta'] ?? 'Contado / Transferencia Bancaria'));

  if ($idOrganizacion <= 0 || $idCliente <= 0) throw new InvalidArgumentException('Cliente inválido');
  if (!in_array($docTipo, [80, 96], true)) throw new InvalidArgumentException('doc_tipo inválido');
  if ($docNro === '') throw new InvalidArgumentException('doc_nro obligatorio');
  if ($razonSocial === '') throw new InvalidArgumentException('razon_social obligatoria');

  $exists = $pdo->prepare("
    SELECT 1
    FROM clientes_facturacion
    WHERE id_organizacion = :id_organizacion
      AND id_cliente = :id_cliente
    LIMIT 1
  ");
  $exists->execute([
    ':id_organizacion' => $idOrganizacion,
    ':id_cliente' => $idCliente,
  ]);

  $params = [
    ':id_cliente' => $idCliente,
    ':id_organizacion' => $idOrganizacion,
    ':doc_tipo' => $docTipo,
    ':doc_nro' => $docNro,
    ':razon_social' => $razonSocial,
    ':domicilio' => $domicilio,
    ':id_condicion_iva' => $idCondicionIva,
    ':cond_venta' => $condVenta !== '' ? $condVenta : 'Contado / Transferencia Bancaria',
  ];

  if ($exists->fetchColumn()) {
    $sql = "
      UPDATE clientes_facturacion
      SET doc_tipo = :doc_tipo,
          doc_nro = :doc_nro,
          razon_social = :razon_social,
          domicilio = :domicilio,
          id_condicion_iva = :id_condicion_iva,
          cond_venta = :cond_venta
      WHERE id_organizacion = :id_organizacion
        AND id_cliente = :id_cliente
    ";
  } else {
    $sql = "
      INSERT INTO clientes_facturacion
        (id_cliente, id_organizacion, doc_tipo, doc_nro, razon_social, domicilio, id_condicion_iva, cond_venta)
      VALUES
        (:id_cliente, :id_organizacion, :doc_tipo, :doc_nro, :razon_social, :domicilio, :id_condicion_iva, :cond_venta)
    ";
  }

  $st = $pdo->prepare($sql);
  $st->execute($params);
}
