# Avance backend — pasos 1, 2 y 3

## AUTH-02 local — 2026-10-31

Registro exclusivamente con QR de ticket pagado: transacción PostgreSQL, consumo
único permanente, asociación exclusiva sin alterar snapshots, teléfono MX único y
NIP Argon2id compatible con auth. Sin sesión automática ni migración nueva.
Contrato OpenAPI 0.6.0, módulo customer-registration y pruebas HTTP/BD añadidos.
Revisión humana/integración pendientes; sin recuperación/reset/perfil/Stripe.
Evidencia y estado de checks: [tarea AUTH-02](tasks/AUTH-02-ticket-qr-registration.md).

## CASH-01/CASH-02 local — 2026-10-27

Implementados caja/apertura/resumen/cierre, cobro CASH por ID con pago/venta/
preparación atómicos y ticket JSON protegido; QR de registro preparado, sin alta
final. Probados sobre PostgreSQL 17 aislado, pendientes revisión e integración.
No hay QR de cobro ni Stripe/worker/expiración automática. Migración aditiva de
cifrado del token de ticket no aplicada a desarrollo/shadow/producción. Detalle:
[guía](cash-implementation.md), [tarea y resultados](tasks/CASH-01-02-cash-payments.md).

## Actualización ORD-01 — 2026-10-26

Auth/admin ya implementados y ADR 0012 aceptado por Ángel; Cloudinary continúa
simulado. Ahora existe la primera entrega local de orders: creación pendiente
móvil/caja, precios y snapshots de backend, idempotencia, consultas protegidas,
asociación mínima de cliente y preparación/LISTO. No se implementaron cobros,
caja, Stripe, tickets, worker ni expiración automática. Detalle y evidencia:
[órdenes](orders-implementation.md), [tarea ORD-01](tasks/ORD-01-pending-orders.md).
Lo que sigue describe la etapa histórica de catálogo, no el estado vigente.

Actualizado: 2026-10-21. Autorización explícita de Ángel el 2026-10-20: candidato corregido, ADR 0011,
datos ficticios y continuar infraestructura común/catálogo. No equivale a permitir
otras funcionalidades ni despliegue de producción.

## Historial de catálogo e infraestructura — 2026-10-21

### 1. Persistencia y datos

- Se comprobó desarrollo/shadow: 0 tablas antes de migrar.
- DATABASE_URL realmente apunta a la base local `ProyectoCafeteria`, no al nombre
  ilustrativo cafeteria. No se modificaron credenciales ni .env.
- Se aplicó la migración aprobada mediante deploy, sin reset ni modificar shadow.
- Se generó cliente Prisma. npm ci ejecutará generate automáticamente, sin
  necesitar credenciales de base; migrar/ejecutar API sí requiere configuración.
- Semilla aditiva transaccional con cuatro roles y menú ficticio: Café, Bebidas
  y Alimentos (demo); Latte, Americano, Agua y Crepa (demo). Opciones de tamaño,
  leche, sabor y extras, con tamaños diferentes por bebida.
- db:seed puede repetirse sin duplicar ni actualizar precios existentes. No es
  una restauración de datos y no elimina productos modificados por el equipo.
- Faltante interactivo: crear AngelAdmin. No hay contraseña predeterminada.

Desde la raíz en terminal local:

```powershell
npm run admin:create
```

Introduce y confirma contraseña oculta de 8–24 caracteres. Se guarda Argon2id
(19 MiB, dos iteraciones, paralelismo 1), no la contraseña original. Nombre y
usuario AngelAdmin. Si ya existe, no cambia cuenta ni contraseña. No usar
argumentos ni variables de entorno para introducir la contraseña. Todavía no
hay endpoint de login: la cuenta queda preparada para el módulo de autenticación.

## 2. Infraestructura común

