# API Maestro-Detalle: Misiones

API y tablero para registrar estudiantes y el estado de sus misiones en un único `POST`.

## Requisitos

- Node.js 20 o superior.
- Acceso a SQL Server.

## Instalación

1. Copie `.env.example` a `.env` y configure la contraseña de SQL Server.
2. Instale dependencias: `npm install`.
3. Ejecute: `npm start`.
4. Abra `http://localhost:3000`.

Al iniciar, la API crea las tablas `Estudiantes`, `Misiones` y `EstudianteMisiones` si aún no existen, y registra cinco misiones de catálogo iniciales. Puede modificar el catálogo directamente en SQL Server.

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/registro` | Inserta o actualiza el maestro y sus detalles. |
| `GET` | `/api/misiones` | Devuelve el catálogo de misiones. |
| `GET` | `/api/estudiantes` | Devuelve cada estudiante con sus misiones y resumen. |
| `GET` | `/api/health` | Comprueba conexión de la API y base de datos. |

### Ejemplo de registro

```json
{
  "maestro": {
    "carnet": "1890-20-11489",
    "nombre": "MERCEDES AZUCENA LÓPEZ PÉREZ",
    "correo": "mlopezp58@miumg.edu.gt"
  },
  "detalle": [
    { "misionId": 1, "estado": true },
    { "misionId": 2, "estado": false },
    { "misionId": 3, "estado": true }
  ]
}
```

Si se envía un `misionId` inexistente, el servidor devuelve `400` con `codigo: "MISION_NO_EXISTE"` y no guarda ningún cambio.
