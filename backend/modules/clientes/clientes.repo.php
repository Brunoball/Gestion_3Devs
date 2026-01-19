<?php
// backend/modules/clientes/clientes.repo.php
declare(strict_types=1);

/* =========================
   CLIENTES (devuelven JSON)
========================= */

function clientes_listar(): void {
  global $pdo;

  try {
    $st = $pdo->query("
      SELECT id_cliente, nombre, notas, activo
      FROM clientes
      ORDER BY nombre ASC
    ");
    json_out(['exito' => true, 'clientes' => $st->fetchAll(PDO::FETCH_ASSOC)]);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error listando clientes: ' . $e->getMessage()]);
  }
}

function clientes_crear(): void {
  global $pdo;
  $in = read_json();

  $nombre = trim((string)($in['nombre'] ?? ''));
  $notas  = trim((string)($in['notas'] ?? ''));

  if ($nombre === '') json_out(['exito' => false, 'mensaje' => 'Nombre requerido']);

  try {
    $st = $pdo->prepare("INSERT INTO clientes (nombre, notas) VALUES (:n, :no)");
    $st->execute([
      ':n'  => $nombre,
      ':no' => ($notas === '' ? null : $notas),
    ]);
    json_out(['exito' => true, 'mensaje' => 'Cliente creado']);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error creando cliente: ' . $e->getMessage()]);
  }
}

function clientes_actualizar(): void {
  global $pdo;
  $in = read_json();

  $id_cliente = (int)($in['id_cliente'] ?? 0);
  $nombre     = trim((string)($in['nombre'] ?? ''));
  $notas      = trim((string)($in['notas'] ?? ''));

  if ($id_cliente <= 0) json_out(['exito' => false, 'mensaje' => 'id_cliente inválido']);
  if ($nombre === '') json_out(['exito' => false, 'mensaje' => 'Nombre requerido']);

  try {
    $st = $pdo->prepare("UPDATE clientes SET nombre=:n, notas=:no WHERE id_cliente=:id");
    $st->execute([
      ':n'  => $nombre,
      ':no' => ($notas === '' ? null : $notas),
      ':id' => $id_cliente,
    ]);
    json_out(['exito' => true, 'mensaje' => 'Cliente actualizado']);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error actualizando cliente: ' . $e->getMessage()]);
  }
}

function clientes_eliminar(): void {
  global $pdo;
  $in = read_json();

  $id_cliente = (int)($in['id_cliente'] ?? 0);
  if ($id_cliente <= 0) json_out(['exito' => false, 'mensaje' => 'id_cliente inválido']);

  try {
    $st = $pdo->prepare("DELETE FROM clientes WHERE id_cliente=:id");
    $st->execute([':id' => $id_cliente]);
    json_out(['exito' => true, 'mensaje' => 'Cliente eliminado']);
  } catch (Throwable $e) {
    json_out(['exito' => false, 'mensaje' => 'Error eliminando cliente: ' . $e->getMessage()]);
  }
}

/* =========================
   FACTURACIÓN (DB PURAS)
   - NO usan json_out
   - Se usan desde clientes.php handlers
========================= */

function clientes_facturacion_get(PDO $pdo, int $id_cliente): ?array
{
  $sql = "SELECT id_cliente, doc_tipo, doc_nro, razon_social, domicilio, cond_iva, cond_venta, created_at
          FROM clientes_facturacion
          WHERE id_cliente = ?
          LIMIT 1";
  $st = $pdo->prepare($sql);
  $st->execute([$id_cliente]);
  $row = $st->fetch(PDO::FETCH_ASSOC);

  return $row ?: null;
}

function clientes_facturacion_upsert(PDO $pdo, array $in): void
{
  $id_cliente   = isset($in['id_cliente']) ? (int)$in['id_cliente'] : 0;
  $doc_tipo     = isset($in['doc_tipo']) ? (int)$in['doc_tipo'] : 0;
  $doc_nro_raw  = isset($in['doc_nro']) ? (string)$in['doc_nro'] : "";
  $razon_social = isset($in['razon_social']) ? trim((string)$in['razon_social']) : "";
  $domicilio    = isset($in['domicilio']) ? trim((string)$in['domicilio']) : "";
  $cond_iva     = isset($in['cond_iva']) ? trim((string)$in['cond_iva']) : "IVA Sujeto Exento";
  $cond_venta   = isset($in['cond_venta']) ? trim((string)$in['cond_venta']) : "Contado / Transferencia Bancaria";

  if ($id_cliente <= 0) {
    throw new Exception("id_cliente inválido");
  }
  if (!in_array($doc_tipo, [80, 96], true)) {
    throw new Exception("doc_tipo inválido (80/96)");
  }

  // doc_nro: solo números
  $doc_nro_clean = preg_replace('/\D+/', '', $doc_nro_raw);
  if ($doc_nro_clean === "") {
    throw new Exception("doc_nro obligatorio");
  }

  if ($razon_social === "") {
    throw new Exception("razon_social obligatoria");
  }

  $sql = "INSERT INTO clientes_facturacion
            (id_cliente, doc_tipo, doc_nro, razon_social, domicilio, cond_iva, cond_venta)
          VALUES
            (:id_cliente, :doc_tipo, :doc_nro, :razon_social, :domicilio, :cond_iva, :cond_venta)
          ON DUPLICATE KEY UPDATE
            doc_tipo     = VALUES(doc_tipo),
            doc_nro      = VALUES(doc_nro),
            razon_social = VALUES(razon_social),
            domicilio    = VALUES(domicilio),
            cond_iva     = VALUES(cond_iva),
            cond_venta   = VALUES(cond_venta)";

  $st = $pdo->prepare($sql);
  $st->execute([
    ':id_cliente'   => $id_cliente,
    ':doc_tipo'     => $doc_tipo,
    // BIGINT: como string numérico (seguro)
    ':doc_nro'      => $doc_nro_clean,
    ':razon_social' => $razon_social,
    ':domicilio'    => $domicilio,
    ':cond_iva'     => ($cond_iva !== '' ? $cond_iva : 'IVA Sujeto Exento'),
    ':cond_venta'   => ($cond_venta !== '' ? $cond_venta : 'Contado / Transferencia Bancaria'),
  ]);
}
