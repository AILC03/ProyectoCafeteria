# Autenticación y administración — estado vigente

Actualizado: 2026-10-25. Corrección del PR de Leonel y ampliación del encargo.
No hay registro abierto, bcrypt, Bearer de 8 h ni clave JWT de respaldo.
No se modificó la contraseña existente de AngelAdmin.

## Preparar otro ordenador

```powershell
npm ci
# Configurar .env local sin compartir secretos.
npm run auth:setup
npm run db:prepare
npm run db:seed
npm run admin:create
npm run dev
```

No sobrescribir .env ni repetir admin:create para restablecer una contraseña:
si la cuenta existe, la CLI se niega a modificarla. db:prepare solo apunta a las
bases locales de desarrollo permitidas y nunca ejecuta reset. Desarrollo de
Ángel ya tiene la migración aditiva image_upload_intents; no se reescribió la
inicial ni se aplicó nada a producción/shadow. Las claves locales de auth se
generaron sin mostrarlas y sin sustituir valores existentes.

## Flujo para Enrique / cliente HTTP

1. GET /api/v1/auth/csrf con credentials:include. Guardar data.csrfToken en memoria.
2. POST /api/v1/auth/login/staff con {username,password}, o
   /login/customer con {identifier,pin}. Enviar X-CSRF-Token y credentials:include.
   El navegador añade Origin; en Postman/terminal indicar el origen configurado.
3. Las cookies son HttpOnly: no leerlas desde JavaScript ni usar localStorage.
   Login devuelve {data:{user,csrfToken}}, no JWT ni refresh en JSON.
4. Sustituir el CSRF en memoria por el recibido tras login/refresh. GET /auth/me
   recibe cookies automáticamente. Un Bearer no autentica estas rutas.
5. Refresh: POST /api/v1/auth/refresh con cookies, CSRF y Origin; body {} u omitido.
   Coordinar single-flight/Web Locks entre pestañas. 409 REFRESH_ALREADY_ROTATED
   no borra cookies: esperar ganador y reintentar con cookie/CSRF vigentes.
   Coordinar también el CSRF entre pestañas; renovar bootstrap si vence a la hora.
6. Logout: POST /api/v1/auth/logout con CSRF. Revoca familia actual y limpia cookies.
7. PIN temporal: login informa mustChangePin; solo PATCH /auth/pin y logout.
   /me y refresh no se permiten hasta cambiar. Body {currentPin,newPin}, strings
   de cuatro dígitos. Se revocan sesiones y se exige nuevo login.
8. PATCH /api/v1/auth/password para personal: {currentPassword,newPassword},
   8–24 caracteres. Cambios de credencial revocan todas las sesiones del usuario.

Cliente: teléfono MX +52 o diez dígitos, o número C; nunca correo y contraseña.
Personal: username exacto (por ejemplo AngelAdmin) y contraseña. Los hashes
existentes Argon2id funcionan; no se convierte ni se resetea ninguna contraseña.

Cookie de desarrollo: caf_access/caf_refresh/caf_csrf, HttpOnly, SameSite=Lax,
Path=/. Producción: __Host-caf_* con Secure y origen frontend HTTPS.
Sin AUTH_JWT_SECRET/AUTH_CSRF_SECRET válidas se devuelve 503 en auth; no existe
fallback. JWT_SECRET antiguo se ignora. Producción no inicia sin claves.
Las claves deben ser distintas, aleatorias y de >=32 bytes representadas en hex.
Rotación operativa: generar claves nuevas fuera del chat/logs, cambiar entorno
y reiniciar; JWT anteriores se invalidan, CSRF debe reobtenerse. No hay keyring
de transición automática. auth:setup conserva claves reales existentes.

## Reglas implementadas

- JWT <=15 min, issuer/audience/algoritmo y sesión/usuario/rol actuales en BD.
- Personal 8 h absolutas sin inactividad; cliente 30 días, refresh no extiende.
- Carrera refresh <=5 s: 409 sin nuevas credenciales; reuso posterior revoca.
- Bloqueo cuenta: 5 fallos/15 min, bloqueo 15 min; contadores persistentes incluso
  para inexistentes. La validación de credencial actual comparte protección.
- IP: 20 logins/minuto por defecto, AUTH_IP_LIMIT configurable; catálogo conserva
  su limitador público independiente en memoria.
- Respuestas Problem Details, sin secretos/SQL. DTO de usuario mínimo.
- Sin guardado en memoria de sesiones, sin rol confiado al JWT del cliente.

## Administración disponible

Todo /api/v1/admin exige administrador; mutaciones también Origin/CSRF.

