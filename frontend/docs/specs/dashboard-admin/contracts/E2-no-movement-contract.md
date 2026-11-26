# Contrato E2 aceptado — Activos sin movimiento (lista separada)

- Estado: **CONTRATO DOCUMENTAL E2-08 ACEPTADO el 2026-11-25 por delegación del responsable al coordinador**, con el paquete de decisiones D01–D10 aceptado en la misma fecha. No autoriza runtime, UI, CSV, SQL ejecutable, migraciones, dependencias ni commit; E2-09/10/11 requieren sus propias tareas, verificación y revisión.
- Tarea: `TASK-DA-E2-08`. Ajustes documentales derivados de verificación aplicados el 2026-11-25; la revisión independiente y la integración siguen siendo responsabilidad humana. Este documento registra la aceptación documental, no una implementación.
- Objetivo RF: RF-13 (lista separada de activos sin movimiento), RF-01/03/19 y RNF-02/06, con C-CONTRACT/C-DATA/C-LIMIT de E2.
- Alcance documental: ruta aceptada, entrada estricta, DTO cerrado, universo activo, definición de ausencia, metadatos, paginación/orden, errores, matriz de escenarios y decisiones aceptadas. Sin implementación, pruebas HTTP/BD, CSV ni cambios de esquema.
- Fuentes: [spec](../spec.md) (RF-13, H5, E2), [plan](../plan.md), [tasks](../tasks.md), [contrato E1](./E1-summary-contract.md), [contrato de series](./E2-series-contract.md), [contrato de ranking](./E2-ranking-contract.md), [OpenAPI](../../../../../backend/docs/api/openapi.yaml), [reglas de negocio](../../../../../backend/docs/business-rules.md), [permisos](../../../../../backend/docs/permissions.md), [esquema Prisma](../../../../../backend/prisma/schema.prisma), [paginación](../../../../../backend/src/shared/http/pagination.ts), [módulo sales](../../../../../backend/src/modules/sales/sales.read.repository.ts) y [catálogo administrativo](../../../../../backend/src/modules/catalog/admin.service.ts).

> Este contrato fue **aceptado por delegación del responsable el 2026-11-25** y no implementa runtime ni cierra E2. Describe una capacidad **distinta** del ranking de productos con movimiento y de la lista de «menos vendidos»: no redefine E2-04 ni E2-05, no convierte ceros en ranking y no afirma ausencia global de ventas. La aceptación es documental y no autoriza commit, push ni despliegue; las reservas explícitas (verificación de cabeceras en rechazos globales, medición de coste y CSV al cierre E2) se mantienen para sus tareas propias. E2-09/10/11 solo pueden iniciarse sobre este contrato aceptado.

## Hechos corroborados

| Fuente | Hecho relevante |
| --- | --- |
| `backend/prisma/schema.prisma` (`Product`) | **No tiene `isActive`**. Tiene `deletedAt` e `isAvailable`; `name`, `categoryId` y `createdAt Timestamptz(6)` son los campos relevantes. La baja lógica del catálogo marca `deletedAt` y `isAvailable=false`. |
| `backend/prisma/schema.prisma` (`Category`) | Tiene `isActive` y `deletedAt`. Una categoría puede quedar inactiva sin borrarse; el borrado se impide si conserva productos (BR-CAT-005). |
| `backend/src/modules/catalog/admin.service.ts` | `deleteProduct` marca `deletedAt` e `isAvailable=false`; `availability` cambia solo `isAvailable`; `deleteCategory` exige cero productos y marca `deletedAt`/`isActive=false`. |
| `backend/prisma/schema.prisma` (`Sale`, `Payment`, `OrderItem`) | `Sale` es la venta pagada, una por orden/pago, con `soldAt Timestamptz(6)`. `Payment.method` es `CASH` o `STRIPE`. `OrderItem` conserva `productId`, `quantity` y `lineTotalCents`; una línea pertenece a una orden. |
| `backend/src/modules/sales/sales.read.repository.ts` | Las lecturas E1/E2 filtran `s.sold_at >= from` y `< to`, unen `payments` para el método y agregan sin N+1. El ranking ya usa una CTE y no aplica un filtro defensivo de estado de pago por defecto (D11 de E2-04). |
| `backend/prisma/schema.prisma` (`OrderItem`) | Solo existe índice por `order_id`; **no** hay índice por `product_id`. Este contrato no añade índices ni migraciones. |
| `backend/src/shared/http/pagination.ts` | El cursor actual es base64url opaco con validación estricta y alcance/filtros; esta capacidad propone un cursor propio compatible con el patrón, sin modificar los cursores existentes. |
| `backend/src/shared/http/serialization.ts` | `BigInt` se serializa como cadena; IDs y conteos no deben pasar por `Number`. |
| `backend/docs/api/openapi.yaml` | `/api/v1/admin/dashboard/summary`, `/sales-series` y `/product-ranking` son contratos existentes. La adición de este contrato es aditiva y no altera sus esquemas ni ejemplos. |

Nombres de producto y categoría **no son únicos** y pueden cambiar. La identidad de producto es `productId`; el nombre es presentación. La identidad de categoría es `category.id`; el nombre es presentación actual.

## Ruta aceptada y autorización

```http
GET /api/v1/admin/dashboard/no-movement-products?from=...Z&to=...Z[&method=CASH|STRIPE][&limit=10|20|50][&cursor=...]
```

- **Ruta aceptada**: `/api/v1/admin/dashboard/no-movement-products`, método `GET`, en el paquete documental del 2026-11-25. Su implementación runtime pertenece a E2-09.
- Solo `ADMINISTRADOR` con cookie de acceso vigente. Sin sesión: `401 UNAUTHENTICATED`. Cualquier otro rol, incluido `GERENTE`, `CLIENTE`, `CAJERO` o `PREPARACION`: `403 FORBIDDEN`, sin consultar el agregado.
- Se reutilizan `authenticate`, `authorize('ADMINISTRADOR')` y el middleware privado de respuesta (`Cache-Control: no-store`, `Referrer-Policy: no-referrer`) de las rutas administrativas existentes.
- GET de lectura: sin CSRF nuevo, sin ampliar permisos de `/api/v1/sales`, sin body. Cualquier body no vacío se rechaza.
- No se modifica `/api/v1/sales`, `/api/v1/sales/summary`, `/api/v1/admin/dashboard/summary`, `/sales-series` ni `/product-ranking`.

## Entrada estricta aceptada

