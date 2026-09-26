-- =========================================================
-- Modelo relacional (ERD) del reto — referencia.
-- Estas tablas YA EXISTEN en db_WebDevUMG (las creó el catedrático).
-- NO es necesario ejecutar este script contra el servidor compartido;
-- sirve solo para documentar la estructura o recrearla en una BD local.
-- =========================================================

IF OBJECT_ID('dbo.Estudiantes', 'U') IS NULL
CREATE TABLE dbo.Estudiantes (
    Carnet  VARCHAR(25)   NOT NULL PRIMARY KEY,
    Nombre  NVARCHAR(150) NOT NULL,
    Correo  NVARCHAR(150) NOT NULL UNIQUE
);
GO

IF OBJECT_ID('dbo.Misiones', 'U') IS NULL
CREATE TABLE dbo.Misiones (
    MisionID    INT IDENTITY(1,1) PRIMARY KEY,
    Nombre      NVARCHAR(100) NOT NULL,
    Descripcion NVARCHAR(250) NULL
);
GO

IF OBJECT_ID('dbo.EstudianteMisiones', 'U') IS NULL
CREATE TABLE dbo.EstudianteMisiones (
    DetalleID     INT IDENTITY(1,1) PRIMARY KEY,
    Carnet        VARCHAR(25) NOT NULL,
    MisionID      INT NOT NULL,
    Estado        BIT NOT NULL,
    FechaRegistro DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_Estudiante FOREIGN KEY (Carnet)   REFERENCES dbo.Estudiantes(Carnet),
    CONSTRAINT FK_Mision     FOREIGN KEY (MisionID) REFERENCES dbo.Misiones(MisionID),
    CONSTRAINT UQ_EstudianteMision UNIQUE (Carnet, MisionID)
);
GO

-- Catálogo (así está cargado en el servidor del laboratorio)
IF NOT EXISTS (SELECT 1 FROM dbo.Misiones)
INSERT INTO dbo.Misiones (Nombre, Descripcion) VALUES
    (N'Crear API',             N'El estudiante construyó su API'),
    (N'Crear Frontend',        N'El estudiante diseñó su interfaz'),
    (N'Subir código a GitHub', N'El estudiante publicó su repositorio'),
    (N'Publicar en hosting',   N'El estudiante desplegó su proyecto'),
    (N'Pruebas de ingreso',    N'El estudiante probó su API y frontend');
GO
