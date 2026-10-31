# Contexto y continuidad del proyecto — Backend Cafetería

## Entrega local AUTH-02 — 2026-10-31

Registro de cliente solo con QR original de ticket pagado, OpenAPI 0.6.0. Alta,
asociación exclusiva de compra y consumo permanente en una transacción PostgreSQL;
Argon2id y teléfono MX único, sin cookies/JWT/login automático. Sin nueva migración.
Pruebas reales de PostgreSQL aislado, concurrencia y rollback; evidencia completa
en [AUTH-02](tasks/AUTH-02-ticket-qr-registration.md). Sin commit/push/despliegue.
Recuperación/reset, perfil/historial, QR de cobro, acceso digital público al ticket,
Stripe, correo y worker siguen pendientes. Revisión humana y coordinación frontend
antes de integrar. Las entregas inferiores son historial.

## Entrega local CASH-01/CASH-02 — 2026-10-27

Caja única, apertura/resumen/cierre propio/excepcional, cobro CASH atómico con
payment/sale separados y ticket JSON protegido con registro de invitado preparado.
OpenAPI 0.5.0; nueva migración aditiva de cifrado temporal de registro de ticket,
probada solo en PostgreSQL aislado, no aplicada a las bases del proyecto.
LISTO CASH verifica pago exitoso/venta además de paidAt. Auth/catalog se conservan;
Cloudinary simulado. Registro final, QR de cobro, acceso digital público al ticket,
Stripe, correo y worker siguen pendientes. Clave externa y scheduling de limpieza
requieren configuración operativa antes de uso real. No hubo commit/push/despliegue.
Ver [implementación](cash-implementation.md) y [evidencia](tasks/CASH-01-02-cash-payments.md).
Los estados inferiores son historial; esta entrega local aún necesita revisión/integración.

## Estado vigente — `dev`, 2026-10-26

ADR 0001–0012 aceptados. Primera entrega de orders implementada y verificada en
`dev`: creación móvil/caja pendiente,
precios/snapshots backend, idempotencia 48 h, consulta propia/operativa por ID,
búsqueda/asociación mínima de cliente y preparación/LISTO con actor/fecha.
OpenAPI 0.4.0; sin migración nueva ni aplicación a desarrollo/shadow/producción.
No hay cobros, Stripe, caja, tickets/QR, worker ni expiración automática.
Se conservan auth/admin y Cloudinary simulado. Ver [guía](orders-implementation.md)
y [tarea con criterios/evidencia](tasks/ORD-01-pending-orders.md).
Pendiente revisión humana y coordinación con Enrique antes de fusionar a `main`.
Los estados inferiores se conservan como historial.

## Historial — 2026-10-25

Decisión posterior — 2026-10-26: Ángel aceptó explícitamente ADR 0012.
Cloudinary continúa simulado, también en CI. La prueba real queda aplazada hasta
tener credenciales del equipo y autorización explícita para una prueba pequeña;
no configurar ni activar el proveedor real por la sola aceptación del ADR.
Se mantienen las pruebas de autenticación, CSRF, revocación, límites, roles y administración.

Corregido PR bca186b: se quitaron registro abierto, bcrypt, Bearer y fallbackJWT.
Auth cookie/Argon2id, sesiones, refresh concurrente, revocación, límites y CSRF
implementados; administración y opciones atómicas disponibles. Nueva migración
aditiva image_upload_intents aplicada a desarrollo, no reescrita la inicial;
claves locales de auth generadas sin mostrar ni cambiar contraseñas.
Cloudinary real pendiente de credenciales y verificación: proveedor simulado en
pruebas, intents y dispatcher durable implementados. No hay recuperación/registro
por ticket, CRUD empleados ni módulos de compras. Ver auth-admin-implementation.md.
Las secciones inferiores son historial y no sustituyen este estado.

## Historial — 2026-10-20

Ángel aprobó candidato y ADR 0011, datos demo y desarrollo de pasos 2/3.
Migración aplicada sin reset a ProyectoCafeteria local (vacía antes de aplicar),
shadow sin cambios. Seed ficticio aditivo y cuatro GET catálogo implementados.
Infraestructura HTTP común y pruebas de integración agregadas. AngelAdmin
requiere contraseña interactiva mediante npm run admin:create; no se creó con
contraseña predeterminada. [Detalle vigente](backend-progress.md).
Las secciones de revisión previas son historial, no el estado actual de módulos.