| Parámetro | Regla aceptada |
| --- | --- |
| `from` | Obligatorio, escalar único, fecha real UTC terminada en `Z`, inicio inclusivo. Forma `YYYY-MM-DDTHH:mm:ss[.S|.SS|.SSS]Z`; años 2000–9999, sin offsets, sin hora 24 ni fechas imposibles. Mínimo `2000-01-01T08:00:00.000Z`; un `from` anterior devuelve `400 VALIDATION_ERROR` sin truncar. |
| `to` | Obligatorio, escalar único, fecha real UTC `Z`, fin exclusivo, estrictamente mayor que `from`. Mismo formato, dominio y mínimo. `to - from` máximo **366 días absolutos**; excederlo devuelve 400 sin truncar ni devolver parcial. |
| `method` | Opcional, `CASH` o `STRIPE`. Omitido incluye ambos y devuelve `method: null`. Vacío, `null` literal o minúsculas son inválidos. |
| `limit` | Opcional; default **20**. Forma léxica exacta: solo `10`, `20` o `50`. Se rechazan `010`, `+20`, `20.0`, `5`, `100`, decimales, signos, texto y valores vacíos. Es tamaño de página, no top N ni agregado. Es un **string propio de este DTO**: no se debe reutilizar el parser genérico `Page`/`pageQuerySchema` de otros endpoints, cuyo `limit` es entero 1–100. |
| `cursor` | Opcional, opaco, emitido por el servidor. Base64url sin relleno; longitud 1–2048; se rechaza cualquier otro alfabeto o JSON manipulado. Vincula periodo, método, límite, definición del universo y última clave `(name, productId)`. Incompatible o inválido: 400. Requiere decodificador propio (ver abajo); no se reutiliza `decodeCursor`. |
| Extras | Se rechazan `category`, `top`, `metric`, `direction`, `timeZone`, `order`, `sort`, `includeUnavailable`, `includeZeroSales`, `offset`, `page` y cualquier otro parámetro o body. No se ignoran silenciosamente. |
| Repetidos/arrays | Se rechazan parámetros repetidos —aunque tengan el mismo valor—, arrays, objetos, variantes con corchetes y valores vacíos. |

- Intervalo `[from,to)` UTC; zona de presentación fija `America/Tijuana`, sin offset UTC-8 fijo. El frontend futuro convierte límites locales a UTC; el backend no interpreta la entrada en hora local.
- Precisión de entrada: hasta milisegundos (0–3 decimales). Cualquier fracción de 4–6 decimales —incluidas las que terminan en cero— se rechaza. Las entradas se comparan de forma exacta sobre `timestamptz`; las filas de `sold_at` y `Product.createdAt` conservan su precisión PostgreSQL de microsegundos y no se convierten a `Date` para filtrar.
- El rango máximo es un tope de trabajo, no un SLA medido. No se acepta truncar, redondear, ajustar el rango ni devolver resultados parciales.
- `cursor` se normaliza contra los valores efectivos: `from`/`to` como UTC con tres decimales, `method` omitido como `null`, `limit` omitido como `"20"`. Una petición semánticamente igual (`...:00Z` frente a `...:00.000Z`, o `limit` omitido frente a `limit=20`) es compatible con el mismo cursor; una diferencia real de periodo, método, límite o definición produce 400.
- El cursor de entrada y `page.nextCursor` requieren un **codificador/decodificador propio** de esta capacidad, con alcance `dashboard-no-movement`. **No** se reutiliza el `decodeCursor` de `backend/src/shared/http/pagination.ts`, que valida un `scope` cerrado de otros endpoints y una posición `{id, createdAt}`. La forma base64url 1–2048 se declara también en el esquema OpenAPI de `page.nextCursor`.

## DTO cerrado aceptado

La respuesta 200 es un objeto cerrado con envoltura `{ data }`:

| Campo | Regla aceptada |
| --- | --- |
| `generatedAt` | UTC con tres decimales; instante de generación. **No es token de snapshot** entre peticiones ni entre páginas. |
| `currency` | `MXN`. |
| `period` | Objeto cerrado `{from,to,timeZone}`; límites UTC normalizados y zona fija `America/Tijuana`. |
| `method` | `null`, `CASH` o `STRIPE`; eco del filtro efectivo. |
| `universe.asOf` | UTC con tres decimales; **igual a `to`**. Es un **corte de cohorte**: `Product.createdAt < to` sobre el conjunto que cumple el resto del universo. **No** es un snapshot histórico de `deletedAt`, categoría, nombre ni `isAvailable`, que se leen en su estado actual al generar la respuesta. La UI futura debe etiquetarlo como **«corte del universo»**, nunca como «histórico». |
| `universe.definition` | Token cerrado `product-not-deleted+category-active+category-not-deleted+created-before-asOf+availability-ignored+current-catalog-state`. Se define abajo. |
| `universe.includesUnavailable` | Siempre `true`. `Product.isAvailable` no filtra el universo y se devuelve por ítem. |
| `totalNoMovementProducts` | String decimal exacto; total del conjunto **sin movimiento** que cumple universo, rango y método, **antes** de aplicar cursor y paginación. **No** es el total de productos activos del catálogo, ni el tamaño de página, ni el total de productos con movimiento. No se incluye un denominador de todos los productos activos que sí tuvieron movimiento; si se requiere, es un campo/decisión adicional. |
| `page.limit` | String `"10"`, `"20"` o `"50"`; eco del límite efectivo. Es un **string propio de este DTO**; no se debe reutilizar el parser genérico `Page`/`pageQuerySchema` (limit entero 1–100) ni se modifica el esquema `Page` de otros endpoints. |
| `page.nextCursor` | Cursor opaco o `null`. `null` cuando no hay más elementos después de la página. No se inventa un cursor vacío. Cuando es string cumple base64url 1–2048, igual que el cursor de entrada; OpenAPI declara `pattern`/`maxLength` coherentes. |
| `items` | Array de hasta `limit` productos del universo sin movimiento, en el orden determinista del contrato. Cero resultados válidos producen `200` con `[]`. |
| `items[].productId` | String decimal exacto, positivo. Identidad; no se agrupa por nombre. |
| `items[].name` | `Product.name` actual (el universo solo incluye productos no borrados); no es único y puede cambiar. |
| `items[].category` | Objeto cerrado `{id,name}` con la categoría actual, activa y no borrada. `id` string decimal positivo; `name` actual. |
| `items[].isAvailable` | Booleano actual; se presenta como dato, no define actividad ni exclusión. |
| `items[].createdAt` | UTC con **seis decimales** (microsegundos) tomado de `Product.createdAt`; no se trunca a milisegundos. Se usa solo como dato de alta; el orden y el cursor no dependen de él. |

- Todos los IDs y conteos son strings decimales canónicos `^(0|[1-9][0-9]*)$` (los IDs positivos no tienen cero inicial). Sin `Number`, exponentes, fracciones ni límite injustificado de 19 dígitos; el rango técnico de `bigint` de PostgreSQL se valida en runtime.
- No hay precios, importes, unidades vendidas, tickets, porcentajes, nombre de cliente, pago, ticket, personal ni secretos. Los nombres de producto/categoría son de catálogo, no PII.
- No hay campo `position`: el orden del array es la secuencia contractual. El frontend futuro no debe reordenar ni inferir posiciones.

