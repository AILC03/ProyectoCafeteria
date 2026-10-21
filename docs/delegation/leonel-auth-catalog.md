# Guía de implementación para Leonel

## 1. Encargo, alcance y forma de entrega

Proyecto: Sistema Web de Gestión de Órdenes para Cafetería, equipo ESMAOS. Fecha: 21 de octubre de 2026. Responsable de estos módulos: Leonel. Revisión e integración: Ángel. Coordinación del contrato/frontend: Enrique.

Objetivo A: implementar autenticación y permisos comprobables por rol. Objetivo B: permitir administrar el catálogo desde la API, sin editar directamente PostgreSQL. Este documento complementa U2AV1 y las ADR aceptadas; no sustituye sus decisiones ni certifica funcionalidades todavía no construidas.

Las reglas identificadas como APROBADAS son obligatorias. Los nombres de endpoints, bibliotecas pendientes y precisiones identificadas como PROPUESTA deben revisarse con Ángel y Enrique y registrarse en OpenAPI/ADR antes de codificarse. No interpretar un ejemplo como una API ya disponible.

Entregar primero autenticación/CSRF, después administración y finalmente imágenes. No exponer escrituras de catálogo antes de autenticar y autorizar. Usar ramas y pull requests pequeños; no entregar ambos módulos en un único cambio difícil de revisar.

Fuera de este encargo: frontend, cobros, caja, Stripe, preparación de órdenes, registro por ticket, recuperación por correo, restablecimiento administrativo de NIP, CRUD de empleados e historial/favoritos. Esos flujos usarán esta infraestructura posteriormente; no crear registro abierto como atajo. El cambio de contraseña propia del personal sí forma parte de mantener credenciales seguras.

### Entregables mínimos

- Contratos OpenAPI de auth y administración, ejemplos y errores, revisados antes de implementar.
- Código por capas, migraciones nuevas si realmente hacen falta, pruebas automatizadas y documentación.
- Variables de entorno documentadas con ejemplos vacíos, nunca claves reales.
- Evidencia de pruebas unitarias, integración PostgreSQL, concurrencia de refresh y permisos.
- Instrucciones reproducibles para Ángel y Enrique; lista de límites, decisiones y pendientes reales.

## 2. Punto de partida: qué existe y qué no

El backend y el frontend tienen repositorios separados. Trabajar únicamente en CafeteriaProyecto-BACKEND. No copiar carpetas node_modules, dist o .env desde otro ordenador.

Ruta local de Ángel: C:\Users\angel\OneDrive\Documentos\ProyectoCafeteria\CafeteriaProyecto-BACKEND. Leonel debe usar su propia ruta y base de desarrollo.

### Ya disponible

- Node.js 22 (mínimo 22.13), Express 5, TypeScript estricto, PostgreSQL, Prisma 7 con adapter-pg y npm/lockfile.
- 29 modelos, migración aprobada y aplicada al desarrollo de Ángel; shadow no se migró.
- Menú ficticio aditivo: Latte, Americano, Agua y Crepa, grupos y opciones demo; cuatro roles.
- Cliente Prisma, configuración Zod, errores Problem Details, requestId, logs saneados, Helmet y CORS de origen exacto.
- Serialización de BIGINT/centavos como strings y paginación estable con microsegundos PostgreSQL.
- Cuatro GET de catálogo y GET /api/v1/health. El catálogo público no exige login.
- Argon2 ya instalado y empleado por la CLI de creación del administrador.
- Ángel informó que ya creó la contraseña de AngelAdmin localmente. No pedir esa contraseña: Leonel crea su administrador local con admin:create. La existencia de la cuenta no implica que haya login HTTP.
- Última verificación conocida: 31 pruebas HTTP/unitarias y 13 de integración correctas; tipos, lint, formato, compilación y OpenAPI correctos.

### Todavía por desarrollar

No existen login, refresh, logout, cookies de sesión, middleware de roles, CSRF, escrituras HTTP del catálogo ni integración Cloudinary. El límite público actual es en memoria y NO sustituye el bloqueo persistente del login.

### Archivos a leer antes de empezar

| Archivo                                 | Qué reutilizar o respetar                         |
| --------------------------------------- | ------------------------------------------------- |
| docs/backend-progress.md                | Estado vigente y comandos de los pasos 1 a 3      |
| docs/adr/0005-authentication.md         | JWT, Argon2id, límites y revocación               |
| docs/adr/0006-http-contract.md          | Respuestas, IDs, errores y cursores               |
| docs/adr/0009-web-security-operation.md | CORS, CSRF, HTTPS, logs y límites                 |
| docs/adr/0010-cloudinary-images.md      | Carga firmada, validación y reemplazo             |
| docs/adr/0011-integrity-protocols.md    | Refresh concurrente aprobado y folios             |
| docs/permissions.md                     | Matriz vigente; administrador hereda cajero       |
| docs/database/integrity-protocols.md    | Locks, coherencia y garantías fuera de CHECK      |
| prisma/schema.prisma                    | Campos, relaciones e índices reales               |
| docs/api/openapi.yaml                   | Contrato que no debe romperse                     |
| src/shared/http/ y src/middleware/      | Errores, validación, serialización y requestId    |
| src/modules/catalog/                    | Patrón routes/controller/service/repository/types |