## Historial de correcciones — 2026-10-18

- Candidato SQL corregido: 21 defaults, cambio efectivo no nulo, cierre completo
  e importes no negativos. Índices/relaciones únicas alineados con Prisma.
- ER regenerable desde Prisma y SVG Mermaid renderizado. OpenAPI: 18 ejemplos
  formalmente verificados; backlog sin dependencia circular del worker.
- `npm run db:verify` requiere cafeteria_test local aislada y crea/elimina solo
  bases aleatorias propias; no limpia tablas de test ni migra desarrollo/shadow.
- Revisión en PostgreSQL 17.10 temporal: 22 comprobaciones, mutantes C01-C04,
  Prisma deploy/repetición/diff vacío/cliente comprobados. Evidencia en
  `docs/database/review-evidence/corrections-results.json`.
- Nuevos comandos api:validate, db:diagram, db:verify y db:verify:docker.
- Herramientas dev de validación: Swagger Parser, AJV, ajv-formats y YAML;
  añadidas para validación reproducible del contrato, no al runtime.
- En ese momento ADR 0011 era propuesta; fue aceptado el 2026-10-20.
- Los pendientes y la ausencia de módulos corresponden a esta revisión histórica.

Actualizado: 2026-10-18. ADR 0001–0010 aprobadas en esa fecha; entrega candidata de Leonel integrada.
Este archivo resume acuerdos e implementación real; no sustituye reglas ni ADR.

## 1. Ubicación y responsabilidades

Sistema web de gestión de órdenes de cafetería con módulo móvil para clientes.
Repositorios separados para frontend y backend. Carpeta actual:

C:/Users/angel/OneDrive/Documentos/ProyectoCafeteria/CafeteriaProyecto-BACKEND

Equipo ESMAOS: Enrique lleva frontend, Leonel base de datos y el solicitante
backend. Los integrantes se apoyan y revisan cambios entre sí.
No inferir el nombre del responsable del backend por el usuario de Windows.

## 2. Qué existe realmente

- Express/TypeScript con GET /api/v1/health y respuesta {"status":"ok"}.
- Configuración de entorno validada con Zod; arranque y cierre SIGINT/SIGTERM.
- Prisma PostgreSQL con 29 modelos y SQL de migración candidatos recibidos de Leonel.
  Integrados localmente, sin corregir ni aplicar a las bases del proyecto.
- En esa fecha OpenAPI incorporaba cuatro consultas de catálogo como contrato futuro; no endpoints.
- ER, diccionario físico, backlog e informes en docs/database y docs/development-tasks.md.
  Revisar [correcciones pendientes](database/correcciones-pendientes.md) antes de aprobar.
- npm y lockfile, ESLint, Prettier, EditorConfig y TypeScript estricto.
- Dos archivos con cuatro pruebas de health/configuración.
- Script db:check no destructivo para desarrollo y shadow.
- Docker Compose PostgreSQL 17 con bases desarrollo/shadow/test y volumen persistente.
  db:up genera .env.docker sin sobrescribir .env; db:check:docker verifica las tres.
  Configuración validada; arranque real pendiente porque el motor Docker está apagado.
- .env.example y exclusión de secretos mediante .gitignore.

El código actual tiene express.json de 100kb. ADR 0009 exige 256 KiB:
es una diferencia de implementación pendiente, no cambiar el acuerdo para
describir como terminado lo que aún no está implementado.

En esa fecha no había autenticación, CRUD de negocio, persistencia aplicada ni
endpoints de negocio fuera de health. Esa afirmación está superada por las
entregas posteriores; los pagos, caja, worker, correo y Cloudinary real siguen
pendientes. Git independiente confirmado; dev es la rama de trabajo.
No se ha confirmado configuración CI.

## 3. Decisiones aceptadas