### Ejemplo canónico mínimo (documental, no HTTP ejecutado)

```json
{
  "data": {
    "generatedAt": "2026-11-25T18:30:00.000Z",
    "currency": "MXN",
    "period": {
      "from": "2026-11-24T08:00:00.000Z",
      "to": "2026-11-25T08:00:00.000Z",
      "timeZone": "America/Tijuana"
    },
    "method": null,
    "universe": {
      "asOf": "2026-11-25T08:00:00.000Z",
      "definition": "product-not-deleted+category-active+category-not-deleted+created-before-asOf+availability-ignored+current-catalog-state",
      "includesUnavailable": true
    },
    "totalNoMovementProducts": "2",
    "page": { "limit": "20", "nextCursor": null },
    "items": [
      {
        "productId": "10",
        "name": "Latte",
        "category": { "id": "3", "name": "Cafés" },
        "isAvailable": true,
        "createdAt": "2024-01-15T18:00:00.000000Z"
      },
      {
        "productId": "12",
        "name": "Moka",
        "category": { "id": "3", "name": "Cafés" },
        "isAvailable": false,
        "createdAt": "2026-11-20T17:30:00.123456Z"
      }
    ]
  }
}
```

La disponibilidad `false` de Moka no lo excluye: el producto existe y no tuvo movimiento en el rango/método; se muestra como agotado. `totalNoMovementProducts` es el total del conjunto sin movimiento del filtro, **no** el total de productos activos del catálogo. `universe.asOf` es un corte de cohorte con atributos actuales; la UI debe rotularlo como «corte del universo».

## Universo activo, instante y ausencia de movimiento

### Definición aceptada del universo

Un producto pertenece al universo de esta lista si y solo si, en la lectura actual:

1. `Product.deletedAt IS NULL` (producto no dado de baja).
2. Existe su categoría (`Product.categoryId` válido) y `Category.isActive = true`.
3. `Category.deletedAt IS NULL`.
4. `Product.createdAt < to` (corte de cohorte; ver abajo).

`Product.isAvailable` **no** participa en la definición: un producto agotado sigue existiendo, puede no haber tenido movimiento y debe aparecer con `isAvailable:false`. `Product` no tiene `isActive`; no se inventa ni se usa.

La categoría se evalúa con su estado actual, no con una categoría histórica. No existe snapshot histórico de `Product.deletedAt`, `Category.isActive`, `Category.deletedAt` ni del vínculo producto-categoría. Un producto que hoy está activo pero estuvo inactivo en el periodo aparece si hoy cumple el universo; uno que hoy está dado de baja no aparece aunque existiera en el periodo. Es una limitación explícita y aceptable para esta lista, no una promesa de reconstrucción histórica.

### Instante del universo: `asOf = to` como corte de cohorte

- `universe.asOf` aceptado es **`to`**, el mismo límite exclusivo de `period.to`.
- El cohorte se define con `Product.createdAt < asOf`: un producto creado dentro de `[from,to)` se incluye si no tuvo movimiento; un producto creado exactamente en `to` o después queda fuera, aunque no tenga ventas. Un producto creado antes de `from` se incluye si no tuvo movimiento en el rango.
- `asOf = to` es un **corte de cohorte**, **no** un snapshot histórico. Los atributos mutables (`deletedAt`, categoría, nombre, `isAvailable`) se leen en su estado **actual** al generar la respuesta y no se reconstruyen al instante `to`. El token `current-catalog-state` de `universe.definition` y esta sección lo hacen explícito.
- La UI futura debe etiquetar `universe.asOf` como **«corte del universo»** (fecha de corte de la cohorte, con atributos actuales), **no** como «histórico», «snapshot» ni «estado a esa fecha». Un rótulo histórico induciría a error sobre `deletedAt`, categoría, nombre e `isAvailable`.
- Si `to` es futuro, no existen productos creados después de `generatedAt`; el cohorte queda limitado por los datos realmente existentes. `generatedAt` no es un token de snapshot.
- Comparación exacta: `Product.createdAt` es `Timestamptz(6)`; un alta en `to − 1 µs` cumple `< to` y se incluye. No se convierte la fila a `Date` ni se trunca a milisegundos para decidir la inclusión. La representación de salida `createdAt` conserva seis decimales.

### Ausencia de movimiento en el rango/método

Un producto del universo se devuelve si **no existe ninguna línea de `OrderItem`** perteneciente a una `Sale` pagada con `Sale.soldAt` en `[from,to)` y, si se envió `method`, con `Payment.method` igual al filtro.

- `Sale` es la fuente de venta pagada; `OrderItem` aporta el `productId`. La línea puede tener cualquier cantidad, importe, opciones o reembolso: su **existencia** ya es movimiento.
- `OrderItemOption` no se une para decidir movimiento ni para sumar; las opciones ya están contenidas en la línea.
- Un reembolso (`Refund`) no borra la venta ni su línea: una venta reembolsada dentro del rango/método **sí** cuenta como movimiento y el producto se excluye de la lista. No se resta el reembolso.
- Órdenes sin `Sale` (pendientes, fallidas o expiradas), intentos de pago, `PaymentEvent`, `PaymentIncident` y líneas de esas órdenes **no** cuentan como movimiento.
- Una venta fuera de `[from,to)` no cuenta, aunque sea del mismo producto. Una venta dentro del rango con otro método no cuenta cuando se filtró un método. Por tanto, la lista significa **«sin movimiento en este rango y método»**, nunca «sin ventas globales» ni «producto nunca vendido».
- Si `method` se omite, cualquier `CASH` o `STRIPE` dentro del rango cuenta como movimiento.
- Igual que en E2-04 (D11), este contrato **no aplica por defecto** un filtro defensivo `p.status = 'SUCCEEDED'`: `Sale` implica pago exitoso. Una fila inconsistente `Sale` sin pago `SUCCEEDED` contaría como movimiento con el default. Adoptar un filtro defensivo requeriría una decisión propia y el mismo predicado en el resumen/`/api/v1/sales/summary`; no se cambia aquí.
- No se infiere el conjunto desde páginas de `/api/v1/sales`, desde el ranking ni desde la UI. El backend consulta el conjunto completo.

### Altas, disponibilidad, categoría y bajas