### Puesta en marcha local

```powershell
npm ci
# Crear .env propio solo si aún no existe; nunca sobrescribir uno configurado.
Copy-Item .env.example .env
# Configurar PostgreSQL local y las bases propias antes de continuar.
npm run db:check
npm run db:prepare
npm run db:seed
npm run admin:create
npm run dev
```

db:prepare solo permite bases locales de desarrollo admitidas por el script: cafeteria o ProyectoCafeteria. No ejecutarlo sobre datos ajenos. Una base no vacía sin historial Prisma exige revisión. No usar reset/push ni editar una migración ya aplicada. Para una base con otro nombre coordinar un cambio explícito del guard, no eliminar la protección.

Las pruebas de integración requieren TEST_DATABASE_URL local apuntando a cafeteria_test y un usuario de pruebas con CREATEDB. El runner crea y elimina solo bases aleatorias propias; no limpia desarrollo, shadow ni tablas de cafeteria_test. Si se amplía para auth/admin, conservar estas defensas y actualizar sus instrucciones.

## 3. Contrato y estructura comunes

APROBADO: API /api/v1, JSON camelCase; IDs y dinero son strings decimales; instantes ISO 8601 UTC. Mantener health exactamente con {status:ok}. Éxito individual: {data}; lista: {data,page:{limit,nextCursor}}. Lista vacía devuelve 200, no 404.

Los endpoints nuevos deben declarar autenticación, permisos, CSRF, validaciones, respuestas, cookies, cabeceras y ejemplos. OpenAPI actual valida documentos/ejemplos, pero las pruebas de contrato de runtime actuales solo cubren catálogo: hay que ampliarlas, no asumir cobertura automática.

| Estado | Uso previsto                                                                 |
| ------ | ---------------------------------------------------------------------------- |
| 400    | Entrada inválida; cuerpo/query/path inesperados o mal formados               |
| 401    | Sin autenticación válida o credenciales incorrectas, sin enumerar cuentas    |
| 403    | Sin permiso, CSRF/origen inválido o cambio obligatorio que bloquea operación |
| 404    | Recurso ausente o no visible para el solicitante                             |
| 409    | Conflicto de datos, categoría con productos o refresh recién rotado          |
| 413    | Tamaño de entrada excedido                                                   |
| 429    | Límite de solicitudes o bloqueo de intentos aplicable                        |
| 503    | Dependencia indisponible, sin filtrar SQL o respuesta privada del proveedor  |

Reutilizar HttpProblem/problemHandler, jsonValue, createDatabase y requestContext. No devolver modelos User/AuthSession crudos: DTOs sin hashes, tokens, claves ni identificadores de familia innecesarios. Nunca registrar cookies, autorización, credenciales, tokens CSRF/refresh ni cuerpos de login.

Separación recomendada: rutas definen endpoints/middleware; controlador valida entrada y traduce HTTP; servicio contiene reglas y transacciones; repositorio contiene consultas parametrizadas. No crear otro servidor Express ni otro formato de errores dentro de auth.

```text
src/modules/auth/
  auth.routes.ts
  auth.controller.ts
  auth.service.ts
  auth.repository.ts
  auth.types.ts
src/middleware/
  authenticate.ts
  authorize.ts
  csrf.ts
src/modules/catalog/
  # Ampliar lo existente; separar rutas públicas y administrativas.
tests/
  # Unitarias, HTTP y nuevas integraciones de auth/admin.
```

## 4. Autenticación y permisos

### 4.1 Decisiones aprobadas: no cambiarlas por comodidad

- Cliente: teléfono mexicano normalizado +52 o customer_number, más NIP de exactamente cuatro dígitos como texto. NIP 0007 es válido y no equivale a 7.
- Personal: username y contraseña de 8 a 24 caracteres, sin truncamiento. No reutilizar NIP para empleados. No normalizar ni aplicar trim silencioso a secretos.
- Contraseñas y NIP con Argon2id: memoryCost 19456 KiB, timeCost 2, parallelism 1, sal individual generada por biblioteca. Usar verify de la biblioteca.
- JWT de acceso por cookie HttpOnly; 15 minutos como máximo. Personal: sesión absoluta de 8 horas, sin vencimiento por inactividad. Cliente: hasta 30 días. Refresh no reinicia esos plazos.
- JWT con sub, sid, iat y exp; validar firma, algoritmo permitido, emisor y audiencia. Sin datos personales. Algoritmo/biblioteca/firma y rotación de claves todavía deben concretarse en ADR de implementación.
- Refresh aleatorio de alta entropía, hash en PostgreSQL; rotación atómica y detección de reuso. No convertirlo en JWT reutilizable ni guardarlo en texto claro.
- Solicitudes protegidas comprueban sesión vigente, usuario activo y permisos actuales en PostgreSQL. No confiar solo en firma o en un rol incluido en JWT.
- Logout, baja y cambio/reset de credencial deben revocar acceso de forma efectiva. Un JWT firmado anterior no puede mantener acceso después de revocación.
- Cuenta con must_change_pin solo puede cambiar obligatoriamente el NIP o cerrar sesión; no acceder al catálogo autenticado protegido ni a administración. El menú público continúa siendo público.
- Caducidad del empleado no cierra la sesión de caja. No implementar caja dentro de auth.

