require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { sql, getPool } = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Longitudes según el modelo relacional (ERD) de db_WebDevUMG
const MAX_CARNET = 25;
const MAX_NOMBRE = 150;
const MAX_CORREO = 150;

// ---------------------------------------------------------------
// Validación de forma del JSON maestro-detalle
// Devuelve un arreglo de errores (vacío si todo está bien)
// ---------------------------------------------------------------
function validarRegistro(body) {
  const errores = [];
  const { maestro, detalle } = body || {};

  if (!maestro || typeof maestro !== 'object' || Array.isArray(maestro)) {
    errores.push('Falta el objeto "maestro".');
  } else {
    for (const campo of ['carnet', 'nombre', 'correo']) {
      if (typeof maestro[campo] !== 'string' || !maestro[campo].trim()) {
        errores.push(`maestro.${campo} es obligatorio y debe ser texto.`);
      }
    }
    if (typeof maestro.carnet === 'string' && maestro.carnet.trim().length > MAX_CARNET) {
      errores.push(`maestro.carnet no puede tener más de ${MAX_CARNET} caracteres.`);
    }
    if (typeof maestro.nombre === 'string' && maestro.nombre.trim().length > MAX_NOMBRE) {
      errores.push(`maestro.nombre no puede tener más de ${MAX_NOMBRE} caracteres.`);
    }
    if (typeof maestro.correo === 'string') {
      const correo = maestro.correo.trim();
      if (correo.length > MAX_CORREO) {
        errores.push(`maestro.correo no puede tener más de ${MAX_CORREO} caracteres.`);
      } else if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        errores.push('maestro.correo no tiene un formato válido.');
      }
    }
  }

  if (!Array.isArray(detalle)) {
    errores.push('El campo "detalle" debe ser un arreglo.');
  } else {
    const vistos = new Set();
    detalle.forEach((item, i) => {
      if (!item || typeof item !== 'object') {
        errores.push(`detalle[${i}] debe ser un objeto { misionId, estado }.`);
        return;
      }
      if (!Number.isInteger(item.misionId)) {
        errores.push(`detalle[${i}].misionId debe ser un número entero.`);
      } else if (vistos.has(item.misionId)) {
        errores.push(`detalle[${i}].misionId ${item.misionId} está repetido en el detalle.`);
      } else {
        vistos.add(item.misionId);
      }
      if (typeof item.estado !== 'boolean') {
        errores.push(`detalle[${i}].estado debe ser true o false.`);
      }
    });
  }

  return errores;
}

// ---------------------------------------------------------------
// GET /api/health -> comprueba API + conexión a la BD
// ---------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    res.json({ ok: true, baseDeDatos: 'conectada' });
  } catch (err) {
    res.status(503).json({ ok: false, baseDeDatos: 'sin conexión', detalle: err.message });
  }
});

// ---------------------------------------------------------------
// POST /api/registro
// Recibe { maestro: {carnet, nombre, correo}, detalle: [{misionId, estado}] }
// ---------------------------------------------------------------
app.post('/api/registro', async (req, res) => {
  const errores = validarRegistro(req.body);
  if (errores.length) {
    return res.status(400).json({ error: 'JSON inválido.', detalles: errores });
  }

  const carnet = req.body.maestro.carnet.trim();
  const nombre = req.body.maestro.nombre.trim();
  const correo = req.body.maestro.correo.trim();
  const detalle = req.body.detalle;

  try {
    const pool = await getPool();

    // ---- 1) Validar que todos los misionId existan en el catálogo ----
    const catalogo = await pool.request().query('SELECT MisionID FROM Misiones');
    const idsValidos = new Set(catalogo.recordset.map((r) => r.MisionID));
    const invalidos = detalle.filter((d) => !idsValidos.has(d.misionId)).map((d) => d.misionId);

    if (invalidos.length) {
      return res.status(400).json({
        codigo: 'ERROR_REFERENCIA',
        error: 'Error de referencia: uno o más misionId no existen en el catálogo de Misiones.',
        misionesInvalidas: invalidos,
        misionesValidas: [...idsValidos].sort((a, b) => a - b)
      });
    }

    // ---- 2) Upsert de maestro y detalle dentro de una transacción ----
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Maestro: UPDATE si existe, si no INSERT. UPDLOCK/HOLDLOCK evita
      // duplicados si llegan dos POST simultáneos con el mismo carnet.
      const rEst = await new sql.Request(transaction)
        .input('carnet', sql.VarChar(MAX_CARNET), carnet)
        .input('nombre', sql.NVarChar(MAX_NOMBRE), nombre)
        .input('correo', sql.NVarChar(MAX_CORREO), correo)
        .query(`
          UPDATE Estudiantes WITH (UPDLOCK, HOLDLOCK)
             SET Nombre = @nombre, Correo = @correo
           WHERE Carnet = @carnet;
          IF @@ROWCOUNT = 0
          BEGIN
            INSERT INTO Estudiantes (Carnet, Nombre, Correo) VALUES (@carnet, @nombre, @correo);
            SELECT 'insertado' AS accion;
          END
          ELSE
            SELECT 'actualizado' AS accion;`);
      const accionEstudiante = rEst.recordset[0].accion;

      // Detalle: por cada misión, UPDATE del estado o INSERT si no existía
      const resultadoDetalle = [];
      for (const item of detalle) {
        const rDet = await new sql.Request(transaction)
          .input('carnet', sql.VarChar(MAX_CARNET), carnet)
          .input('misionId', sql.Int, item.misionId)
          .input('estado', sql.Bit, item.estado)
          .query(`
            UPDATE EstudianteMisiones WITH (UPDLOCK, HOLDLOCK)
               SET Estado = @estado
             WHERE Carnet = @carnet AND MisionID = @misionId;
            IF @@ROWCOUNT = 0
            BEGIN
              INSERT INTO EstudianteMisiones (Carnet, MisionID, Estado) VALUES (@carnet, @misionId, @estado);
              SELECT 'insertado' AS accion;
            END
            ELSE
              SELECT 'actualizado' AS accion;`);
        resultadoDetalle.push({
          misionId: item.misionId,
          estado: item.estado,
          accion: rDet.recordset[0].accion
        });
      }

      await transaction.commit();

      return res.status(200).json({
        mensaje: 'Registro procesado correctamente.',
        estudiante: { carnet, nombre, correo, accion: accionEstudiante },
        detalle: resultadoDetalle
      });
    } catch (errTx) {
      try { await transaction.rollback(); } catch { /* la transacción ya fue abortada */ }
      throw errTx;
    }
  } catch (err) {
    // 2627 / 2601 = violación de UNIQUE (Correo es único en Estudiantes)
    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).json({
        codigo: 'CORREO_DUPLICADO',
        error: 'El correo ya está registrado con otro carnet.'
      });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor.', detalle: err.message });
  }
});