| ADR  | Decisión                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------- |
| 0001 | PostgreSQL                                                                                                            |
| 0002 | Node 22 mínimo 22.13, Express 5, TypeScript, npm, Prisma 7/adapter-pg, Zod, ESLint, Prettier, Vitest y Supertest      |
| 0003 | Monolito modular: auth, catalog, orders, payments, cash, customers; rutas/validación/controlador/servicio/repositorio |
| 0004 | BIGINT identity, centavos enteros, UTC/TIMESTAMPTZ, restricciones SQL, históricos y bajas lógicas                     |
| 0005 | JWT en cookie, refresh PostgreSQL, revocación y Argon2id                                                              |
| 0006 | /api/v1, respuestas/errores uniformes, cursor e idempotencia 48 h                                                     |
| 0007 | Confirmación backend, reconciliación/expiración y reembolso excepcional                                               |
| 0008 | Worker PostgreSQL, tareas durables, correo y tokens protegidos                                                        |
| 0009 | HTTPS, CORS/CSRF, logs seguros, CI, entornos y respaldos                                                              |
| 0010 | Cloudinary Free, una imagen JPEG/PNG/WebP por producto hasta 5 MiB, reemplazo seguro                                  |

Todas están aceptadas. Parámetros concretos de bibliotecas, SQL y proveedor final
son trabajo de diseño/implementación, no motivo para reabrir acuerdos aprobados.

## 4. Reglas esenciales vigentes

- CLIENTE, CAJERO, PREPARACION, ADMINISTRADOR; un rol por usuario.
- Administrador hereda caja/cajero y administra catálogo/empleados/clientes.
  Cajero en catálogo solo cambia disponibilidad; no crea/edita precios/da de baja.
- Personal usa username y contraseña de 8–24 caracteres; cliente teléfono MX +52
  o número visible C000105 y NIP de cuatro dígitos como texto.
- JWT acceso 15 min, refresh rotativo PostgreSQL; personal máximo absoluto 8 h
  sin cierre por inactividad; clientes 30 días. Refresh no prolonga límites.
  Logout, baja y cambio/reset de credencial revocan sesiones.
- Cinco fallos en 15 min bloquean 15 min; límite adicional por IP.
- Correo opcional verificado; verificación/recuperación un uso, 30 min. Reset
  excepcional presencial solo admin con identidad, NIP temporal, cambio obligatorio
  y auditoría sin secretos. Cajero no recupera cuentas.
- Recargos globales leche/sabor/extras; tamaños por producto. Selecciones min/max
  por grupo; un extra como máximo una vez por unidad. Backend calcula precios.
- Dinero en centavos; IDs e importes HTTP como strings decimales; fechas UTC.
  Hasta 50 líneas, 1–99 unidades por línea, total máximo 9999900 centavos.
- Catálogo/personal con baja lógica; no borrar categoría con productos asociados,
  incluso dados de baja. Snapshots de nombre, precio y opciones inmutables.
  Agotar producto impide nuevas órdenes y respeta las previas dentro de plazo.
- orders común CASH/STRIPE, método fijo, sin pago parcial/mixto ni cancelación.
  PENDIENTE_PAGO → EN_PREPARACION → LISTO; vencida definitivamente → EXPIRADA.
  Solo efectivo tiene QR de cobro. Escanear no confirma pago.
- LISTO sale de preparación y permanece en BD/historial. Preparación, cajero y
  admin marcan LISTO con actor/fecha. Invitado no consulta estado desde celular;
  se llama por folio y nombre opcional.
- Pago aceptado, venta y preparación se coordinan transaccionalmente. Máximo
  un pago exitoso y una venta por orden; no abrir otro Checkout ante resultado incierto.
- Efectivo vence 30 min; Stripe objetivo 30 min sujeto a estado real del proveedor.
  Aviso tardío no implica pago tardío; consultar antes de expirar. Incertidumbre
  de red exige reintento/reconciliación. Cobro excepcional sobre expirada se
  conserva y reembolsa sin venta/preparación automática.
- Una caja/sesión abierta global. Solo responsable cobra/cierra; admin puede
  cerrar ajena con motivo. Stripe sin caja/cajero. Sin retiros/depósitos adicionales
  ni cambio de responsable. Expirar acceso no cierra caja.
- Efectivo recibido menos cambio = venta; esperado = fondo + ventas efectivo;
  diferencia = contado − esperado. Conservar cierre y actor.
- Invitado pagado recibe QR de registro distinto al de cobro, un uso, 24 h tras
  pago. Alta, asociación de esa compra y consumo token en una transacción.
  Compra ya asociada no emite QR. Token en BD como hash.
- Caja busca cliente por teléfono/número y confirma nombre con datos mínimos.
  Asociación no cambia tras pago salvo alta por QR.