### 4.2 Tablas existentes y responsabilidades

| Tabla/campos                             | Uso por auth                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| users, roles                             | Credenciales exclusivas por account_type, estado activo, rol actual y must_change_pin                                           |
| auth_sessions                            | user_id, family_id, refresh_token_hash, rotated_from_id, created_at, last_seen_at, absolute_expires_at, rotated_at y revoked_at |
| auth_attempt_limits                      | key_hash único, window_started_at, attempt_count y blocked_until; persistencia y concurrencia                                   |
| pin_reset_audit / tokens de recuperación | Respetar su modelo; flujos completos fuera de este encargo                                                                      |
| audit_events                             | Utilizar solo cuando corresponda al diseño de auditoría, sin secretos                                                           |

Si falta una restricción o campo para implementación segura, justificar y crear migración NUEVA. No modificar 20261015_initial_candidate, que ya está aplicada. No añadir cascadas que borren ventas, auditorías o sesiones históricas sin acuerdo.

### 4.3 Login: secuencia de trabajo

1. Validar Origin y CSRF, incluso en login; aplicar límite por IP antes de trabajo Argon2 costoso.
2. Validar cuerpo estricto y elegir explícitamente flujo cliente/personal. No aceptar role ni userId enviados por frontend como autoridad.
3. Normalizar solo el identificador según política documentada; no adivinar teléfono frente a número de cliente de manera ambigua.
4. Consultar y actualizar el contador de intentos de forma atómica. Bloqueo aprobado: cinco fallos de cuenta en 15 minutos bloquean 15 minutos; añadir límite por IP documentado.
5. Comparar Argon2id y responder genéricamente si cuenta no existe, está inactiva o la credencial no coincide. Considerar hash ficticio para reducir diferencias obvias de tiempo, sin prometer tiempo constante de todo el sistema.
6. Crear familia/sesión con vencimiento absoluto fijo, token refresh aleatorio y hash; emitir JWT con exp=min(ahora+15 minutos, vencimiento absoluto).
7. Emitir cookies y DTO seguro; si must_change_pin es true devolver indicador para dirigir al cambio, no permisos normales.

No implementar contadores solo en memoria. Probar intentos simultáneos y reinicio del proceso. Para evitar un ataque de enumeración por respuestas 429, aplicar una política coherente también a identificadores inexistentes y limitar crecimiento de claves de contador. El límite público actual del catálogo no resuelve esto.

### 4.4 Cookies y secretos

Cookie de acceso y de refresh: HttpOnly, host-only, sin Domain amplio, Secure en producción. SameSite debe fijarse/documentarse de acuerdo con frontend/API mismo sitio; Lax es una propuesta inicial, no sustituto de CSRF. Path y nombre deben permitir enviar/limpiar cookies correctamente; si se usa prefijo __Host- requiere Secure y Path=/.

No guardar JWT/refresh en localStorage ni devolver refresh en JSON. Calcular Max-Age/Expires conforme al vencimiento absoluto real. Borrar cookies con los mismos atributos de nombre/Path/Domain usados al crearlas. En desarrollo HTTP local documentar las diferencias de Secure/nombres sin debilitar producción.

PROPUESTA de implementación para revisar: jose con HS256, clave aleatoria de al menos 32 bytes y allowlist fija; issuer/audience obligatorios y claves separadas para JWT y CSRF. No usar la contraseña de PostgreSQL, clave de Stripe o api_secret Cloudinary como clave JWT. Puede elegirse otra solución técnicamente justificada antes de programar; no instalar dependencias sin documentarlas.

Documentar JWT_ISSUER, JWT_AUDIENCE y los nombres elegidos para secretos, cookies y flags. No incluir valores reales en .env.example, capturas o pruebas. Si se necesitan claves anteriores para rotación, identificarlas y limitar su periodo de aceptación.

### 4.5 Refresh y concurrencia: ADR 0011 aceptada

