import sql from 'mssql';
import 'dotenv/config';

const required = ['DB_SERVER', 'DB_DATABASE', 'DB_USER', 'DB_PASSWORD'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  throw new Error(`Faltan variables de entorno: ${missing.join(', ')}. Revise el archivo .env.`);
}

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: process.env.DB_ENCRYPT !== 'false',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

export const poolPromise = new sql.ConnectionPool(config).connect();
export { sql };