| Recurso                            | Operaciones                                          |
| ---------------------------------- | ---------------------------------------------------- |
| /admin/categories                  | GET paginado y POST                                  |
| /admin/categories/{id}             | GET, PATCH, DELETE lógico; 409 si conserva productos |
| /admin/products                    | GET paginado y POST                                  |
| /admin/products/{id}               | GET, PATCH y DELETE lógico                           |
| /admin/option-groups               | GET paginado y POST                                  |
| /admin/option-groups/{id}          | GET, PATCH y DELETE lógico                           |
| /admin/option-groups/{id}/values   | GET paginado y POST                                  |
| /admin/option-values               | GET paginado; groupId opcional                       |
| /admin/option-values/{id}          | GET, PATCH y DELETE lógico                           |
| /admin/products/{id}/configuration | GET y PUT atómico de grupos/asignaciones             |
| /products/{id}/availability        | PATCH solo {isAvailable}, cajero o administrador     |
| /admin/products/{id}/image-upload  | POST de autorización firmada                         |
| /admin/products/{id}/image         | PUT {intentId} para asociar asset verificado         |

Prefijo completo /api/v1. Listas: limit/cursor/includeDeleted; grupos/valores
ordenados por id porque no tienen created_at, categorías/productos por fecha/id.
Un cursor no sirve para otro recurso o filtros. Identificadores/precios string.

PATCH rechaza campos desconocidos. Cajero no puede modificar precio, nombre,
imagen ni categoría. Retirar no borra registros ni snapshots. Categoría con
productos incluso retirados no se da de baja. GLOBAL exige precio global y
override NULL; PER_PRODUCT lo inverso. PUT reemplaza relaciones, no valores ni
productos; valida duplicados, pertenencia y mínimos bajo lock (2026,1).
Grupos con valores/asignaciones conservan alcance: crear otro para cambiarlo.
Cada escritura genera auditoría sin copiar cuerpos privados.

## Cloudinary

Configurar CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET locales. No son necesarias
para login ni CRUD sin imágenes; rutas de imagen devuelven 503 sin proveedor.
No hay cuenta del equipo ni credenciales inventadas. Validación real pendiente.

Autorización genera intent propio de 10 min y parámetros firmados, sin api_secret.
La carga es directa al uploadUrl de Cloudinary, no JSON base64 a la API.
En FormData enviar file, public_id, timestamp, overwrite, allowed_formats,
signature y api_key exactamente como se autorizaron; uploadUrl es el destino,
no un campo de la carga. cloud_name ya forma parte de la URL del proveedor.
Asociación consulta metadata autenticada del proveedor: JPEG/PNG/WebP <=5MiB,
1–8192 px por dimensión y <=40MP. No se descargan URLs arbitrarias. Configurar
además preset Cloudinary con límites de carga para proteger cuota durante subida.

Nuevo asset primero; CAS de public_id+version impide carreras. Solo el creador
del intent lo consume una vez y para su producto. Fallos no quitan imagen vigente.
Jobs durables para anterior/huérfanos, lease y reintentos saneados; nunca borrar
asset todavía referenciado. Limpieza diferida >=2 h desde autorización para no
permitir reupload con una firma aún válida.

```powershell
npm run images:cleanup
npm run auth:cleanup
```

Son dispatchers de una ejecución, no daemon: hay que programar ejecuciones
periódicas al desplegar. images:cleanup procesa hasta 20 jobs y encola hasta
100 huérfanos sin bloquearse por intents ya encolados. auth:cleanup retira solo
contadores vencidos antiguos (48 h), sin borrar usuarios/sesiones. Retención de
sesiones/intents/auditoría y scheduling de producción siguen por definir.

## Pruebas y despliegue

```powershell
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:integration
npm run api:validate
npm run build
```

test:integration requiere TEST_DATABASE_URL local /cafeteria_test y CREATEDB;
cada archivo se ejecuta en una base aleatoria propia que se elimina al final.
No escribe usuarios ni pedidos en desarrollo. Prueba proveedor con mock, no
certifica red, claves, cuotas ni transformación de imágenes del proveedor real.
OpenAPI 0.3.0 especifica auth/admin; api:features regenera esas operaciones sin
reemplazar los GET públicos originales; revisar diff cuando se use.

No se implementan aún registro por ticket, recuperación de correo, reset de NIP
administrativo, CRUD empleados, órdenes, cobros, caja, Stripe ni frontend.
Revisar PR con Ángel/Enrique, probar HTTPS/cookies en despliegue y Cloudinary
real antes de declarar producción lista. No usar npm audit fix --force.

Resultados de referencia de esta entrega: 39 pruebas unitarias/HTTP, 32 de
integración PostgreSQL (19 auth/admin y 13 catálogo), 22 comprobaciones SQL y
28 ejemplos OpenAPI verificados. Auditoría npm corregida sin force ni cambio
de versión mayor: cero avisos en la ejecución de cierre, no garantía permanente.