1. Origin/CSRF primero; localizar token por hash y serializar por familia, además del lock de la fila. Definir derivación estable de la clave advisory sin registrar token.
2. Dentro de transacción, releer sesión/familia/usuario, revocación y vencimiento absoluto. Crear sucesor, marcar rotated_at y conservar el mismo límite absoluto.
3. Ganador emite nuevo access/refresh. Perdedor con token rotado hace hasta cinco segundos responde 409 REFRESH_ALREADY_ROTATED, sin Set-Cookie, sin devolver sucesor y sin revocar por esa carrera legítima.
4. Reuso fuera de cinco segundos revoca la familia. Logout y reset no tienen esa tolerancia. Nunca permitir renovación de una familia revocada solo por estar dentro de la ventana.
5. Enrique coordina solicitudes con single-flight/Web Locks entre pestañas. Ante 409 espera al ganador y reintenta con la cookie vigente. Documentar qué ocurre si se perdió la respuesta: puede requerir nuevo login; no recuperar el sucesor usando el token viejo.

Precisar en implementación cómo se validan JWT existentes cuyo sid corresponde a una fila ya rotada. No confundir rotated_at con revocación de familia ni permitir que rote el plazo absoluto. PROPUESTA: access previamente emitido conserva validez hasta su exp si fila/familia no están revocadas; refresh viejo deja de renovar. Cualquier variante debe mantener revocación inmediata y tener pruebas, no decisiones implícitas.

### 4.6 Logout y cambios de credencial

PROPUESTA para concretar: logout revoca la familia actual y limpia cookies; cambio de NIP/contraseña y baja revocan todas las sesiones del usuario. Si el equipo requiere logout de todos los dispositivos, definir operación distinta. No dejar esta diferencia sin contrato.

Cambio NIP propio: exigir NIP actual, nuevo exactamente cuatro dígitos, hash nuevo y transacción de actualización/revocación. Para must_change_pin se permite verificar NIP temporal actual y establecer definitivo; eliminar flag solo cuando actualización completa. Tras el cambio, limpiar cookies y exigir nuevo login es la propuesta más simple de revocación; coordinar experiencia con Enrique.

Cambio de contraseña propia del personal: comprobar contraseña actual, aplicar 8–24 sin truncar y revocar sesiones. No desarrollar recuperación administrativa ni cuentas abiertas dentro de este encargo.

### 4.7 Middleware de autenticación y autorización

authenticate valida JWT y BD; authorize recibe permisos/roles permitidos, no solo un rol exacto. Mantener ADMINISTRADOR como heredero de operaciones CAJERO sin conceder a CAJERO capacidades administrativas. Denegar por defecto.

Un cliente no puede elegir otro userId para actuar en su nombre. No devolver hash de NIP/contraseña, refresh_token_hash ni detalles de bloqueo de otra cuenta. Aplicar guard de must_change_pin antes de permisos generales y dejar solo las excepciones aprobadas.

### 4.8 CSRF obligatorio antes de mutaciones

APROBADO: verificar Origin exacto y token CSRF en operaciones autenticadas por cookie, incluidos login/logout. Refresh también requiere protección. CORS y SameSite por sí solos no resuelven CSRF. El navegador enviará credentials:include y una cabecera de token; no enviar token en URL.

Elegir biblioteca/patrón seguro y documentarlo. PROPUESTA: double-submit firmado, con token ligado a nonce preautenticado y después a familia de sesión; cookie host-only y comparación segura de token/cabecera, firma y vencimiento. Un GET de bootstrap devuelve token CSRF, no credenciales; no debe cachearse. No aceptar una simple igualdad de dos valores controlables por un atacante ni un token global estático.

Diseñar bootstrap para quien todavía no ha iniciado sesión, rotación de token al cambiar contexto y comportamiento con access vencido durante refresh. Token CSRF no es access token. Si se usa patrón synchronizer, requiere almacenamiento y expiración explícitos; no esconderlo en un diccionario en memoria si debe sobrevivir reinicios.

No habilitar CORS comodín con credenciales. El webhook Stripe futuro tendrá firma propia y exención explícita de CSRF, pero no se implementa en este encargo. No crear exenciones generales para /api/v1 o todo auth.

### 4.9 Endpoints propuestos: cerrar contrato antes de código

| Método y ruta propuesta          | Entrada o resultado                    | Protección                                  |
| -------------------------------- | -------------------------------------- | ------------------------------------------- |
| GET /api/v1/auth/csrf            | Bootstrap CSRF, Cache-Control no-store | Origen autorizado, límite de abuso          |
| POST /api/v1/auth/login/customer | identifier y pin string                | Origin, CSRF, límite IP/cuenta              |
| POST /api/v1/auth/login/staff    | username y password                    | Origin, CSRF, límite IP/cuenta              |
| POST /api/v1/auth/refresh        | Cookies; no refresh en body            | Origin, CSRF y rotación                     |
| POST /api/v1/auth/logout         | Revocación y limpieza                  | Origin y CSRF; definir expiración previa    |
| GET /api/v1/auth/me              | DTO mínimo de usuario y flag           | JWT más estado BD                           |
| PATCH /api/v1/auth/pin           | currentPin y newPin                    | Cliente, CSRF, excepción cambio obligatorio |
| PATCH /api/v1/auth/password      | currentPassword y newPassword          | Personal, CSRF, comprobación actual         |

