require('dotenv').config();
const sql = require('mssql');

const requeridas = ['DB_USER', 'DB_PASSWORD', 'DB_SERVER', 'DB_DATABASE'];
const faltantes = requeridas.filter((k) => !process.env[k]);
if (faltantes.length) {
  console.error(`❌ Faltan variables de entorno: ${faltantes.join(', ')}. Revisa tu archivo .env`);
}

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: parseInt(process.env.DB_PORT || '1433', 10),
  options: {
    encrypt: true,                 // requerido por Azure
    trustServerCertificate: true   // el servidor del laboratorio usa certificado propio
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let poolPromise;

/**
 * Devuelve una promesa con el pool de conexiones ya conectado.
 * Se reutiliza entre requests en vez de abrir una conexión nueva cada vez.
 */
function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .then((pool) => {
        console.log('✅ Conectado a SQL Server:', process.env.DB_SERVER);
        return pool;
      })
      .catch((err) => {
        console.error('❌ Error de conexión a la base de datos:', err.message);
        poolPromise = null; // permite reintentar en el próximo request
        throw err;
      });
  }
  return poolPromise;
}

module.exports = { sql, getPool };