| Situación | Resultado aceptado |
| --- | --- |
| Producto no borrado, categoría activa, `createdAt < to`, sin línea de venta en rango/método | Se incluye. |
| Producto con `isAvailable=false` (agotado) pero no borrado y sin movimiento | Se incluye con `isAvailable:false`. |
| Producto con `isAvailable=true` y sin movimiento | Se incluye con `isAvailable:true`. |
| Producto creado dentro de `[from,to)` y sin movimiento | Se incluye; `createdAt` lo evidencia. |
| Producto creado exactamente en `to` o después | Se excluye por cohorte, aunque no tenga movimiento. |
| Producto creado en `to − 1 µs` | Se incluye si cumple el resto. |
| Producto con `deletedAt` no nulo (baja lógica) | Se excluye, aunque no tenga movimiento. El ranking de productos con movimiento es otra capacidad. |
| Producto en categoría `isActive=false` | Se excluye. |
| Producto en categoría `deletedAt` no nulo | Se excluye de forma defensiva; la baja de categoría con productos está impedida por BR-CAT-005. |
| Categoría o producto renombrado | Se devuelve el nombre actual; no hay snapshot histórico en esta lista. |
| Venta del producto solo antes de `from`, solo en `to` o después, o solo con otro método | No es movimiento dentro del filtro: el producto puede incluirse. |
| Venta del producto en rango/método, con o sin reembolso | Es movimiento: el producto se excluye. |
| Línea en una orden sin `Sale` pagada | No es movimiento: el producto puede incluirse. |

## Paginación, orden y cursor

### Orden determinista

1. `Product.name` ascendente con comparación byte a byte UTF-8 `COLLATE "C"`, sensible a mayúsculas y sin depender de la configuración regional.
2. `Product.id` numérico ascendente como desempate final, usando el valor entero exacto, no la comparación lexicográfica de strings.

La combinación es total para el conjunto devuelto. Dos ejecuciones sobre el mismo conjunto, catálogo y filtros producen el mismo orden. Nombres iguales de productos distintos se separan por `productId`. El frontend futuro **no reordena** ni reagrupa; presenta el orden recibido.

### Cursor opaco

- El cursor codifica, como mínimo, la última clave devuelta `(name, productId)`, el alcance `dashboard-no-movement`, la versión del cursor, la definición del universo, el periodo normalizado, el método efectivo y el límite efectivo.
- Se representa como JSON estricto codificado en base64url sin relleno; longitud máxima 2048. El cliente no lo interpreta ni lo construye. El mismo formato base64url 1–2048 se declara en `page.nextCursor` de OpenAPI, incluido `pattern` y `maxLength`.
- El emisor y el decodificador son **propios de esta capacidad** (alcance `dashboard-no-movement`). **No** se reutiliza `decodeCursor` de `pagination.ts`: ese helper valida los `scope` de filtros existentes (`sales`, `products`, etc.) y una posición `{id, createdAt}`, incompatibles con la clave `(name, productId)` y los metadatos de este DTO.
- Se valida la forma, la versión, el alcance, la definición, el periodo, el método, el límite, el nombre (string, longitud de columna) y el `productId` (entero positivo dentro del rango de `bigint`). Cursor manipulado, de otro endpoint, de otros filtros u otro límite: `400 VALIDATION_ERROR`, sin consultar.
- La siguiente página usa la comparación de clave `(name COLLATE "C", productId) > (último name, último productId)` en el mismo orden. No se usa `OFFSET`.
- Se solicita `limit + 1` filas para saber si existe una siguiente página. Si hay más, `page.nextCursor` es el cursor de la última fila devuelta; si no, `null`. No se trunca el conjunto ni se rellena con productos ficticios.
- Si el cursor apunta a una clave que ya no existe por un renombrado o baja entre páginas, no se produce un error por ese hecho: la comparación de clave continúa. Esto puede omitir o duplicar elementos si el catálogo cambia entre páginas; ver limitación de consistencia.

### Ejemplo de más de una página (documental)

Dataset documental: 11 productos del universo sin movimiento, nombres `Activo 01` … `Activo 11`, IDs `1` … `11`, todos en la categoría `7`/`Bebidas`, periodo `[2026-11-24T08:00:00.000Z, 2026-11-25T08:00:00.000Z)`, `method=null`, `limit=10`.

Página 1 (sin cursor): `totalNoMovementProducts:"11"`, 10 ítems en orden `Activo 01`…`Activo 10`, `nextCursor` no nulo. El token siguiente es el cursor documental del último elemento (`Activo 10`, id `10`) y los filtros indicados:

```text
eyJ2IjoxLCJzY29wZSI6ImRhc2hib2FyZC1uby1tb3ZlbWVudCIsImRlZmluaXRpb24iOiJwcm9kdWN0LW5vdC1kZWxldGVkK2NhdGVnb3J5LWFjdGl2ZStjYXRlZ29yeS1ub3QtZGVsZXRlZCtjcmVhdGVkLWJlZm9yZS1hc09mK2F2YWlsYWJpbGl0eS1pZ25vcmVkK2N1cnJlbnQtY2F0YWxvZy1zdGF0ZSIsImZyb20iOiIyMDI2LTExLTI0VDA4OjAwOjAwLjAwMFoiLCJ0byI6IjIwMjYtMTEtMjVUMDg6MDA6MDAuMDAwWiIsIm1ldGhvZCI6bnVsbCwibGltaXQiOiIxMCIsIm5hbWUiOiJBY3Rpdm8gMTAiLCJwcm9kdWN0SWQiOiIxMCJ9
```

Página 2 (mismo periodo/método/límite y `cursor` anterior): `totalNoMovementProducts` sigue siendo `"11"`, un solo ítem y `nextCursor:null`.

```json
{
  "data": {
    "generatedAt": "2026-11-25T18:30:00.000Z",
    "currency": "MXN",
    "period": {
      "from": "2026-11-24T08:00:00.000Z",
      "to": "2026-11-25T08:00:00.000Z",
      "timeZone": "America/Tijuana"
    },
    "method": null,
    "universe": {
      "asOf": "2026-11-25T08:00:00.000Z",
      "definition": "product-not-deleted+category-active+category-not-deleted+created-before-asOf+availability-ignored+current-catalog-state",
      "includesUnavailable": true
    },
    "totalNoMovementProducts": "11",
    "page": { "limit": "10", "nextCursor": null },
    "items": [
      {
        "productId": "11",
        "name": "Activo 11",
        "category": { "id": "7", "name": "Bebidas" },
        "isAvailable": true,
        "createdAt": "2026-11-24T12:00:00.000001Z"
      }
    ]
  }
}
```

La página 2 no reenumera ni recalcula el total; el cursor no es un token de snapshot. `Activo 11` fue creado dentro del rango y no tuvo movimiento, por lo que se incluye.

### Cero productos del universo sin movimiento