Las rutas propuestas no deben declararse disponibles hasta implementarlas. Definir respuestas 200/201/204 de forma uniforme; un 204 no lleva body. Identificar esquema cookieAuth en OpenAPI, cabecera CSRF, Set-Cookie y respuesta 409 de refresh. Aclarar si /me se bloquea con must_change_pin: regla aprobada solo permite cambio/logout; no ampliar excepciones silenciosamente.

### 4.10 Pruebas de aceptación de auth

| ID       | Escenario                                              | Debe comprobar                                            |
| -------- | ------------------------------------------------------ | --------------------------------------------------------- |
| AUTH-T01 | Login personal correcto/incorrecto                     | Cookie segura; error genérico y sin secretos              |
| AUTH-T02 | Cliente por teléfono y número; NIP 0007                | Misma cuenta, ceros conservados                           |
| AUTH-T03 | JWT alterado, algoritmo/emisor/audiencia inválidos     | 401 sin aceptar claims manipulados                        |
| AUTH-T04 | Usuario inactivo o sesión revocada con JWT aún firmado | Acceso inmediato rechazado                                |
| AUTH-T05 | Plazos 15 min, 8 h y 30 días                           | Reloj controlado; refresh no extiende absoluto            |
| AUTH-T06 | Dos refresh simultáneos                                | Un éxito, un 409, sin borrar cookie del ganador           |
| AUTH-T07 | Reuso después de 5 s y después de logout               | Familia revocada; no renovación                           |
| AUTH-T08 | Cinco fallos concurrentes/reinicio                     | Bloqueo persistente 15 min, sin bypass por carreras       |
| AUTH-T09 | Cuenta inexistente y NIP erróneo                       | Respuestas genéricas; no enumeración obvia                |
| AUTH-T10 | must_change_pin                                        | Solo cambiar NIP/logout; luego nuevo hash y revocación    |
| AUTH-T11 | CSRF ausente/incorrecto/origen ajeno                   | Rechazar login, refresh, logout y mutaciones              |
| AUTH-T12 | Permisos de cada rol                                   | Invitado/cliente/cajero/preparación no administran        |
| AUTH-T13 | Cambio contraseña/NIP                                  | Credencial anterior y sesiones previas dejan de funcionar |
| AUTH-T14 | Logs y respuestas                                      | Nunca JWT, cookies, claves, hashes ni SQL                 |

Usar reloj inyectable/fake en pruebas de tiempo; no esperar ocho horas ni dormir cinco segundos en cada test. Carreras deben usar conexiones/transacciones reales en PostgreSQL, no únicamente mocks.

## 5. Administración del catálogo

### 5.1 Permisos y alcance exactos

| Operación                                 | Administrador | Cajero                 | Cliente/Preparación/Invitado |
| ----------------------------------------- | ------------- | ---------------------- | ---------------------------- |
| GET público de catálogo                   | Sí            | Sí                     | Continúa público             |
| Crear/editar/baja categorías y productos  | Sí            | No                     | No                           |
| Configurar grupos, valores y asignaciones | Sí            | No                     | No                           |
| Cambiar disponibilidad de producto        | Sí            | Sí, solo este atributo | No                           |
| Autorizar/asociar/reemplazar imagen       | Sí            | No                     | No                           |

Usar endpoint específico de disponibilidad para cajero, con body estricto {isAvailable:boolean}. Si recibe name, price, categoryId o imageUrl, rechazar; no ignorar campos para simular seguridad. El backend comprueba rol, no se basa en botones ocultos.

### 5.2 Entidades y reglas locales

- categories: nombre, is_active, deleted_at y created_at. Inactivar oculta categoría y sus productos en GET públicos; borrar lógicamente se bloquea si tiene cualquier producto asociado, incluso retirado.
- products: categoría, nombre, descripción, base_price_cents, is_available, referencias Cloudinary y fechas. Precio no negativo; IDs/centavos string HTTP. No aceptar referencias de imagen arbitrarias en el PATCH general.
- option_groups: nombre, pricing_scope GLOBAL o PER_PRODUCT y deleted_at.
- option_values: grupo, nombre, global_surcharge_cents, is_available y deleted_at.
- product_option_groups: producto/grupo únicos, min_selections >= 0, max_selections >= min.
- product_option_values: asignación/valor únicos; valor pertenece al mismo grupo y recargo coherente con alcance.

Usar longitudes reales de Prisma y reglas aprobadas, no un esquema de validación con tamaños distintos. Precisar null frente a campo omitido en PATCH. Evitar conversiones silenciosas de strings monetarios a Number: usar BigInt validado. No introducir inventario, descuentos o precios negativos.

### 5.3 Bajas lógicas e historial

