# PostgreSQL local para el equipo

## Arranque reproducible con Docker

Requisitos: Node 22 (mínimo 22.13), npm y Docker Desktop abierto con motor de
contenedores Linux y Compose v2. No hace falta instalar PostgreSQL ni pgAdmin.
Desde la raíz del backend, en la rama de trabajo `dev`:

```powershell
npm.cmd ci
npm.cmd run db:up
npm.cmd run db:check:docker
```

`db:up` genera `.env.docker` con contraseña aleatoria si no existe, descarga la
imagen oficial `postgres:17-bookworm`, inicia el contenedor y espera su healthcheck.
La versión mayor 17 queda fija; las actualizaciones menores se revisan con el equipo.
Solo crea bases vacías, sin tablas de negocio, seed ni migraciones:

| Base             | Uso                                                           |
| ---------------- | ------------------------------------------------------------- |
| cafeteria        | Desarrollo                                                    |
| cafeteria_shadow | Exclusiva de Prisma para calcular migraciones; puede vaciarse |
| cafeteria_test   | Pruebas aisladas; aún sin pruebas de negocio conectadas       |

Se publica exclusivamente en `127.0.0.1:55432` para no competir con una instalación
en 5432. Los datos se conservan en el volumen Docker `cafeteria-local_postgres_data`,
fuera de OneDrive. Reiniciar o detener no borra datos. Cada ordenador tiene sus
propias bases y contraseña; Git comparte configuración/migraciones, no datos.

```powershell
# Estado e inicio del backend con las URLs Docker:
npm.cmd run db:status
npm.cmd run dev:docker
# Al terminar (conserva datos):
npm.cmd run db:stop
# Para continuar:
npm.cmd run db:up
```

`dev:docker` utiliza las URLs de `.env.docker` sin sobrescribir `.env`. Para la
configuración restante, el backend conserva sus valores por defecto o carga el
`.env` local existente. No usar configuraciones de producción en este entorno.
`db:check:docker` consulta metadatos de las tres bases, sin crear/borrar tablas.
El script rechaza destinos iguales y considera equivalentes los alias loopback
habituales; no sustituye la revisión de alias DNS o proxies configurados a mano.

## Configuración y pgAdmin opcional

Para preparar credenciales sin iniciar Docker, ejecutar `npm run db:env`.
`.env.docker` está ignorado por Git; nunca publicarlo ni compartir su contenido.
Los scripts no muestran sus credenciales. Consultarlas localmente para pgAdmin:
host `127.0.0.1`, puerto `55432`, usuario `cafeteria_local`, mantenimiento `cafeteria`,
contraseña del archivo. El usuario de esta instancia es superusuario solo para
desarrollo; no reutilizarlo ni publicar este Compose en producción.

Si el puerto está ocupado, cambiar `POSTGRES_PORT` y el puerto de las tres URLs
en `.env.docker`, detener y volver a levantar. No cambiar credenciales después de
inicializar el volumen sin actualizar también el rol PostgreSQL: las variables de
la imagen no cambian una contraseña ya creada. Conservar `.env.docker` mientras se
conserve el volumen; si se pierde, no regenerarlo esperando recuperar el acceso.
El archivo tiene prioridad sobre variables PostgreSQL del terminal al gestionar
el contenedor o ejecutar `db:check:docker`.

## Inicialización y migraciones

La imagen ejecuta `docker/postgres/01-create-databases.sql` solo con un volumen
vacío. Editar ese SQL no actualiza bases existentes. Las tablas futuras se
incorporarán mediante migraciones versionadas después de revisar modelo físico
y SQL con Leonel; el arranque nunca las aplica automáticamente.

Prisma necesita las URLs Docker al ejecutar sus comandos. Ejemplo de validación,
sin modificar las bases:

```powershell
node --env-file=.env.docker node_modules/prisma/build/index.js validate
```

Las pruebas actuales son health/configuración; crear `cafeteria_test` no las convierte
en integración. Antes de añadir limpieza de pruebas, usar `TEST_DATABASE_URL` y
validar explícitamente el destino. Nunca limpiar desarrollo o shadow para tests.
No usar `docker compose down -v` como solución a fallos: elimina el volumen y datos.

## Solución de problemas

- Abrir Docker Desktop y esperar a que el motor Linux esté listo.
- Verificar `docker compose version`; instalar/actualizar Docker si no existe.
- Si falla la descarga, revisar conexión al registro; no se usa otra versión automáticamente.
- Si falla el healthcheck, revisar localmente
  `docker compose --env-file .env.docker logs postgres`, sin publicar secretos.
- No resetear ni borrar volúmenes ante errores de conexión; revisar puerto y
  coincidencia entre credenciales guardadas y volumen existente.

## Alternativa: PostgreSQL ya instalado

Crear `cafeteria`, `cafeteria_shadow` y una `cafeteria_test` distinta con pgAdmin.
Solo si `.env` no existe, copiar `.env.example` a `.env` y ajustar las URLs locales
(codificar caracteres especiales). `npm run db:check` comprueba desarrollo/shadow y
también pruebas si `TEST_DATABASE_URL` está definido. `npm run dev` mantiene ese
entorno manual; no se modifica por el arranque Docker. No usar superusuario en producción.

El 14/10/2026 se comprobó la instalación manual: desarrollo y shadow conectaron,
con 0 tablas en public. Esto no es evidencia de arranque del contenedor Docker.
En esta entrega Docker Desktop estaba instalado, pero su motor apagado: validar
Compose no equivale a probar el primer arranque. Registrar esa prueba al ejecutarla.

Referencias: [imagen oficial PostgreSQL](https://hub.docker.com/_/postgres),
[Docker Compose](https://docs.docker.com/compose/gettingstarted/).