- Ticket imprimible efectivo; digital Stripe con opción imprimir. Ticket digital
  no concede estado/historial al invitado. Favoritos guardan producto; repetir
  usa precios/disponibilidad actuales y advierte cambios.
- Fuera inventario, promociones, descuentos, propinas, factura fiscal y
  devoluciones generales. Se conserva reembolso excepcional de expirada.

## 5. Configuración y comprobaciones

No leer/copiar credenciales para documentarlas. .env local, plantilla sin secretos.
Variables existentes: NODE_ENV, PORT (3000), FRONTEND_ORIGIN (5173),
DATABASE_URL, SHADOW_DATABASE_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
Secrets de JWT, cifrado, correo y Cloudinary se definirán al implementar.

Prisma 7 toma URL de prisma.config.ts; salida src/generated/prisma ignorada.
No cliente de negocio generado. Versiones reales en package.json/lockfile.

Últimos resultados reportados en la configuración inicial, no repetidos aquí:

| Comprobación       | Resultado conocido                                                     |
| ------------------ | ---------------------------------------------------------------------- |
| typecheck/lint     | Repetidos al preparar arranque local Docker                            |
| npm test           | 2 archivos, 4 pruebas pasaron                                          |
| build              | Pasó en la base inicial                                                |
| db:validate        | Esquema recibido con 29 modelos válido en revisión; no prueba conexión |
| db:check           | 14/10/2026: desarrollo y shadow conectan, 0 tablas public              |
| Formato documental | Se comprueba en la revisión de congruencia                             |

Después del fallo inicial el usuario creó las bases y db:check pasó en ambas.
Esto verifica la instalación manual, no el contenedor ni la base test.
La revisión documental no ejecuta migraciones,
cobra ni envía correo. La auditoría npm previa reportó cuatro avisos high
transitivos de Prisma CLI; dato histórico, no resultado actualizado. No aplicar
audit fix --force sin revisar impacto.

Comandos existentes desde raíz (npm.cmd si PowerShell bloquea npm.ps1):
npm ci; npm run db:check; npm run typecheck; npm run lint;
npm run format:check; npm test; npm run build; npm run dev.

db:generate/db:validate/db:migrate existen; no ejecutar migrate hasta diseño y
revisión de migración. No hay seed/db:deploy. Compose prepara una BD test vacía,
pero falta integrar pruebas de negocio con TEST_DATABASE_URL.
Nunca usar principal o shadow para limpieza de tests; separar desarrollo/shadow/test.

## 6. Siguiente trabajo

1. Corregir y completar la entrega candidata de Leonel según docs/database/correcciones-pendientes.md:
   defaults SQL/Prisma, CHECK de efectivo/cierre, ER, pruebas y decisiones pendientes.
   Angel revisará el conjunto terminado para aprobarlo o solicitar ajustes.
2. Probar primer arranque Docker y conexión de sus tres bases; integrar BD test aislada.
3. Completar OpenAPI del catálogo de lectura; coordinar con Enrique.
4. Definir tareas con criterios AC y revisión del responsable.
5. Implementar catálogo lectura, autenticación/administración, compra completa
   efectivo con caja/ticket/expiración; después Stripe, recuperación y resto.
6. Antes de producción elegir hosting/dominio/correo real, retención y política
   de anonimización; configurar HTTPS, CI, secretos, respaldos y probar restauración.

## 7. Mantenimiento

Código técnico inglés, documentación/interfaz español, camelCase/PascalCase y
snake_case SQL. No secretos en logs/docs. OpenAPI antes de endpoints. Migraciones
versionadas, no reescribir compartidas. OneDrive no sustituye Git.
El PDF/anteproyecto anterior puede mencionar MySQL o permisos viejos; no afirmar
que se regeneró. No editar sources del proyecto sincronizado.

Referencias: [ADR](adr/README.md), [reglas](business-rules.md),
[diccionario](data-dictionary.md), [permisos](permissions.md),
[arquitectura](architecture.md), [desarrollo](development-guide.md),
[pruebas](testing.md), [PostgreSQL](database-setup.md),
[planeación](planning-readiness.md), [acuerdos](questionnaire-decisions.md),
[OpenAPI](api/openapi.yaml), [contrato pendiente](api/contract-plan.md).