DELETE administrativo representa baja lógica, no DELETE físico de productos, grupos o valores históricos. Retirados no aparecen en endpoints públicos, pero registros y snapshots siguen disponibles para historial. Definir si listados administrativos incluyen retirados con filtro explícito y paginación; no abrir esa vista como pública.

Para categoría, incluso la baja lógica requiere bloquear y consultar asociaciones: FK RESTRICT por sí sola solo protege borrado físico. is_active=false es inactivación, no debe usarse como un borrado encubierto. Documentar diferencia de ambas operaciones.

Retirar grupo/valor debe mantener coherencia de productos activos: no dejar grupo obligatorio sin suficientes valores utilizables para seleccionarlo. Si retiro/agotamiento rompe selección requerida, rechazar con 409 o ejecutar una modificación atómica revisada por el equipo; no inventar opciones ni cambiar mínimos silenciosamente. No reescribir order_items/order_item_options por cambios de catálogo.

Desasignar una relación producto-opción debe preservar órdenes anteriores. Revisar FK e impacto: si se opta por borrar solo relaciones de configuración sin referencias históricas, hacerlo explícito y transaccional; no generalizar borrado físico a valores/productos. Restauración de bajas no está aprobada: no añadirla como requisito.

### 5.4 Precios y coherencia de opciones

APROBADO: tamaño tiene recargo por producto; leche, sabor y extras tienen recargo global. Ejemplo: grande Latte +2000 centavos; grande Americano +1000; leche de almendra +1000 en todos donde esté habilitada.

GLOBAL exige global_surcharge_cents informado y surcharge_override_cents NULL. PER_PRODUCT exige global NULL y override informado en cada asignación válida. No cambiar pricing_scope sin revisar y actualizar todas las referencias afectadas en la misma transacción o rechazar el cambio con 409.

Verificar pertenencia por grupo, producto/categoría vigentes, duplicados y límites de selección. Cada extra se elige una vez por unidad inicialmente. Los índices/ CHECK locales no validan todas las reglas entre tablas; no delegar esas reglas al frontend.

Escrituras de catálogo toman advisory lock transaccional (2026,1), conforme al protocolo aprobado, validan y escriben bajo la misma transacción. Cambios que requieran actualizar varias filas no deben dejar un precio o grupo parcialmente configurado. Coordinar este lock con el futuro servicio de creación de snapshots. No mantener locks mientras se llama Cloudinary.

El GET actual de opciones calcula recargo efectivo y devuelve 503 si una configuración deja precio NULL. Nuevas escrituras deben evitar producir ese estado. Mantener los cuatro GET existentes compatibles y sus pruebas, incluidas fechas con microsegundos e IDs mayores que Number.MAX_SAFE_INTEGER.

### 5.5 Endpoints administrativos propuestos

| Método/ruta propuesta                             | Función                        | Notas                                               |
| ------------------------------------------------- | ------------------------------ | --------------------------------------------------- |
| GET/POST /api/v1/admin/categories                 | Listar y crear                 | Solo admin; GET paginado                            |
| GET/PATCH/DELETE /api/v1/admin/categories/{id}    | Consultar, editar y baja       | DELETE 409 si tiene productos                       |
| GET/POST /api/v1/admin/products                   | Listar y crear                 | Incluir retirados solo con filtro admin explícito   |
| GET/PATCH/DELETE /api/v1/admin/products/{id}      | Consultar, editar y baja       | Sin imágenes arbitrarias en body                    |
| PATCH /api/v1/products/{id}/availability          | Cambiar isAvailable            | Cajero o admin; campo único                         |
| GET/POST /api/v1/admin/option-groups              | Grupos                         | Alcance precio validado                             |
| GET/PATCH/DELETE /api/v1/admin/option-groups/{id} | Editar o retirar grupo         | Comprobar referencias y mínimos                     |
| GET/POST /api/v1/admin/option-groups/{id}/values  | Valores                        | No permitir pertenencia ajena                       |
| PATCH/DELETE /api/v1/admin/option-values/{id}     | Editar o retirar valor         | Precio global/alcance coherentes                    |
| PUT /api/v1/admin/products/{id}/configuration     | Configuración completa atómica | Alternativa a múltiples endpoints; revisar contrato |

Estos nombres son propuestas; no implementar a la vez PUT completo y múltiples escrituras equivalentes sin necesidad. Un endpoint atómico de configuración ayuda a no crear estados intermedios inválidos; decidir con Ángel/Enrique. Todas las mutaciones exigen sesión, rol, estado permitido y CSRF. No modificar los paths públicos GET existentes.

### 5.6 Imágenes Cloudinary: decisiones aprobadas

