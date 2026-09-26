import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { poolPromise, sql } from './db.js';
import { initializeSchema } from './schema.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '../public')));

function validarRegistro(body) {
  const { maestro, detalle } = body ?? {};
  if (!maestro || typeof maestro !== 'object' || !Array.isArray(detalle)) {
    return 'El cuerpo debe incluir maestro y detalle (arreglo).';
  }
  for (const field of ['carnet', 'nombre', 'correo']) {
    if (typeof maestro[field] !== 'string' || !maestro[field].trim()) return `maestro.${field} es obligatorio.`;
  }
  if (maestro.carnet.trim().length > 30 || maestro.nombre.trim().length > 150 || maestro.correo.trim().length > 150) {
    return 'Un campo del maestro supera la longitud permitida.';
  }
  if (!/^\S+@\S+\.\S+$/.test(maestro.correo.trim())) return 'maestro.correo no tiene un formato válido.';
  const ids = new Set();
  for (const item of detalle) {
    if (!item || !Number.isInteger(item.misionId) || typeof item.estado !== 'boolean') {
      return 'Cada detalle requiere misionId entero y estado booleano.';
    }
    if (ids.has(item.misionId)) return `La misión ${item.misionId} está repetida en el detalle.`;
    ids.add(item.misionId);
  }
  return null;
}

app.get('/api/health', async (_req, res, next) => {
  try {
    await (await poolPromise).request().query('SELECT 1 AS conectado');
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/misiones', async (_req, res, next) => {
  try {
    const result = await (await poolPromise).request().query('SELECT misionId, nombre, descripcion FROM dbo.Misiones ORDER BY misionId');
    res.json(result.recordset);
  } catch (error) { next(error); }
});

app.get('/api/estudiantes', async (_req, res, next) => {
  try {
    const result = await (await poolPromise).request().query(`
      SELECT e.carnet, e.nombre, e.correo, m.misionId, m.nombre AS misionNombre, em.estado
      FROM dbo.Estudiantes e
      LEFT JOIN dbo.EstudianteMisiones em ON em.carnet = e.carnet
      LEFT JOIN dbo.Misiones m ON m.misionId = em.misionId
      ORDER BY e.carnet, m.misionId`);
    const students = new Map();
    for (const row of result.recordset) {
      if (!students.has(row.carnet)) students.set(row.carnet, { carnet: row.carnet, nombre: row.nombre, correo: row.correo, misiones: [] });
      if (row.misionId !== null) students.get(row.carnet).misiones.push({ misionId: row.misionId, nombre: row.misionNombre, estado: row.estado });
    }
    const catalogo = await (await poolPromise).request().query('SELECT COUNT(*) AS total FROM dbo.Misiones');
    const totalMisiones = catalogo.recordset[0].total;
    res.json([...students.values()].map((student) => ({
      ...student,
      completadas: student.misiones.filter((m) => m.estado).length,
      pendientes: totalMisiones - student.misiones.filter((m) => m.estado).length,
      totalMisiones
    })));
  } catch (error) { next(error); }
});

app.post('/api/registro', async (req, res, next) => {
  const validationError = validarRegistro(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  const maestro = Object.fromEntries(Object.entries(req.body.maestro).map(([key, value]) => [key, value.trim()]));
  const detalle = req.body.detalle;
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    for (const item of detalle) {
      const found = await new sql.Request(transaction).input('misionId', sql.Int, item.misionId)
        .query('SELECT 1 AS existe FROM dbo.Misiones WHERE misionId = @misionId');
      if (!found.recordset.length) {
        await transaction.rollback();
        return res.status(400).json({ codigo: 'MISION_NO_EXISTE', error: `La misión con ID ${item.misionId} no existe en el catálogo.` });
      }
    }
    await new sql.Request(transaction)
      .input('carnet', sql.NVarChar(30), maestro.carnet)
      .input('nombre', sql.NVarChar(150), maestro.nombre)
      .input('correo', sql.NVarChar(150), maestro.correo)
      .query(`MERGE dbo.Estudiantes AS destino USING (SELECT @carnet AS carnet, @nombre AS nombre, @correo AS correo) AS origen
        ON destino.carnet = origen.carnet
        WHEN MATCHED THEN UPDATE SET nombre = origen.nombre, correo = origen.correo, fechaActualizacion = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (carnet, nombre, correo) VALUES (origen.carnet, origen.nombre, origen.correo);`);
    for (const item of detalle) {
      await new sql.Request(transaction).input('carnet', sql.NVarChar(30), maestro.carnet).input('misionId', sql.Int, item.misionId).input('estado', sql.Bit, item.estado)
        .query(`MERGE dbo.EstudianteMisiones AS destino USING (SELECT @carnet AS carnet, @misionId AS misionId, @estado AS estado) AS origen
          ON destino.carnet = origen.carnet AND destino.misionId = origen.misionId
          WHEN MATCHED THEN UPDATE SET estado = origen.estado, fechaActualizacion = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT (carnet, misionId, estado) VALUES (origen.carnet, origen.misionId, origen.estado);`);
    }
    await transaction.commit();
    res.status(200).json({ mensaje: 'Registro procesado correctamente.', carnet: maestro.carnet, misionesProcesadas: detalle.length });
  } catch (error) {
    if (transaction._aborted !== true) { try { await transaction.rollback(); } catch { /* ya finalizó */ } }
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

initializeSchema().then(() => app.listen(port, () => console.log(`Servidor disponible en http://localhost:${port}`)))
  .catch((error) => { console.error('No fue posible inicializar la base de datos:', error.message); process.exit(1); });
