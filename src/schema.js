import { poolPromise } from './db.js';

export async function initializeSchema() {
  const pool = await poolPromise;
  await pool.request().batch(`
    IF OBJECT_ID('dbo.Estudiantes', 'U') IS NULL
    CREATE TABLE dbo.Estudiantes (
      carnet NVARCHAR(30) NOT NULL PRIMARY KEY,
      nombre NVARCHAR(150) NOT NULL,
      correo NVARCHAR(150) NOT NULL,
      fechaActualizacion DATETIME2 NOT NULL CONSTRAINT DF_Estudiantes_Fecha DEFAULT SYSUTCDATETIME()
    );

    IF OBJECT_ID('dbo.Misiones', 'U') IS NULL
    CREATE TABLE dbo.Misiones (
      misionId INT NOT NULL PRIMARY KEY,
      nombre NVARCHAR(150) NOT NULL,
      descripcion NVARCHAR(500) NULL
    );

    IF OBJECT_ID('dbo.EstudianteMisiones', 'U') IS NULL
    CREATE TABLE dbo.EstudianteMisiones (
      carnet NVARCHAR(30) NOT NULL,
      misionId INT NOT NULL,
      estado BIT NOT NULL,
      fechaActualizacion DATETIME2 NOT NULL CONSTRAINT DF_EstudianteMisiones_Fecha DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_EstudianteMisiones PRIMARY KEY (carnet, misionId),
      CONSTRAINT FK_EstudianteMisiones_Estudiante FOREIGN KEY (carnet) REFERENCES dbo.Estudiantes(carnet),
      CONSTRAINT FK_EstudianteMisiones_Mision FOREIGN KEY (misionId) REFERENCES dbo.Misiones(misionId)
    );

    IF NOT EXISTS (SELECT 1 FROM dbo.Misiones)
    BEGIN
      INSERT INTO dbo.Misiones (misionId, nombre, descripcion) VALUES
      (1, N'Crear API', N'Crear y publicar la API'),
      (2, N'Conectar base de datos', N'Persistir los datos en SQL Server'),
      (3, N'Implementar maestro-detalle', N'Registrar maestro y detalle en un POST'),
      (4, N'Crear frontend', N'Mostrar el tablero de avance'),
      (5, N'Desplegar proyecto', N'Publicar API y frontend');
    END
  `);
}
