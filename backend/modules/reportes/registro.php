<?php
// backend/modules/reportes/reportes.php
declare(strict_types=1);

global $pdo;

$op = $_GET['op'] ?? '';

try {

  /* =========================
     OP: ANIOS
     GET /api.php?action=reportes&op=anios
     -> { exito:true, anios:[2026,2025,...] }
  ========================= */
  if ($op === 'anios') {

    // Si querés, después podemos unir años de pagos + egresos.
    $stmt = $pdo->query("
      SELECT DISTINCT YEAR(fecha) AS anio
      FROM egresos
      ORDER BY anio DESC
    ");
    $anios = $stmt->fetchAll(PDO::FETCH_COLUMN);

    echo json_encode([
      'exito' => true,
      'anios' => $anios,
    ], JSON_UNESCAPED_UNICODE);
    exit;
  }

  /* =========================
     OP: MOVIMIENTOS
     GET /api.php?action=reportes&op=movimientos
     GET /api.php?action=reportes&op=movimientos&anio=YYYY
     GET /api.php?action=reportes&op=movimientos&mes=ID_MES
     GET /api.php?action=reportes&op=movimientos&anio=YYYY&mes=ID_MES
     -> { exito:true, pagos:[], egresos:[...] }
  ========================= */
  if ($op === 'movimientos') {

    $anio = isset($_GET['anio']) ? (int)$_GET['anio'] : null;
    $mes  = isset($_GET['mes'])  ? (int)$_GET['mes']  : null;

    // =========================
    // EGRESOS (según tu DB)
    // egresos.id_medio_pago -> medios_pago.id_medio_pago
    // =========================
    $sqlE = "
      SELECT
        e.id_egreso AS id,
        e.fecha     AS fecha,
        e.concepto  AS concepto,
        UPPER(COALESCE(m.mes, '')) AS categoria,
        COALESCE(mp.nombre, '')    AS medio,
        e.monto     AS monto
      FROM egresos e
      LEFT JOIN meses m
        ON m.id = MONTH(e.fecha)
      LEFT JOIN medios_pago mp
        ON mp.id_medio_pago = e.id_medio_pago
      WHERE 1=1
    ";

    $params = [];

    if ($anio) {
      $sqlE .= " AND YEAR(e.fecha) = :anio ";
      $params[':anio'] = $anio;
    }

    if ($mes) {
      $sqlE .= " AND MONTH(e.fecha) = :mes ";
      $params[':mes'] = $mes;
    }

    $sqlE .= " ORDER BY e.fecha DESC, e.id_egreso DESC ";

    $stE = $pdo->prepare($sqlE);
    $stE->execute($params);
    $egresos = $stE->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
      'exito'   => true,
      'pagos'   => [],       // (si después querés, lo sumamos acá)
      'egresos' => $egresos,
    ], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // Si op no coincide
  echo json_encode([
    'exito'   => false,
    'mensaje' => 'op no válida en reportes: ' . $op
  ], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  echo json_encode([
    'exito'   => false,
    'mensaje' => 'Error en reportes: ' . $e->getMessage()
  ], JSON_UNESCAPED_UNICODE);
  exit;
}