```json
{
  "data": {
    "generatedAt": "2026-11-25T18:30:00.000Z",
    "currency": "MXN",
    "period": {
      "from": "2026-11-24T08:00:00.000Z",
      "to": "2026-11-25T08:00:00.000Z",
      "timeZone": "America/Tijuana"
    },
    "method": "CASH",
    "universe": {
      "asOf": "2026-11-25T08:00:00.000Z",
      "definition": "product-not-deleted+category-active+category-not-deleted+created-before-asOf+availability-ignored+current-catalog-state",
      "includesUnavailable": true
    },
    "totalNoMovementProducts": "0",
    "page": { "limit": "20", "nextCursor": null },
    "items": []
  }
}
```

Estado `200`; no 404, no productos ficticios, no ceros de relleno.

### Escenarios de inclusión/exclusión (documentales)

| Caso | Estado del producto/categoría | Ventas en el filtro | Resultado |
| --- | --- | --- | --- |
| C01 | Activo, disponible, alta antes de `from` | Ninguna | Incluido. |
| C02 | Activo, agotado (`isAvailable=false`), alta dentro del rango | Ninguna | Incluido con `isAvailable:false`. |
| C03 | Activo, alta exactamente en `to` | Ninguna | Excluido por `createdAt < to`. |
| C04 | Activo, alta en `to − 1 µs` | Ninguna | Incluido. |
| C05 | Activo, alta después de `to` | Ninguna | Excluido por cohorte. |
| C06 | `deletedAt` no nulo | Ninguna | Excluido. |
| C07 | Categoría `isActive=false` | Ninguna | Excluido. |
| C08 | Categoría `deletedAt` no nulo | Ninguna | Excluido (defensivo). |
| C09 | Activo, categoría activa | Venta `CASH` en rango, `method` omitido | Excluido: hay movimiento. |
| C10 | Activo, categoría activa | Venta `CASH` en rango, `method=STRIPE` | Incluido: otro método no cuenta. |
| C11 | Activo, categoría activa | Venta solo antes de `from` o solo en `to` | Incluido: fuera de rango no cuenta. |
| C12 | Activo, categoría activa | Línea en orden sin `Sale` pagada | Incluido: no es venta. |
| C13 | Activo, categoría activa | Venta reembolsada en rango/método | Excluido: el reembolso no borra el movimiento. |
| C14 | Activo, categoría activa | Línea en venta en rango/método con `quantity=0` | Excluido: la existencia de la línea es movimiento. |
| C15 | Activo, categoría renombrada | Ninguna | Incluido; `category.name` actual. |
| C16 | Activo, categoría activa | `Sale` en rango sin pago `SUCCEEDED` (fila inconsistente) | Excluido con el default sin filtro defensivo; D11 de E2-04 se reutiliza. |

### Bordes temporales, entrada, cursor y roles (documentales)

| Vector | Condición | Resultado exigido |
| --- | --- | --- |
| T01 | `from=2000-01-01T08:00:00.000Z` | Aceptado (mínimo exacto); el resto del rango debe seguir siendo válido. |
| T02 | `from=2000-01-01T07:59:59.999Z` | `400 VALIDATION_ERROR` sin truncar a 2000. |
| T03 | `from=to`, o `from>to` | `400 VALIDATION_ERROR`; no se consulta. |
| T04 | `to-from=366 días` exactos | Aceptado. |
| T05 | `to-from=366 días + 1 ms` | `400 VALIDATION_ERROR`; sin resultados parciales. |
| T06 | `from`/`to` con 3 decimales; con 4 o 6 decimales (incluidos ceros) | 3 aceptado; 4–6 rechazado con 400. |
| T07 | Venta en `from`; venta en `to−1 µs`; venta en `to` | Las dos primeras cuentan como movimiento; la de `to` no. |
| T08 | Alta de producto en `to−1 µs`; alta en `to` | La primera cumple `createdAt < to`; la segunda queda excluida. |
| T09 | `limit` omitido, `10`, `20`, `50`; `010`, `+20`, `20.0`, `5`, `100`, vacío | Default/validos aceptados; el resto 400 sin consulta. |
| T10 | `category`, `top`, `metric`, `offset`, `page` u otro extra; repetidos; arrays; body no vacío | `400 VALIDATION_ERROR`; no se ignoran silenciosamente. |
| E01 | Cursor con base64url inválido, JSON manipulado, campo extra, nombre/ID inválido | `400 VALIDATION_ERROR` sin consultar. |
| E02 | Cursor de otro endpoint o con `from`/`to`/`method`/`limit`/definición distintos | `400 VALIDATION_ERROR`; no se mezclan páginas. |
| E03 | Cursor válido con los mismos filtros efectivos | `200` con la página siguiente; el total sigue siendo el del conjunto completo. |
| S01 | Sin sesión vigente | `401 UNAUTHENTICATED`. |
| S02 | `ADMINISTRADOR` con sesión vigente | `200`; cabeceras privadas dentro del middleware de ruta. |
| S03 | `CLIENTE`, `CAJERO`, `PREPARACION` o `GERENTE` | `403 FORBIDDEN`, sin consultar el agregado. |
| S04 | `PIN_CHANGE_REQUIRED` u `ORIGIN_NOT_ALLOWED` | `403` con el código existente correspondiente. |
| S05 | 413, 429, 500 inesperado, 503 de dependencia reconocida | Problem Details saneados; sin ceros/fallback; cabeceras privadas según la evidencia de E2-09 con fallos inyectados en integración (413/429/500/503), sin declarar caos live ejecutado. |

## Semántica C-DATA y coste

1. **Conjunto completo:** se parte del universo de productos activos y se aplica el antijoin de movimiento sobre todas las ventas pagadas del rango/método. No se calcula desde una página de `/api/v1/sales`, desde el ranking, desde `limit`/`cursor` ni con una consulta por producto.
2. **Antijoin / `NOT EXISTS`:** la ausencia se implementa preferentemente con `NOT EXISTS` o un antijoin equivalente entre el universo y las líneas de ventas filtradas. No se usa un `LEFT JOIN` que pueda multiplicar filas; si se usara, se exigiría `DISTINCT` por `product_id` y prueba de no duplicación.
3. **Sin multiplicadores:** no se unen `OrderItemOption`, `Refund`, `PaymentEvent`, `PaymentIncident` ni reintentos. `payments` se une únicamente para obtener el método de la `Sale` (relación uno a uno por `Sale.paymentId`). Cada línea contribuye una vez.
4. **Método:** se obtiene de `Payment.method` mediante `Sale.paymentId`; no se infiere del nombre del producto, de la orden ni de la UI.
5. **Bruto:** una venta reembolsada sigue siendo movimiento; no se resta `Refund` para decidir ausencia.
6. **Sin N+1:** la página, el total y la ausencia se resuelven en una sola lectura/consulta coherente o en una transacción de solo lectura con el mismo snapshot lógico. No se hace una consulta por producto para comprobar movimiento ni para resolver categoría.
7. **Total antes de paginar:** `totalNoMovementProducts` se cuenta sobre el conjunto completo que cumple universo + ausencia + rango/método, antes de aplicar el cursor y el límite. No es el tamaño de `items`, ni el total de productos activos del catálogo, ni el total de productos con movimiento.
8. **Consistencia:** con catálogo y ventas estables, recorrer todas las páginas con el mismo periodo/método/definición devuelve cada producto exactamente una vez y la unión tiene `totalNoMovementProducts` elementos. `generatedAt` no fija un snapshot compartido entre peticiones.
9. **Coste:** no hay índice por `order_items.product_id`; el antijoin puede implicar lecturas costosas con volumen alto. No se añaden índices ni migraciones en esta tarea. E2-09 debe medir con volumen autorizado y documentar el plan; no se promete latencia ni SLA.
10. **Sin CSV:** este contrato no define columnas, metadatos ni exportación CSV. La exportación de esta lista, si se incluye al cierre E2, se rige por el contrato CSV específico de E2; no se infiere de la UI ni de este DTO.