- Cloudinary plan Free dentro de cuota, sin contratación automática. La cuenta y las credenciales deben configurarse por el equipo; no asumir que existen. Verificar condiciones vigentes antes de publicar, sin prometer capacidad ilimitada.
- Solo admin autoriza carga firmada y asociación. api_secret únicamente backend.
- Una imagen por producto: JPEG/PNG/WebP y máximo 5 MiB. Validar tipo real, tamaño y dimensiones; extensión/MIME de navegador no bastan. El límite numérico de dimensiones está pendiente de precisión y aprobación; no inventarlo como regla cerrada.
- Guardar HTTPS image_url, image_public_id e image_version. Verificar pertenencia al espacio autorizado; no aceptar cualquier URL enviada por cliente ni descargar URLs arbitrarias desde backend.
- Subir nuevo asset primero, actualizar referencia en BD después, limpiar anterior con reintento durable. Fallo de carga no borra la imagen vigente.
- No almacenar binarios en PostgreSQL ni permitir que errores de imagen rompan el catálogo. No cambiar snapshots históricos por sustituir foto.

### 5.7 Flujo seguro de imágenes a implementar

1. Admin solicita autorización para un producto existente; backend valida sesión/CSRF/rol y genera public_id/folder/nonce/timestamp controlados por él. Firma solo parámetros permitidos, no un objeto arbitrario del frontend.
2. Cliente carga a Cloudinary con esos parámetros. Un archivo de 5 MiB no cabe en el JSON de 256 KiB: carga directa firmada o flujo separado, no ampliar globalmente el límite JSON.
3. Backend finaliza asociación verificando prueba del proveedor y/o consulta autenticada del asset, public_id autorizado, resource_type=image, bytes, formato y dimensiones. La firma de autorización por sí sola NO demuestra el contenido que se subió.
4. Hacer autorización/intent consumible o trazable, con expiración y protección contra reuso/asociación a otro producto. Si requiere tabla nueva, justificar migración. No asumir que el esquema actual ya tiene upload_intents.
5. Fuera de llamadas externas, tomar lock breve del producto, comprobar versión esperada y actualizar referencias. Evitar que dos reemplazos concurrentes borren la imagen ganadora.
6. Persistir limpieza del asset anterior mediante jobs/outbox o mecanismo durable aprobado y entregar handler verificable. Mientras el worker general no exista, documentar y proporcionar ejecución local mínima para reintentar limpieza; no dejar solo un TODO ni prometer limpieza automática inexistente.
7. Si Cloudinary sube pero la transacción falla, registrar limpieza del huérfano y conservar referencia anterior. Distinguir no asociado, asociado y pendiente de limpiar; no eliminar asset aún referenciado por otro producto.

PROPUESTA de rutas: POST /api/v1/admin/products/{id}/image-upload y PUT /api/v1/admin/products/{id}/image. Definir firma, expiración, respuesta al frontend, finalización y errores antes de implementar. El endpoint no debe devolver api_secret. Simular proveedor en CI; reservar pruebas reales pequeñas para cuenta Free del equipo.

Variables ilustrativas: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET. Añadir ejemplos vacíos, validación y documentación; no obligar a disponer de Cloudinary para probar login o catálogo sin imágenes. Verificar configuración al usar el módulo o habilitar su funcionalidad.

### 5.8 Pruebas de aceptación de administración

| ID      | Escenario                                                      | Resultado obligatorio                                  |
| ------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| ADM-T01 | Admin crea/edita producto                                      | Persiste y aparece en GET público según estado         |
| ADM-T02 | Cajero cambia disponibilidad                                   | Solo atributo permitido; no modifica precio/nombre     |
| ADM-T03 | Cada rol intenta CRUD, sin cookie o sin CSRF                   | 401/403; ninguna escritura parcial                     |
| ADM-T04 | Precio negativo, ID inválido, campo desconocido                | 400 sin pérdida de precisión ni coerción indebida      |
| ADM-T05 | Baja producto/opción con órdenes previas                       | GET público oculta; snapshots sin cambios              |
| ADM-T06 | Baja categoría con producto activo o retirado                  | 409, incluida baja lógica                              |
| ADM-T07 | GLOBAL con override o tamaño sin precio                        | Rechazo transaccional; GET no queda roto               |
| ADM-T08 | Valor de otro grupo, duplicado o min/max inválidos             | Rechazo sin configuración parcial                      |
| ADM-T09 | Dos ediciones y cambio de alcance concurrentes                 | Estado final coherente y locks comprobados             |
| ADM-T10 | Imagen falsa, no JPEG/PNG/WebP, >5 MiB o dimensiones inválidas | No asociación; validar contenido real                  |
| ADM-T11 | URL/public_id ajeno o intento reutilizado                      | Rechazo sin acceso a recursos de otro espacio          |
| ADM-T12 | Falla carga, BD o limpieza                                     | Vigente conservada; huérfano/limpieza reintentable     |
| ADM-T13 | Dos reemplazos de imagen simultáneos                           | No borrar asset ganador ni perder referencia válida    |
| ADM-T14 | Regresión catálogo de lectura                                  | Siguen pasando las cuatro rutas y contratos existentes |