- PrismaPg con pool y desconexión al detener servidor.
- Validación Zod; errores application/problem+json sin stack, SQL ni secretos.
- UUID requestId generado por servidor, cabecera X-Request-Id, logs Pino limitados
  a método, resultado y duración; no cuerpos, cookies, query ni credenciales.
- Serialización explícita de BIGINT y fechas, sin modificar prototipos globales.
- Cursor base64url validado y ligado a recurso/filtros, 20 por defecto/100 máximo.
- Cursores conservan microsegundos PostgreSQL; no redondear created_at mediante
  Date de JavaScript al comparar páginas.
- Helmet, CORS con origen exacto y credenciales, JSON 256 KiB.
- Límite público por IP configurable CATALOG_RATE_LIMIT (120/minuto por defecto)
  en memoria por proceso; health excluido. Es protección inicial de lectura,
  no reemplaza limitación persistente de login ni sirve como límite distribuido.
- En esa etapa aún no había operaciones de escritura HTTP, login ni cookies de
  sesión. Actualmente auth/admin implementan esos controles; este punto se
  conserva como evidencia histórica.
- Dependencias de implementación: cors, helmet, pino, express-rate-limit y argon2;
  sus funciones justifican su incorporación. Argon2 ya estaba definido en ADR 0005.

## 3. Catálogo público disponible

| Operación                                | Función                                 |
| ---------------------------------------- | --------------------------------------- |
| GET /api/v1/categories                   | Activas, no dadas de baja; limit/cursor |
| GET /api/v1/products                     | limit/cursor, categoryId e isAvailable  |
| GET /api/v1/products/{productId}         | Detalle visible, incluso agotado        |
| GET /api/v1/products/{productId}/options | Opciones vigentes y recargo efectivo    |

Éxito {data}; listas {data,page:{limit,nextCursor}}. Opciones sin grupos: data=[].
IDs y precios como strings decimales. Inactivos/retirados no visibles; agotados
se indican y pueden filtrarse. IDs/query inválidos 400; ausente 404; dependencia
indisponible 503; inesperado 500 sin detalles internos. Errores CORS 403,
tamaño 413 y límite 429. SQL de lectura parametrizado mediante Prisma.sql.

```powershell
npm run dev
```

Abrir http://localhost:3000/api/v1/categories y http://localhost:3000/api/v1/products.
No suponer IDs de fixtures: obtenerlos del listado y usarlos en detalle/opciones.

## Pruebas y límites

Resultado de cierre: 31 pruebas HTTP/unitarias y 13 de integración PostgreSQL
correctas; tipos, lint, formato, build y contrato también comprobados.
Smoke adicional contra API compilada y base de desarrollo: tres categorías,
cuatro productos y strings precisos; AngelAdmin aún no creado (pendiente contraseña).

- npm test: pruebas HTTP/unitarias; integración se omite sin entorno aislado.
- npm run test:integration: requiere TEST_DATABASE_URL local /cafeteria_test y
  usuario de pruebas con CREATEDB; crea y elimina solo una base aleatoria propia
  cafeteria_catalog_*. No limpia ni migra tablas de test o desarrollo.
- Pruebas de integración ejecutadas sobre PostgreSQL 17 temporal: seed repetible,
  filtros, bajas/agotados, cursor con microsegundos, BIGINT, recargos y respuestas
  reales contra OpenAPI. Instancia temporal detenida al terminar.
- Docker: verificar conexiones en equipo Leonel sigue siendo tarea externa;
  no confundir con autorización ya otorgada para la base local de Ángel.
- Avisos npm de Prisma siguen pendientes de actualización compatible; no usar
  audit fix --force ni desplegar sin revisión de dependencias/seguridad.

## Lo siguiente

Revisar catálogo con Enrique usando OpenAPI. Crear AngelAdmin localmente.
Después: autenticación/permisos/CSRF, administración del catálogo, órdenes y
flujo efectivo. No hay CRUD, cobros, worker, Stripe ni registro implementados.