### Pseudocódigo no ejecutable del antijoin

El siguiente esquema es semántica documental, no SQL ejecutable ni migración:

```text
universo = productos p
           con p.deleted_at IS NULL
           y p.created_at < to
           y categoría c con c.is_active = true y c.deleted_at IS NULL
sin_movimiento = universo
                 donde NO EXISTE (
                   línea oi de una Sale s
                   con s.sold_at >= from y s.sold_at < to
                   y oi.order_id = s.order_id
                   y oi.product_id = p.id
                   [y Payment(s.payment_id).method = method]
                 )
total = contar(sin_movimiento)
página = sin_movimiento
         después de la clave del cursor
         ordenar por name COLLATE "C" asc, product_id asc
         límite limit + 1
```

La implementación concreta, los índices existentes y la medición pertenecen a E2-09; aquí no se ejecuta ni se optimiza.

## Metadatos, límites y consistencia

- `totalNoMovementProducts` se calcula sobre el conjunto completo sin movimiento, antes de la paginación. No es el número de ítems de la página ni el total de productos activos del catálogo; puede ser mayor que la página.
- `page.limit` es el límite efectivo, no un agregado. Se devuelve como string propio de este DTO; **no** se debe reutilizar el parser genérico `Page`/`pageQuerySchema`, cuyo `limit` es entero 1–100, y no se cambia el esquema `Page` de otros endpoints.
- `page.nextCursor` es `null` solo cuando no hay más elementos. No se emite un cursor cuando la página está vacía por no haber resultados. Cuando es string, su forma base64url 1–2048 se declara con `pattern`/`maxLength` en OpenAPI.
- `generatedAt` es el instante de generación y no un token de snapshot. `period` refleja los límites efectivos normalizados.
- `universe.asOf` es `to` y expresa el **corte de cohorte** `Product.createdAt < to`; `universe.definition` y `includesUnavailable` describen la regla. La lectura de atributos mutables (`deletedAt`, categoría, nombre, `isAvailable`) es **actual**, no histórica. La UI debe rotularlo como «corte del universo».
- **Limitación de paginación con catálogo mutable:** el orden usa el nombre actual y el universo se evalúa con el estado actual de producto y categoría. Si un producto se renombra, se da de baja, cambia de categoría, o su categoría se desactiva (`Category.isActive=false`) o se da de baja entre páginas, las claves de cursor pueden dejar de corresponder al mismo conjunto: un producto puede omitirse o repetirse y `totalNoMovementProducts` puede cambiar entre páginas. La desactivación de categoría es un cambio del universo actual, no un evento histórico; no hay snapshot de catálogo ni de ventas entre páginas. El cliente debe tratar cada página como una lectura actual y no como una lista inmutable; si necesita una vista congelada, requiere una tarea/contrato propio.
- En un catálogo y ventas estables, con filtros idénticos, el orden y el cursor son repetibles; el total y la unión de páginas concilian.
- Límite de rango: 366 días absolutos. Límite de página: 10/20/50, default 20. No hay top N, offset ni truncado del universo.
- No se promete que una venta nueva durante la paginación aparezca o desaparezca de forma consistente; `generatedAt` no es un token compartido.

## Seguridad, errores y privacidad

- Solo `ADMINISTRADOR`; `authenticate` + `authorize('ADMINISTRADOR')` existentes. `GERENTE` no hereda esta lectura analítica: recibe `403`.
- Must-change-PIN y Origin conservan sus códigos actuales (`PIN_CHANGE_REQUIRED`, `ORIGIN_NOT_ALLOWED`) dentro de `403`.
- `Cache-Control: no-store` y `Referrer-Policy: no-referrer` dentro del middleware privado de ruta, en éxito y en errores que lo atraviesen. Los rechazos globales previos (Origin/parsing, 413, 429) se documentan aquí según la evidencia de implementación de E2-09: la integración con fallos inyectados (`dashboard-no-movement.integration.test.ts`, caso que sanea 413/429/500/503) asserta ambas cabeceras, y Origin directo al backend se verificó en live (403 con cabeceras). Esa evidencia es **integración con fallos inyectados y una comprobación live de Origin**, no caos live contra 413/429/500/503 ni prueba de proveedor externo. No se cambia el orden de middleware en esta tarea.
- Errores `application/problem+json` con `type,title,status,detail,instance,code,requestId` y `errors` de validación cuando corresponda; sin stack, SQL, secretos ni PII.
- Códigos aceptados: `400 VALIDATION_ERROR` (entrada/rango/cursor/body), `401 UNAUTHENTICATED`, `403 FORBIDDEN` (roles) / `PIN_CHANGE_REQUIRED` / `ORIGIN_NOT_ALLOWED`, `413 PAYLOAD_TOO_LARGE` global, `429 RATE_LIMITED`, `500 INTERNAL_ERROR` y `503 DEPENDENCY_UNAVAILABLE` solo para fallos reconocidos por `problemHandler`. No se promete 503 para todo fallo ni éxito con ceros inventados.
- No se devuelven datos de cliente, pago, ticket, personal ni secretos. Los nombres de producto/categoría son de catálogo.
- Sin CSRF nuevo para este GET; se conservan sesión/cookies/Origin existentes. El frontend futuro reutilizará cliente HTTP y sesión única; 401 delega en el gestor común y 429 se informa sin bucle. Un fallo de esta lista no debe borrar otros paneles ni sustituirse por ceros.

## Matriz de escenarios aceptada (R01–R20)

Todos los resultados son **exigencias del contrato aceptado**, no pruebas ejecutadas. La evidencia futura se reparte entre E2-09 (backend HTTP/BD), E2-10 (frontend/MSW) y E2-11 (aceptación real). Esta tarea documental no acredita ninguna prueba.

