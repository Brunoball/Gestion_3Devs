<?php
// backend/modules/pagos/equipo_sistema.php
declare(strict_types=1);

/**
 * GET /api.php?action=pagos&op=equipo_sistema&id_sistema=5&anio=2026&mes=1
 * - anio y mes son opcionales (si no vienen, trae el último pago del sistema)
 *
 * Respuesta:
 * {
 *   "exito": true,
 *   "id_sistema": 5,
 *   "trabajadores": [...],
 *   "pago": { ... } | null
 * }
 */

function pagos_equipo_sistema(): void
{
  global $pdo;

  // helpers json_ok/json_error/resolver_id_mes ya están en pagos.php
  // (este archivo se incluye desde pagos.php)

  $id_sistema = isset($_GET['id_sistema']) && is_numeric($_GET['id_sistema'])
    ? (int)$_GET['id_sistema']
    : 0;

  if ($id_sistema <= 0) json_error("Falta id_sistema");

  // validar que exista el sistema
  $stSys = $pdo->prepare("SELECT id_sistema FROM clientes_sistemas WHERE id_sistema = ? LIMIT 1");
  $stSys->execute([$id_sistema]);
  if (!$stSys->fetchColumn()) {
    json_error("Sistema inexistente (id_sistema=$id_sistema)");
  }

  // =========================
  // 1) trabajadores del sistema
  // =========================
  $sqlT = "
    SELECT
      t.id AS id_trabajador,
      t.nombre,
      t.apellido,
      t.email,
      t.rol,
      t.alias_pago,
      t.activo,
      st.rol_en_sistema,
      st.fecha_asignacion
    FROM sistemas_trabajadores st
    INNER JOIN trabajadores t ON t.id = st.id_trabajador
    WHERE st.id_sistema = :id_sistema
    ORDER BY t.activo DESC, t.apellido ASC, t.nombre ASC
  ";

  $stT = $pdo->prepare($sqlT);
  $stT->execute([':id_sistema' => $id_sistema]);
  $rowsT = $stT->fetchAll(PDO::FETCH_ASSOC);

  $trabajadores = [];
  foreach ($rowsT as $r) {
    $trabajadores[] = [
      'id_trabajador'   => (int)($r['id_trabajador'] ?? 0),
      'nombre'          => (string)($r['nombre'] ?? ''),
      'apellido'        => (string)($r['apellido'] ?? ''),
      'email'           => $r['email'] ?? null,
      'rol'             => (string)($r['rol'] ?? ''),
      'rol_en_sistema'  => $r['rol_en_sistema'] ?? null,
      'alias_pago'      => $r['alias_pago'] ?? null,
      'activo'          => (int)($r['activo'] ?? 0),
      'fecha_asignacion'=> $r['fecha_asignacion'] ?? null,
    ];
  }

  // =========================
  // 2) monto cobrado (pago) del sistema
  //    - si viene anio+mes => busca ese periodo
  //    - si no => trae el último pago del sistema
  // =========================
  $anio = isset($_GET['anio']) && is_numeric($_GET['anio']) ? (int)$_GET['anio'] : 0;
  $mesParam = isset($_GET['mes']) ? trim((string)$_GET['mes']) : '';

  $pago = null;

  try {
    if ($anio >= 2000 && $anio <= 2100 && $mesParam !== '') {
      $idMes = resolver_id_mes($pdo, $mesParam);

      $sqlP = "
        SELECT
          p.id_pago,
          p.id_sistema,
          p.id_mes,
          m.mes AS mes_nombre,
          p.monto,
          p.fecha_pago,
          p.id_medio_pago,
          mp.nombre AS medio_pago
        FROM pagos p
        INNER JOIN meses m        ON m.id_mes = p.id_mes
        INNER JOIN medios_pago mp ON mp.id_medio_pago = p.id_medio_pago
        WHERE p.id_sistema = :id_sistema
          AND p.id_mes = :id_mes
          AND YEAR(p.fecha_pago) = :anio
        ORDER BY p.fecha_pago DESC, p.id_pago DESC
        LIMIT 1
      ";

      $stP = $pdo->prepare($sqlP);
      $stP->execute([
        ':id_sistema' => $id_sistema,
        ':id_mes'     => $idMes,
        ':anio'       => $anio,
      ]);

      $rowP = $stP->fetch(PDO::FETCH_ASSOC);

      if ($rowP) {
        $pago = [
          'id_pago'       => (int)($rowP['id_pago'] ?? 0),
          'id_sistema'    => (int)($rowP['id_sistema'] ?? 0),
          'id_mes'        => (int)($rowP['id_mes'] ?? 0),
          'mes'           => $rowP['mes_nombre'] ?? null,
          'anio'          => $anio,
          'monto'         => isset($rowP['monto']) ? (float)$rowP['monto'] : null,
          'fecha_pago'    => $rowP['fecha_pago'] ?? null,
          'id_medio_pago' => (int)($rowP['id_medio_pago'] ?? 0),
          'medio_pago'    => $rowP['medio_pago'] ?? null,
        ];
      }
    } else {
      // fallback: último pago del sistema
      $sqlLast = "
        SELECT
          p.id_pago,
          p.id_sistema,
          p.id_mes,
          m.mes AS mes_nombre,
          YEAR(p.fecha_pago) AS anio,
          p.monto,
          p.fecha_pago,
          p.id_medio_pago,
          mp.nombre AS medio_pago
        FROM pagos p
        INNER JOIN meses m        ON m.id_mes = p.id_mes
        INNER JOIN medios_pago mp ON mp.id_medio_pago = p.id_medio_pago
        WHERE p.id_sistema = :id_sistema
        ORDER BY p.fecha_pago DESC, p.id_pago DESC
        LIMIT 1
      ";

      $stLast = $pdo->prepare($sqlLast);
      $stLast->execute([':id_sistema' => $id_sistema]);
      $rowLast = $stLast->fetch(PDO::FETCH_ASSOC);

      if ($rowLast) {
        $pago = [
          'id_pago'       => (int)($rowLast['id_pago'] ?? 0),
          'id_sistema'    => (int)($rowLast['id_sistema'] ?? 0),
          'id_mes'        => (int)($rowLast['id_mes'] ?? 0),
          'mes'           => $rowLast['mes_nombre'] ?? null,
          'anio'          => isset($rowLast['anio']) ? (int)$rowLast['anio'] : null,
          'monto'         => isset($rowLast['monto']) ? (float)$rowLast['monto'] : null,
          'fecha_pago'    => $rowLast['fecha_pago'] ?? null,
          'id_medio_pago' => (int)($rowLast['id_medio_pago'] ?? 0),
          'medio_pago'    => $rowLast['medio_pago'] ?? null,
        ];
      }
    }
  } catch (Throwable $e) {
    // no cortamos todo por error de pago: devolvemos trabajadores igual
    $pago = null;
  }

  json_ok([
    'exito' => true,
    'id_sistema' => $id_sistema,
    'trabajadores' => $trabajadores,
    'pago' => $pago,
  ]);
}
