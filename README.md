# NEXUS · Control Gerencial

Primera versión funcional de una plataforma web para consolidar los libros de Excel y las vistas de referencia compartidas.

## Qué incluye

- Dashboard gerencial con KPIs, comparaciones y desglose por gerencia.
- Módulo Multimedia con meta, avance, proyección, efectividad y detalle por supervisor.
- Estructura de equipos: conteos por supervisor, contrato y departamento de los rosters de Multimedia y Suroriente; las fuentes se mantienen separadas para evitar duplicados.
- Módulo Conecta/Pospago que detecta la pestaña del mes en español, lee los subtotales por supervisor, referidos y fórmulas de proyección.
- Módulo Solicitudes que resume registros atendidos/registrados por tipo de servicio, vendedor, supervisor y zona.
- Módulo Combustible con gasto por placa, asignación, sobregiro y plan semanal de recorrido.
- Inicio de sesión, roles de administrador/consulta, alta y edición de usuarios, cambio de contraseña, registro de actividad.
- Importación de uno o varios `.xlsx`; el tipo de plantilla se reconoce por sus hojas/cabeceras.
- Edición administrativa de indicadores y tablas de supervisores/combustible.

## Tecnologías

- **HTML, CSS y JavaScript**: interfaz web adaptable a escritorio y móvil.
- **Python + Flask**: API, autenticación, importación y persistencia local.
- **SQLite**: usuarios, roles, indicadores, historial y bitácora.
- **C++**: motor opcional para el cálculo ponderado del parte diario. Si no está disponible un compilador `g++`/`clang++`, el sistema utiliza la misma fórmula en Python.
- **C# (.NET 8)**: verificador opcional independiente para comprobar la misma fórmula del parte diario. No es requisito para iniciar la web.

El lector `.xlsx` usa la estructura XML del propio archivo con la biblioteca estándar de Python. No necesita instalar una librería de Excel. La primera versión está orientada a `.xlsx` (no `.xls` ni libros protegidos con contraseña).

## Cómo iniciar en Windows

1. Descomprimí la carpeta `nexus_gerencial`.
2. Instalá Python 3.10 o superior.
3. Hacé doble clic en `run.bat`.
4. Abrí `http://127.0.0.1:5000`.

Credenciales iniciales solicitadas:

- Usuario: `ervinroch`
- Contraseña: `2008`

La primera vez se crea el usuario administrador con contraseña cifrada (hash) dentro de SQLite. Al ingresar, abrí **Administración → Cambiar mi contraseña** y sustituí la contraseña inicial por una de al menos 8 caracteres.

También podés ejecutarlo manualmente:

```bash
python -m venv .venv
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Variables opcionales antes del primer arranque:

```text
ADMIN_USER=ervinroch
ADMIN_PASSWORD=una-clave-larga
SECRET_KEY=una-clave-aleatoria-larga
COOKIE_SECURE=0
```

Si ya existe `instance/nexus.sqlite3`, cambiar `ADMIN_PASSWORD` en el entorno no reemplaza la contraseña guardada: usá la pantalla de cambio de contraseña. Para empezar con una base vacía, detené el servidor y respaldá/eliminá `instance/nexus.sqlite3` (esto borra usuarios, ediciones e historial local).

## Importar los Excel de cada mes

1. Iniciá sesión como administrador.
2. Entrá a **Administración → Actualizar con Excel**.
3. Seleccioná los libros nuevos `.xlsx` (se pueden seleccionar varios a la vez).
4. El resultado queda clasificado en el módulo correspondiente. Las importaciones futuras reemplazan la versión vigente del mismo tipo de plantilla y conservan el historial de cargas.

Plantillas reconocidas en los ejemplos:

| Archivo de ejemplo | Módulo / información reconocida |
|---|---|
| `NUMEROS SURORIENTE.xlsx` | Roster/conteo por supervisor de Suroriente; se excluyen vacantes y filas de encabezado |
| `MULTIMEDIA ROSTER.xlsx` | Personal por supervisor y tipo de contrato; disponible en Estructura de equipos |
| `Ventas Noviembre.xlsx` | Solicitudes registradas y atendidas, servicios, vendedor, supervisor y zona |
| `JUAN DIEGO CONECTA (1).xlsx` | Meses, productos, subtotales por supervisor y proyección/general Oeste |
| `MULTIMEDIA (1).xlsx` | Roster, metas, parte diario, fórmulas y plan semanal de combustible |

## Fórmulas trasladadas

**Parte diario Multimedia** (hoja `MES`):

```text
TOTAL = CCT + CCD + INDV + IFI + DTH
PRODUCTOS DEL DÍA = (CCT × 3) + (CCD × 2) + INDV + IFI + DTH
DÉFICIT = PRODUCTOS DEL DÍA − RETO DIARIO
% CUMPLIMIENTO = PRODUCTOS DEL DÍA / RETO DIARIO
EFECTIVIDAD = FDV VENDIERON / ROSTER TOTAL
```

La importación detecta pestañas con meses en español (enero–diciembre). Para Conecta selecciona el mes actual si existe; si no, utiliza el mes más avanzado disponible. Los totales suman las columnas de producto y los subtotales agrupan promotores bajo cada supervisor. Las divisiones entre cero se presentan como no disponibles, no como un error del tablero.

**Combustible**:

```text
DIFERENCIA = ASIGNACIÓN SEMANAL − GASTO DE LA SEMANA
DIFERENCIA NEGATIVA = SOBREGIRO
```

## Cifras de referencia y limitaciones conocidas

- Los indicadores `234`, `$18,539`, `1,113`, `1,490 / 1,771`, `2,032` y `$24,601.10`, y la tabla por gerencia/supervisor, son la fotografía visible en las capturas enviadas. Se cargaron como línea base editable, no se presentan como un resultado recalculado automáticamente desde los libros.
- El Excel `MULTIMEDIA (1).xlsx` contiene una meta mensual de **2,000 altas** y **75 plazas** en `meta nov`; esa base se muestra en el módulo de importaciones para no confundirla con los **1,771** que aparecen en la captura del tablero.
- Las filas de gasto por placa proceden de la captura. El libro `MULTIMEDIA (1).xlsx` aporta el plan de recorridos, pero no trae el detalle de gasto por placa mostrado en la captura.
- El filtro de fechas actualiza el período mostrado en pantalla. En esta primera versión, los libros se agregan por plantilla/archivo y no se vuelven a consultar por cada rango de fechas; para tener un filtro temporal contable, el siguiente paso es fijar una columna de fecha de corte y una regla de exclusión de duplicados por plantilla.
- En `Ventas Noviembre.xlsx`, una fila atendida representa un registro de servicio/producto; un cliente puede generar varias filas. El panel lo etiqueta como registros atendidos y no como clientes únicos ni como instalaciones completadas.
- Los datos de cédula, cuenta bancaria, teléfono, dirección de clientes, fecha de nacimiento y campos similares no se llevan a los resúmenes. El archivo cargado se procesa en memoria y se elimina del directorio temporal al terminar. Solo quedan los agregados y el nombre del archivo.

## Seguridad antes de publicar en una red

La configuración por defecto es para uso local. Antes de exponerla a otros equipos:

1. Cambiá la contraseña inicial y definí un `SECRET_KEY` aleatorio.
2. Activá HTTPS y establecé `COOKIE_SECURE=1`.
3. Ejecutá Flask detrás de un servidor WSGI/proxy de producción; no uses el servidor de desarrollo de Flask como servidor público.
4. Limitá el acceso por red/VPN y hacé respaldos de `instance/nexus.sqlite3`.
5. No compartás capturas ni exportaciones que contengan información personal sin los permisos correspondientes.

## Verificador opcional en C#

Con .NET 8 instalado:

```bash
cd csharp_helper
dotnet run
```

Pegá/mandá por stdin un JSON como:

```json
{"cct":5,"ccd":2,"indv":1,"ifi":0,"dth":1,"challenge":20}
```

La respuesta compara el resultado ponderado, el déficit y el cumplimiento con el módulo Python/C++.


## Publicar en Render (configuración preparada)

El proyecto incluye Gunicorn y permite ubicar SQLite en un disco persistente mediante `NEXUS_DB_PATH`. Para publicarlo:

1. Subí el contenido de esta carpeta a un repositorio GitHub privado (sin `instance/nexus.sqlite3`, archivos de clientes ni Excel originales). Render despliega desde Git; no se publica el ZIP directamente como una aplicación.
2. En Render seleccioná **New → Web Service** y conectá el repositorio. Elegí **Python 3**. Si `app.py` está en la raíz del repositorio, dejá **Root Directory** vacío.
3. Configurá **Build Command**: `pip install -r requirements.txt`.
4. Configurá **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120`.
5. En **Environment** agregá `SECRET_KEY` (generá un valor largo y aleatorio), `ADMIN_USER=ervinroch`, `ADMIN_PASSWORD` (una contraseña nueva y fuerte, no uses `2008` en una web pública) y `COOKIE_SECURE=1`.
6. Para conservar usuarios, ediciones, historial e importaciones después de reinicios y despliegues, adjuntá un **Persistent Disk** con mount path `/var/data` y agregá `NEXUS_DB_PATH=/var/data/nexus.sqlite3`. Los discos persistentes requieren un servicio de pago en Render.
7. Desplegá y abrí la URL `*.onrender.com`. Iniciá sesión con `ervinroch` y la contraseña que definiste en `ADMIN_PASSWORD`; cambiá esa contraseña desde Administración cuando corresponda.

**Importante sobre el plan gratuito:** Render usa un sistema de archivos efímero por defecto. Sin disco persistente o una base de datos externa, el archivo SQLite que guarda contraseñas, indicadores editados e historial puede perderse en un reinicio o despliegue. No uses el plan gratuito para almacenar cambios reales de manera permanente con esta versión SQLite. Para alojarlo sin disco de pago habría que adaptar la app para guardar su estado en Render PostgreSQL.

El servidor de producción usa Gunicorn (no `python app.py`). Gunicorn escucha en `0.0.0.0` y en el puerto que Render asigna mediante `PORT`.