| ID | RF/criterio | Escenario | Resultado exigido | Evidencia futura |
| --- | --- | --- | --- | --- |
| R01 | RF-13 | Producto no borrado, categoría activa y no borrada, `createdAt < to`, sin línea de venta en rango/método | Aparece en `items`, con `productId`, nombre y categoría actuales; `isAvailable` no filtra | E2-09, E2-10, E2-11 |
| R02 | RF-13 | Producto con `deletedAt` no nulo y sin movimiento | No aparece; no se usa `Product.isActive` | E2-09, E2-11 |
| R03 | RF-13 | Producto en categoría `isActive=false` o `deletedAt` no nulo | No aparece; el filtro es de categoría actual, no histórica | E2-09, E2-11 |
| R04 | RF-13 | Producto agotado (`isAvailable=false`) sin movimiento; producto disponible sin movimiento | Ambos aparecen; `isAvailable` se devuelve como dato; `includesUnavailable:true` | E2-09, E2-10 |
| R05 | RF-13 | Alta dentro de `[from,to)`, alta antes de `from`, alta exactamente en `to`, alta después de `to`, alta en `to−1 µs` | Dentro/antes/`to−1µs` pueden aparecer; exactamente en `to` y después se excluyen por cohorte | E2-09, E2-11 |
| R06 | RF-03/13 | Venta en rango/método del producto; método omitido | El producto se excluye: hay movimiento en el filtro | E2-09, E2-11 |
| R07 | RF-03/13 | Venta en rango `CASH` con `method=CASH`; misma venta con `method=STRIPE` | Excluido con CASH; incluido con STRIPE: otro método no cuenta | E2-09, E2-11 |
| R08 | RF-03/13 | Venta en rango `STRIPE` con `method=CASH`; método omitido | Incluido con CASH; excluido sin método | E2-09, E2-11 |
| R09 | RF-13 | Venta solo antes de `from`, solo en `to` o después; venta no pagada | No cuenta como movimiento; no se afirma ausencia global | E2-09, E2-11 |
| R10 | RF-13 | Línea de `OrderItem` en orden sin `Sale` (pendiente/fallida/expirada); intentos/eventos | No cuenta; el producto puede aparecer | E2-09 |
| R11 | RF-13 | Venta en rango/método con reembolso total o parcial | Cuenta como movimiento; el producto se excluye; no se resta el reembolso | E2-09, E2-11 |
| R12 | RF-13 | Línea en venta en rango/método con cantidad 0, precio 0 u opciones | Cuenta por existencia de línea; no se une `OrderItemOption` ni se multiplica | E2-09 |
| R13 | RF-13 | Universo sin movimiento mayor que `limit`; varias páginas; último `nextCursor:null` | Se devuelven todas las páginas sin duplicar ni omitir con catálogo y ventas estables; no se trunca a top N | E2-09, E2-10, E2-11 |
| R14 | RF-13 | `totalNoMovementProducts` con más elementos que la página, con método/rango aplicados | Total completo antes de paginar; string exacto; no es tamaño de página ni total de activos del catálogo | E2-09, E2-10 |
| R15 | RF-13/RNF-02 | Nombres iguales, mayúsculas/acentos, orden por nombre y desempate por ID | Orden `name COLLATE "C" ASC, productId ASC`; duplicados de nombre separados; frontend no reordena | E2-09, E2-10, E2-11 |
| R16 | RF-19 | Cursor malformado, manipulado, de otro endpoint, con otros filtros/límite o nombre/ID inválido | `400 VALIDATION_ERROR` sin consultar; cursor válido compatible devuelve página | E2-09, E2-10 |
| R17 | RF-03/19 | Bordes temporales: mínimo 2000, `from=to`, 366 días, 366 días +1 ms, 0–3 decimales, 4–6 decimales; venta en `from`, `to−1 µs`, `to`; alta en `to−1 µs`, `to` | Incluye `from`/`to−1µs`; excluye `to`; 400 fuera de dominio/rango/precisión; microsegundos intactos | E2-09, E2-11 |
| R18 | RF-13 | Tres casos distintos: (a) conjunto sin movimiento vacío; (b) método sin ventas; (c) página tras la última clave del cursor | (a) `200`, `items:[]`, `totalNoMovementProducts:"0"`, `nextCursor:null`; (b) `200` con el **universo elegible completo** (puede ser no vacío), el método no vacía la lista; (c) `200`, `items:[]`, `nextCursor:null` **conservando** el total anterior al cursor. No 404 ni ceros ficticios. Aclaración editorial del 2026-11-25 que no cambia DTO, consulta ni decisiones D04/D07 | E2-09, E2-10, E2-11 |
| R19 | RF-01/19 | Sin sesión; ADMINISTRADOR; CLIENTE/CAJERO/PREPARACION/GERENTE; PIN/Origin; cabeceras; body/query extra | 401/200/403; denegados sin agregado; `no-store`/`no-referrer` en el alcance del middleware; sin CSRF nuevo; body no vacío 400 | E2-09, E2-11 |
| R20 | RF-19/RNF-06 | 413/429/500/503; respuesta internamente coherente; volumen, antijoin, sin N+1; fallo en frontend | Problem Details saneados; sin ceros/fallback; una lectura coherente; coste medido sin índices implícitos; el frontend conserva paneles y sesión única | E2-09, E2-10, E2-11 |

## Decisiones aceptadas — 2026-11-25

D01–D10 fueron **aceptadas por delegación del responsable al coordinador el 2026-11-25**, con las recomendaciones de este contrato. La aceptación es documental: no implementa runtime ni autoriza tareas posteriores o commit; las reservas explícitas (verificación de cabeceras y coste en E2-09, CSV en el cierre E2) se mantienen en sus tareas propias.

### Ruta, universo y ausencia

| ID | Decisión | Contenido aceptado | Estado |
| --- | --- | --- | --- |
| D01 | Ruta y rol | `GET /api/v1/admin/dashboard/no-movement-products`, solo ADMINISTRADOR; GET sin CSRF nuevo ni body | Aceptada por delegación el 2026-11-25 |
| D02 | Definición de «activo» | `Product.deletedAt IS NULL` + categoría existente con `isActive=true` y `deletedAt IS NULL`; `Product.isAvailable` no filtra y se devuelve; no se usa `Product.isActive` | Aceptada por delegación el 2026-11-25 |
| D03 | Instante y altas | `universe.asOf = to` como **corte de cohorte** `Product.createdAt < to`; altas dentro del rango incluidas; exactamente en `to` o después excluidas; `deletedAt`/categoría/nombre/`isAvailable` en estado **actual**, sin snapshot histórico; la UI lo rotula «corte del universo», no «histórico» | Aceptada por delegación el 2026-11-25 |
| D04 | Ausencia y método | Sin línea de `OrderItem` de `Sale` pagada en `[from,to)` con el método filtrado; fuera de rango/otro método no cuenta; no es ausencia global; reembolsos no borran movimiento; órdenes sin `Sale` no cuentan; sin filtro defensivo de pago por defecto (D11 E2-04) | Aceptada por delegación el 2026-11-25 |