// ---------------------------------------------------------------
// GET /api/misiones  -> catálogo de misiones
// ---------------------------------------------------------------
app.get('/api/misiones', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(
      'SELECT MisionID AS misionId, Nombre AS nombre, Descripcion AS descripcion FROM Misiones ORDER BY MisionID'
    );
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.', detalle: err.message });
  }
});

// ---------------------------------------------------------------
// Arma la lista de estudiantes con el estado de TODAS las misiones del
// catálogo (las que el estudiante no ha enviado cuentan como pendientes)
// ---------------------------------------------------------------
async function obtenerEstudiantes(carnet) {
  const pool = await getPool();

  const reqEst = pool.request();
  let filtro = '';
  if (carnet) {
    reqEst.input('carnet', sql.VarChar(MAX_CARNET), carnet);
    filtro = 'WHERE Carnet = @carnet';
  }
  const estudiantes = (await reqEst.query(
    `SELECT Carnet, Nombre, Correo FROM Estudiantes ${filtro} ORDER BY Nombre`
  )).recordset;

  const misiones = (await pool.request().query(
    'SELECT MisionID, Nombre FROM Misiones ORDER BY MisionID'
  )).recordset;

  const reqDet = pool.request();
  if (carnet) reqDet.input('carnet', sql.VarChar(MAX_CARNET), carnet);
  const detalle = (await reqDet.query(
    `SELECT Carnet, MisionID, Estado, FechaRegistro FROM EstudianteMisiones ${filtro}`
  )).recordset;

  const porCarnet = new Map();
  for (const d of detalle) {
    if (!porCarnet.has(d.Carnet)) porCarnet.set(d.Carnet, new Map());
    porCarnet.get(d.Carnet).set(d.MisionID, d);
  }

  return estudiantes.map((est) => {
    const registros = porCarnet.get(est.Carnet) || new Map();
    const lista = misiones.map((m) => {
      const r = registros.get(m.MisionID);
      return {
        misionId: m.MisionID,
        nombre: m.Nombre,
        estado: r ? !!r.Estado : false,
        registrada: !!r,
        fechaRegistro: r ? r.FechaRegistro : null
      };
    });
    const completadas = lista.filter((m) => m.estado).length;
    return {
      carnet: est.Carnet,
      nombre: est.Nombre,
      correo: est.Correo,
      progreso: {
        completadas,
        pendientes: lista.length - completadas,
        total: lista.length,
        porcentaje: lista.length ? Math.round((completadas / lista.length) * 100) : 0
      },
      misiones: lista
    };
  });
}

// ---------------------------------------------------------------
// GET /api/estudiantes -> estudiantes con su avance de misiones
// ---------------------------------------------------------------
app.get('/api/estudiantes', async (req, res) => {
  try {
    res.json(await obtenerEstudiantes());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.', detalle: err.message });
  }
});

// ---------------------------------------------------------------
// GET /api/estudiantes/:carnet -> avance de un estudiante
// ---------------------------------------------------------------
app.get('/api/estudiantes/:carnet', async (req, res) => {
  try {
    const [est] = await obtenerEstudiantes(req.params.carnet.trim());
    if (!est) return res.status(404).json({ error: 'Estudiante no encontrado.' });
    res.json(est);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.', detalle: err.message });
  }
});

// JSON mal formado en el body
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo no es un JSON válido.' });
  }
  next(err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API corriendo en http://localhost:${PORT}`);
});
