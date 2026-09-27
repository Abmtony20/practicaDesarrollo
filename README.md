# API Maestro-Detalle con Catálogo y Control de Estado

**Autor:** Amtony Jeovani Castañeda Rios — Carnet 1890-17-15352

API en **Node.js + Express + SQL Server** que recibe en un solo `POST` un JSON
maestro-detalle (estudiante + misiones), valida las misiones contra el catálogo
e inserta/actualiza los datos dentro de una transacción. Incluye un frontend
(tablero de avance + formulario de registro).

## 1. Estructura

```
├── server.js                  # Endpoints Express
├── db.js                      # Pool de conexión a SQL Server
├── schema.sql                 # Modelo relacional (referencia, las tablas ya existen)
├── .env.example               # Plantilla de variables de entorno
└── public/
    ├── index.html             # Tablero + formulario POST + catálogo
    └── config.js              # URL del backend para el frontend
```

## 2. Modelo de datos (ya existe en `db_WebDevUMG`)

| Tabla | Columnas |
| --- | --- |
| `Estudiantes` | `Carnet` VARCHAR(25) **PK**, `Nombre` NVARCHAR(150), `Correo` NVARCHAR(150) **UNIQUE** |
| `Misiones` | `MisionID` INT IDENTITY **PK**, `Nombre` NVARCHAR(100), `Descripcion` NVARCHAR(250) |
| `EstudianteMisiones` | `DetalleID` INT IDENTITY **PK**, `Carnet` **FK**, `MisionID` **FK**, `Estado` BIT, `FechaRegistro` DATETIME DEFAULT GETDATE(), **UNIQUE (Carnet, MisionID)** |

## 3. Correr localmente

```bash
cp .env.example .env      # y escribe la contraseña real en DB_PASSWORD
npm install
npm start
```

API y frontend quedan en `http://localhost:3000`.

## 4. Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/registro` | Inserta/actualiza maestro y detalle. |
| `GET` | `/api/misiones` | Catálogo de misiones. |
| `GET` | `/api/estudiantes` | Estudiantes con el estado de cada misión y su progreso. |
| `GET` | `/api/estudiantes/:carnet` | Avance de un solo estudiante. |
| `GET` | `/api/health` | Verifica API + conexión a la BD. |

### POST /api/registro

```json
{
  "maestro": { "carnet": "0000-00-00000", "nombre": "TU NOMBRE", "correo": "usuario@miumg.edu.gt" },
  "detalle": [
    { "misionId": 1, "estado": true },
    { "misionId": 2, "estado": false }
  ]
}
```

> ⚠️ Usa **tu propio carnet**. La base de datos es compartida: si envías el carnet
> de otra persona, sobrescribes su nombre y correo.

Reglas:
1. Si el `carnet` no existe → inserta al estudiante; si existe → actualiza `nombre` y `correo`.
2. Cada `misionId` debe existir en `Misiones`; si alguno no existe responde
   **400 `ERROR_REFERENCIA`** y **no guarda nada**.
3. Si la misión no estaba registrada para el estudiante → la inserta; si ya estaba → actualiza `estado`.
4. Todo ocurre en una transacción, así que se pueden enviar múltiples POST sin duplicar filas.

Respuestas:

| Código | Caso |
| --- | --- |
| `200` | Procesado. Indica si el estudiante y cada misión fueron `insertado` o `actualizado`. |
| `400` | JSON mal formado, campos faltantes, `estado` no booleano, `misionId` repetido o inexistente. |
| `409` | `CORREO_DUPLICADO`: el correo ya pertenece a otro carnet. |
| `500` | Error interno / base de datos. |

## 5. Frontend

- **Tablero**: tarjetas por estudiante con barra de progreso, misiones completadas
  (verde) vs pendientes (rojo), buscador y resumen general.
- **Registrar avance**: formulario que arma el JSON maestro-detalle y lo envía al `POST`.
- **Catálogo**: resultado de `GET /api/misiones`.

## 6. Despliegue

| Parte | URL |
| --- | --- |
| Frontend (GitHub Pages) | <https://abmtony20.github.io/practicaDesarrollo/> |
| API (Azure App Service) | <https://reto-maestro-detalle-amtony-c0erbjeyhwfgcsa7.mexicocentral-01.azurewebsites.net> |

### Backend → Azure App Service
Web App `reto-maestro-detalle-amtony` (Linux, Node 22 LTS, Mexico Central),
grupo de recursos `rg-reto-maestro-detalle`.

Variables de entorno configuradas en Azure: `DB_USER`, `DB_PASSWORD`, `DB_SERVER`,
`DB_DATABASE`, `DB_PORT` y `SCM_DO_BUILD_DURING_DEPLOYMENT=true` (Azure ejecuta
`npm install` al desplegar). Comando de inicio: `npm start`.

Para volver a desplegar después de un cambio (requiere Azure CLI y `az login`):

```bash
git archive --format=zip -o deploy.zip HEAD
az webapp deploy -g rg-reto-maestro-detalle -n reto-maestro-detalle-amtony --src-path deploy.zip --type zip
```

### Frontend → GitHub Pages
`public/config.js` apunta a la API de Azure. El contenido de `public/` se publica
en la rama `gh-pages`:

```bash
git subtree split --prefix public -b gh-pages
git push origin gh-pages
```

## 7. Seguridad
- El `.env` real nunca se sube a GitHub (está en `.gitignore`).
- Las consultas usan parámetros (`@carnet`, `@misionId`…) para evitar inyección SQL.