### Entrada, paginación y DTO

| ID | Decisión | Contenido aceptado | Estado |
| --- | --- | --- | --- |
| D05 | Entrada temporal y rango | `from` inclusivo/`to` exclusivo, UTC `Z`, 0–3 decimales, mínimo `2000-01-01T08:00:00.000Z`, máximo 366 días absolutos; 400 sin truncar | Aceptada por delegación el 2026-11-25 |
| D06 | Paginación, orden y cursor | `limit` 10/20/50 default 20; orden `name COLLATE "C" ASC, productId ASC`; cursor opaco base64url 1–2048 con codificador/decodificador propio que vincula definición/periodo/método/límite/última clave; `nextCursor:null` al final; sin top N ni offset; sin snapshot entre páginas | Aceptada por delegación el 2026-11-25 |
| D07 | DTO y metadatos | DTO cerrado con `generatedAt`, `currency`, `period`, `method`, `universe`, `totalNoMovementProducts`, `page`, `items`; conteos/IDs strings exactos; `totalNoMovementProducts` es el total del conjunto sin movimiento antes de paginar, **no** el total de productos activos del catálogo; `page.limit` es string propio del DTO y no usa el parser genérico `Page` (limit entero) | Aceptada por delegación el 2026-11-25 |
| D08 | Presentación actual | `name`, `category.name`, `category.id`, `isAvailable` y `createdAt` actuales; sin snapshots históricos; `createdAt` con seis decimales; el frontend no reordena y rotula `asOf` como corte del universo | Aceptada por delegación el 2026-11-25 |

### Seguridad, datos y coste

| ID | Decisión | Contenido aceptado | Estado |
| --- | --- | --- | --- |
| D09 | Seguridad y errores | Solo ADMINISTRADOR; 401/403 (incluido GERENTE); no-store/no-referrer en middleware privado; 400/413/429/500/503 Problem Details saneados; sin CSRF nuevo. Reserva resuelta documentalmente el 2026-11-25: cabeceras en rechazos globales acreditadas por integración de E2-09 con fallos inyectados y Origin live directo, sin caos live de 413/429/500/503 | Aceptada por delegación el 2026-11-25 (reserva conciliada) |
| D10 | C-DATA y coste | Antijoin/`NOT EXISTS` sobre ventas pagadas; sin unir opciones/refunds/intentos; sin N+1 ni inferencia desde páginas; una lectura coherente. Reserva explícita: coste a medir en E2-09 y sin índices, migraciones ni CSV en esta tarea | Aceptada por delegación el 2026-11-25 (con reserva de medición/CSV) |

## OpenAPI y estado de contrato

- Se añade de forma aditiva la ruta `/api/v1/admin/dashboard/no-movement-products` y los esquemas `DashboardNoMovement*`/`DashboardNoMovementResponse` en [OpenAPI](../../../../../backend/docs/api/openapi.yaml).
- El path usa `x-contract-status: approved-2026-11-25`. La `description` indica que el contrato fue aceptado por delegación el 2026-11-25 y que no implementa runtime.
- El esquema usa `totalNoMovementProducts` (string decimal exacto) y declara `page.nextCursor` con `pattern`/`maxLength` base64url 1–2048, coherente con el cursor de entrada. `page.limit` documenta que es un string propio de este DTO y no el parser genérico `Page`.
- El ejemplo 200 de OpenAPI es un ejemplo documental válido para el esquema, no una respuesta HTTP ejecutada ni un dataset real.
- No se modifican `/api/v1/admin/dashboard/summary`, `/api/v1/admin/dashboard/sales-series`, `/api/v1/admin/dashboard/product-ranking`, `/api/v1/sales`, `/api/v1/sales/summary` ni sus esquemas aceptados.

## Verificación documental de esta tarea

Previsto y ejecutado solo como validación documental, sin runtime, integración ni pruebas de API real:

- Desde `backend/`: `npm.cmd run format:check`, `npm.cmd run api:validate` y `npx.cmd --no-install prettier --check docs/api/openapi.yaml`.
- Desde `backend/`: `node scripts/check-doc-links.mjs` revisa enlaces del backend; los enlaces de `frontend/docs` se revisan a mano.
- Desde raíz: `git diff --check` y `git status --short`.
- No se atribuyen pruebas HTTP/BD, benchmarks ni implementación runtime a esta tarea. La aceptación por delegación es documental. Los resultados reales de los comandos se reportan en la entrega; no se registran aceptaciones ficticias en `validation.md` ni se edita ese archivo.

## Fuentes y enlaces revisados

- [Spec DA-001](../spec.md) — RF-13, H5, criterios comunes E2 y limitaciones de activos/ceros.
- [Plan DA-001](../plan.md) — contrato, backend y frontend por capacidad; límites e índices requieren aprobación.
- [Backlog DA-001](../tasks.md) — TASK-DA-E2-08 y secuencia E2-09/10/11.
- [Contrato E1](./E1-summary-contract.md) — semántica bruta, método y conciliación.
- [Contrato de series](./E2-series-contract.md) — precisión de entrada, cabeceras y límites de middleware.
- [Contrato de ranking](./E2-ranking-contract.md) — D11 sin filtro defensivo, nociones de movimiento y distinción con ranking de ceros.
- [OpenAPI](../../../../../backend/docs/api/openapi.yaml) — contratos existentes y adición documental aceptada.
- [Reglas de negocio](../../../../../backend/docs/business-rules.md) — catálogo, bajas lógicas, snapshots y categorías.
- [Permisos](../../../../../backend/docs/permissions.md) — solo ADMINISTRADOR para dashboard administrativo; GERENTE no hereda esta lectura.
- [Esquema Prisma](../../../../../backend/prisma/schema.prisma) — `Product`, `Category`, `Sale`, `Payment`, `OrderItem` y `Refund`.
- [Catálogo administrativo](../../../../../backend/src/modules/catalog/admin.service.ts) — baja lógica de producto y categoría.
- [Repositorio de ventas](../../../../../backend/src/modules/sales/sales.read.repository.ts) — patrones de lectura agregada y método.
- [Paginación](../../../../../backend/src/shared/http/pagination.ts) — cursor opaco y validación existente; `decodeCursor` no se reutiliza en esta capacidad.

**Contrato documental aceptado el 2026-11-25 por delegación del responsable al coordinador; sin runtime, UI, CSV, migraciones ni commit. E2-09/10/11 y el CSV de cierre E2 siguen pendientes de sus propias tareas.**