## 6. Secuencia recomendada de trabajo

| Entrega | Alcance                                                      | Condición para continuar                                   |
| ------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| PR-1    | Contratos auth/admin y precisiones pendientes                | Revisión Ángel/Enrique; no endpoints ficticios             |
| PR-2    | Hash, bootstrap CSRF, login, sesiones y límites persistentes | Login seguro probado; sin rutas admin expuestas            |
| PR-3    | Refresh concurrente, logout y revocación                     | Pruebas PostgreSQL y límites absolutos correctos           |
| PR-4    | Integración CSRF, roles y cambio obligatorio                 | Todos los guardas integrados y acceso indebido rechazado   |
| PR-5    | Categorías/productos/disponibilidad                          | Mutaciones protegidas, bajas y restricciones correctas     |
| PR-6    | Personalizaciones/configuración atómica                      | Precios globales/tamaños y concurrencia coherentes         |
| PR-7    | Cloudinary y limpieza durable                                | Proveedor mock, errores y reemplazos concurrentes probados |
| PR-8    | Integración, documentación y evidencia final                 | Criterios AUTH-T/ADM-T completos o pendientes explícitos   |

El orden de PR es organizativo: CSRF/roles deben estar listos antes de habilitar cualquier ruta protegida. Una PR de login aún incompleta debe quedar sin montar en entornos compartidos hasta integrar todas sus defensas. Coordinar Enrique para cookies, bootstrap CSRF, 409 refresh y cargas de imagen.

### Decisiones que Leonel debe cerrar antes de integrar

- Biblioteca, algoritmo, allowlist, issuer/audience y rotación de claves JWT.
- Nombres/Paths/SameSite y comportamiento local/producción de cookies.
- Patrón de CSRF, bootstrap prelogin y token después de iniciar/renovar sesión.
- Alcance exacto de logout, relación sid/fila rotada y política de normalización del identificador.
- Límite por IP del login y limpieza segura de contadores persistentes.
- Contrato administrativo atómico frente a operaciones individuales y manejo de conflictos de edición.
- Límites numéricos de dimensiones, intent de carga y dispatcher de limpieza Cloudinary.

Estas precisiones no permiten cambiar los plazos 15 min/8 h/30 días, 5 fallos/15 min, ventana refresh 5 s, roles ni restricciones aprobadas. Documentar acuerdos, no preguntar de nuevo reglas ya cerradas.

## 7. Validación, evidencia y criterio final

```powershell
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:integration
npm run api:validate
npm run build
```

Ampliar test:integration y su runner para que ejecute auth/admin, además del catálogo actual, sin tocar desarrollo. Instalar desde lockfile con npm ci; Prisma genera cliente en postinstall. No generar un segundo lockfile. Validar migraciones nuevas sobre una base aislada y repetir despliegue sin resets.

Entregar tabla de pruebas con ID, comando, versión PostgreSQL, resultado, fecha y limitaciones. Señalar qué pruebas usan mocks y cuáles PostgreSQL real. No atribuir pruebas al compañero si no se ejecutaron. No incluir .env, cookies, JWT, contraseñas, dumps reales ni capturas con secretos. Los avisos npm conocidos de Prisma requieren revisión compatible antes de producción; no ejecutar audit fix --force como solución automática.

Definition of Done: contratos revisados, reglas implementadas en backend, migraciones nuevas versionadas si aplican, pruebas de permisos/errores/concurrencia correctas, logs y respuestas saneados, documentación actualizada y revisión de Ángel. Que Postman permita un login correcto no demuestra CSRF, revocación, límites ni seguridad por rol.

Resultado esperado al finalizar: AngelAdmin y personal/clientes de pruebas pueden iniciar/cerrar sesión con controles completos; ningún rol indebido administra. El administrador gestiona categorías, productos, personalizaciones e imágenes desde API; cajero solo disponibilidad; los GET públicos y los históricos mantienen su comportamiento.

## 8. Lista de entrega para Leonel

- [ ] Rama/commit y resumen de archivos modificados; sin revertir trabajo ajeno.
- [ ] OpenAPI de todas las operaciones nuevas con seguridad, cookies, CSRF y errores.
- [ ] ADR/precisiones técnicas cerradas y revisadas.
- [ ] Sesiones/refresh y límites de intentos probados con concurrencia real.
- [ ] Matriz de roles cubierta, incluidos must_change_pin y administrador heredando cajero.
- [ ] CRUD y disponibilidad estrictamente separados; bajas sin daño al historial.
- [ ] Configuración de opciones/precios transaccional y bloqueos coherentes.
- [ ] Cloudinary validado y reemplazo/limpieza recuperables, sin secretos.
- [ ] Pruebas/CI locales reproducibles y regresión del catálogo existente.
- [ ] Guía de arranque local y pendientes operativos honestos.
- [ ] Revisión final de Ángel antes de integrar.
