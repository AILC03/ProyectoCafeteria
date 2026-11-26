# Contrato E2 propuesto — Exportaciones CSV de ventas y analítica

- Estado: **PROPUESTA DOCUMENTAL, NO ACEPTADA**. Redactada para `TASK-DA-E2-CSV-00` el 2026-11-25. No autoriza runtime, rutas implementadas, UI, SQL ejecutable, migraciones, dependencias, CSV real, commits ni el cierre E2. `CSV-01`/`CSV-02` permanecen bloqueadas hasta aceptación explícita del responsable; `CSV-03` sigue siendo el único cierre de E2.
- Autor de la propuesta: `dashboard-backend-implementer`. Verificación y revisión independientes quedan **pendientes de asignación/ejecución**; este documento no las atribuye.
- Fuentes: [spec](../spec.md) (RF-21/22/23, H3/H5, cierre E2), [plan](../plan.md) (§Cierre E2 — Exportación solo CSV), [tasks](../tasks.md) (`CSV-00…03`), [validation](../validation.md), contratos aceptados [E1](./E1-summary-contract.md), [series](./E2-series-contract.md), [ranking](./E2-ranking-contract.md), [sin movimiento](./E2-no-movement-contract.md), [categorías](./E2-categories-contract.md), [OpenAPI](../../../../../backend/docs/api/openapi.yaml), [reglas de negocio](../../../../../backend/docs/business-rules.md), [permisos](../../../../../backend/docs/permissions.md), [flujo backend](../../../../../backend/docs/workflow/README.md), [guía de desarrollo](../../../../../backend/docs/development-guide.md), [arquitectura](../../../../../backend/docs/architecture.md), esquema Prisma y módulos `sales` implementados.

> Cinco archivos de datos: ventas más las cuatro capacidades analíticas implementadas (series, ranking, sin movimiento y categorías). La expresión «cuatro exportaciones» del encargo se interpreta como las cuatro capacidades analíticas, más ventas. No se exportan imágenes, PNG, XLSX, PDF ni gráficas editables.

## Hechos corroborados

| Fuente | Hecho relevante |
| --- | --- |
| `backend/src/app.ts` | `/api/v1/admin/dashboard` está en el middleware privado temprano (`privateCashResponse`), antes del router; cubre Origin/parsing/413/429 y errores posteriores con `Cache-Control: no-store` y `Referrer-Policy: no-referrer`. `/api/v1/admin/sales` **no** está en ese montaje temprano. |
| `backend/src/modules/sales/sales.routes.ts` | Las rutas administrativas existentes usan `privateCashResponse`, `authenticate(auth)` y `authorize('ADMINISTRADOR')`; rechazan body no vacío con `invalidInput()`. |
| `backend/src/shared/http/serialization.ts` | `BigInt` se serializa como cadena; IDs, conteos e importes no pasan por `Number`. |
| `backend/prisma/schema.prisma` (`Sale`, `Order`, `Payment`, `OrderItem`) | `Sale` es la venta pagada, única por orden/pago, con `saleNumber`, `soldAt Timestamptz(6)` y `totalCents`. `Order.status` es el estado actual de la orden. `Payment.method` es CASH/STRIPE. `OrderItem` conserva `quantity` y `lineTotalCents`; opciones ya están incluidas en la línea. |
| `backend/src/modules/sales/sales.read.repository.ts` | `list` devuelve `id`, `saleNumber`, `orderId`, `paymentId`, `totalCents`, `soldAt` y `method`; `where` filtra `[from,to)` y método. Las agregaciones E2 ya calculan series, ranking, sin movimiento y categorías en una sola lectura, sin N+1. |
| `backend/docs/api/openapi.yaml` | Existen contratos aceptados de `summary`, `sales-series`, `product-ranking`, `no-movement-products` y `category-participation`; esta propuesta es aditiva y no modifica sus esquemas. |
| Contratos aceptados | Series usa siempre tres métricas y `method` opcional/null; ranking usa `metric`/`direction` obligatorios, `top` 5/10/20 y metadatos del conjunto antes del corte; sin movimiento es conjunto completo con cursor pero sin top N; categorías usa `metric` obligatorio, categoría vigente y `sharePercent` backend half-up. |
| `frontend/docs/specs/dashboard-admin/validation.md` | E2-03/07/11/15 aceptadas como capacidades. La exportación CSV no está implementada ni aceptada; E2 no se cierra hasta `CSV-03`. |

## Principios comunes

1. **Solo lectura y solo ADMINISTRADOR.** Todas las rutas son `GET`, con cookie de acceso vigente. `ADMINISTRADOR` obtiene `200`; sin sesión `401 UNAUTHENTICATED`; `CLIENTE`, `CAJERO`, `PREPARACION` y `GERENTE` obtienen `403 FORBIDDEN`, sin consultar el conjunto. `PIN_CHANGE_REQUIRED` y `ORIGIN_NOT_ALLOWED` conservan sus códigos actuales.
2. **Sin CSRF nuevo para GET.** Se reutilizan cookies, sesión, Origin y revalidación de actor existentes. Si en el futuro se propusiera una mutación de exportación, requeriría CSRF y contrato propio. No se aceptan tokens de sesión en la URL.
3. **Mismos filtros que su endpoint de origen, sin paginación.** Se rechazan `cursor`, `offset`, `page`, `limit` (salvo `limit` del origen de sin movimiento, que aquí **no** aplica), arrays, repetidos —aunque sean iguales—, valores vacíos, corchetes y cualquier parámetro o body extra.
4. **Un mismo conjunto lógico por archivo.** Cada archivo se genera desde una lectura coherente. `generatedAt` identifica el instante de generación y no es un token de snapshot compartido entre archivos o peticiones. No se exige igualdad entre exportaciones tomadas en instantes distintos con ventas nuevas.
5. **Sin truncamiento silencioso.** Los topes de rango/filas se validan antes de escribir el primer byte. Si se exceden, se responde Problem Details y **no** se entrega un CSV parcial ni se presenta como completo.
6. **Datos, no gráficas.** El archivo contiene filas de datos con metadatos de filtros/métrica/top/granularidad; no contiene imágenes ni una representación dibujada. El frontend no reconstruye reportes desde páginas visibles.

## Rutas propuestas

Todas cuelgan del prefijo existente con middleware privado temprano:

| Capacidad | Ruta propuesta | Origen semántico |
| --- | --- | --- |
| Ventas filtradas | `GET /api/v1/admin/dashboard/sales-export.csv` | Universidad de `Sale` y filtros de `/sales`/`/sales/summary` |
| Series horarias/diarias | `GET /api/v1/admin/dashboard/sales-series-export.csv` | `/admin/dashboard/sales-series` |
| Ranking de productos | `GET /api/v1/admin/dashboard/product-ranking-export.csv` | `/admin/dashboard/product-ranking` |
| Activos sin movimiento | `GET /api/v1/admin/dashboard/no-movement-products-export.csv` | `/admin/dashboard/no-movement-products` |
| Participación por categorías | `GET /api/v1/admin/dashboard/category-participation-export.csv` | `/admin/dashboard/category-participation` |

La spec menciona `/admin/sales/export.csv` como candidata y el plan `/api/v1/admin/sales/export.csv`; **ninguna se acepta aquí**. La propuesta usa el prefijo `/api/v1/admin/dashboard` para reutilizar el middleware privado temprano y las convenciones de las capacidades E2. Cambiar la ruta es una decisión del responsable (D01/D02).

## Entradas estrictas por exportación

### Ventas

```http
GET /api/v1/admin/dashboard/sales-export.csv?from=...Z&to=...Z[&method=CASH|STRIPE]
```

| Parámetro | Regla propuesta |
| --- | --- |
| `from` | Obligatorio, escalar único, fecha UTC real terminada en `Z`, inicio inclusivo. Años 2000–9999, 0–3 decimales, sin offsets. Mínimo `2000-01-01T08:00:00.000Z`; anterior → `400 VALIDATION_ERROR` sin truncar. |
| `to` | Obligatorio, escalar único, fecha UTC real `Z`, fin exclusivo, estrictamente mayor. Mismo formato/dominio. `to - from` máximo **366 días absolutos**; exceso → 400 sin truncar. |
| `method` | Opcional, `CASH` o `STRIPE`. Omitido incluye ambos. Vacío/null literal/minúsculas → 400. |
| Extras | Se rechazan `limit`, `cursor`, `order`, `page`, `offset`, `top`, `metric`, `direction`, `category`, `categoryId`, `timeZone`, `sort` y cualquier otro. |

La exportación de ventas es deliberadamente más estricta que `GET /api/v1/sales` (que admite fechas opcionales y hasta seis decimales). No cambia el contrato de `/sales` ni de `/sales/summary`.

### Series

```http
GET /api/v1/admin/dashboard/sales-series-export.csv?from=...Z&to=...Z&granularity=hour|day[&method=CASH|STRIPE]
```

Parámetros y límites idénticos al contrato aceptado de series: `from`/`to` obligatorios, `granularity` obligatoria, `method` opcional, sin `metric`, sin cursor/limit/top. Se rechazan extras. Límites: `hour` 744 h absolutas y hasta 745 buckets; `day` 366 × 24 h y hasta 368 buckets. Exceso → 400 sin truncar.

### Ranking

```http
GET /api/v1/admin/dashboard/product-ranking-export.csv?from=...Z&to=...Z&metric=units|amount&direction=top|bottom[&top=5|10|20][&method=CASH|STRIPE]
```

Parámetros idénticos al contrato aceptado de ranking: `metric` y `direction` obligatorios; `top` opcional, default 5, forma léxica exacta `5`/`10`/`20`; `method` opcional. Sin cursor/limit. El archivo contiene **el mismo corte top N** que el endpoint; los metadatos llevan el conjunto completo anterior al corte. Rango máximo 366 días.

### Activos sin movimiento

```http
GET /api/v1/admin/dashboard/no-movement-products-export.csv?from=...Z&to=...Z[&method=CASH|STRIPE]
```

Sin `limit`, `cursor`, `top`, `metric` ni `direction`: el archivo contiene **todo** el conjunto elegible sin movimiento del rango/método. Se reutiliza la definición del contrato aceptado (producto no borrado, categoría activa y no borrada, `createdAt < to`, sin línea de venta pagada en el rango/método). Rango máximo 366 días. Tope de filas propuesto: **2 000 productos**; exceso → `400 EXPORT_LIMIT_EXCEEDED` sin archivo parcial.

### Categorías

```http
GET /api/v1/admin/dashboard/category-participation-export.csv?from=...Z&to=...Z&metric=units|amount[&method=CASH|STRIPE]
```

`metric` obligatoria, `method` opcional, sin `top`/cursor/limit. Se exportan todas las categorías con movimiento en el conjunto filtrado, incluidas las inactivas (`isActive:false`). Rango máximo 366 días. Tope de filas propuesto: **1 000 categorías**; exceso → `400 EXPORT_LIMIT_EXCEEDED`.

## Formato CSV propuesto

### Codificación, delimitador y saltos

- **UTF-8 con BOM** (`EF BB BF`) al inicio del archivo. Se elige BOM para que hojas de cálculo de Windows reconozcan acentos y signos españoles sin un paso manual de importación. Un consumidor programático debe ignorar el BOM; no forma parte del primer encabezado lógico. Alternativa no BOM: decisión D17.
- Delimitador **coma** (`,`), sin línea `sep=,` ni prefijos propietarios.
- Comillas dobles (`"`) cuando el campo contiene coma, comilla, CR o LF; comilla interna duplicada (`""`). RFC 4180.
- Terminador de registro **CRLF** (`\r\n`), incluida la última fila. No se emiten líneas en blanco entre metadatos, encabezado y datos.
- Campos numéricos canónicos sin comillas innecesarias; los campos de texto se citan solo cuando RFC 4180 lo exige.

### Metadatos dentro del archivo

Se elige una **prefila de metadatos como filas CSV válidas** con primer campo reservado `#meta`, antes del encabezado:

```text
#meta,export,sales-export
#meta,schemaVersion,1
#meta,generatedAt,2026-11-25T18:30:00.000Z
...
saleId,saleNumber,...
```

Justificación: mantiene un único archivo, no usa comentarios fuera de RFC 4180, permite a un parser separar metadatos (`#meta`) de datos (encabezado y filas) y no obliga a repetir columnas de filtros en cada fila. La hoja de cálculo muestra las filas de metadatos; el bloque de datos empieza en la primera fila cuyo primer campo no es `#meta`. Los valores de metadatos usan las mismas reglas de escape.

Metadatos comunes propuestos:

| Clave | Valor |
| --- | --- |
| `export` | Identificador de la exportación (`sales-export`, `sales-series-export`, `product-ranking-export`, `no-movement-products-export`, `category-participation-export`) |
| `schemaVersion` | `1` |
| `generatedAt` | UTC con tres decimales |
| `currency` | `MXN` |
| `timeZone` | `America/Tijuana` |
| `period.from`, `period.to` | Límites UTC normalizados |
| `method` | `CASH`, `STRIPE` o `all` |
| `rowCount` | Filas de datos escritas, string decimal |
| `rowLimit` | Tope contractual de filas |
| `truncated` | `false`; un archivo truncado no se entrega |
| `contentKind` | `data` |
| `containsImage` | `false` |

Metadatos específicos se detallan por exportación.

### Fechas, importes y porcentajes

- Fechas UTC de fila: `YYYY-MM-DDTHH:mm:ss.ffffffZ` (seis decimales) cuando la fuente es `soldAt`/`createdAt` PostgreSQL; se preservan microsegundos.
- Límites/buckets de contrato: `YYYY-MM-DDTHH:mm:ss.sssZ` (tres decimales), coherentes con el DTO aceptado.
- Fechas locales: ISO 8601 con offset IANA explícito (`-08:00`/`-07:00`), sin sufijo ambiguo. No se usa offset UTC-8 fijo.
- Importes: **centavos enteros MXN** en columnas `*Cents`, con `currency=MXN` en metadatos. No se emite un importe decimal alternativo que pueda confundirse con otra unidad.
- Conteos/unidades/IDs: strings decimales canónicos, sin `Number`, exponentes, fracciones ni separadores de miles.
- Porcentajes: `sharePercent` como `72.22`, punto decimal, exactamente dos decimales, sin signo `%`; no se normaliza a 100.
- Booleanos: `true`/`false` en minúsculas.

### Escape antifórmulas

- Se aplica **solo a campos de texto** (nombres de producto/categoría, `saleNumber`, `nameSource` si se considerara texto libre, etc.). Si el primer carácter es `=`, `+`, `-`, `@`, tabulador (`\t`) o CR (`\r`), se antepone una comilla simple (`'`).
- La comilla es una marca de protección, no parte del valor lógico. Un consumidor que necesite el texto original debe retirar **exactamente una** comilla inicial de esos campos de texto.
- **No se aplica a importes, unidades, conteos, IDs, fechas ni porcentajes**: sus valores válidos empiezan por dígito o signo negativo solo donde el contrato lo permita; no se altera ningún importe.
- Ejemplo documental: nombre `=1+1` se emite como `'=1+1`; nombre `-Moka` como `'-Moka`; `Café "La Especial", S.A.` se emite con comillas RFC y comillas duplicadas.
- No se usan prefijos invisibles, tabuladores ni `sep=` para “neutralizar”; no se confía en que la hoja de cálculo ignore fórmulas.

## Exportación de ventas

### Semántica y granularidad del archivo

**Una fila por `Sale`**, no por línea. Justificación de conciliación:

- `Sale.totalCents` es importe de venta; una fila por venta permite sumar `totalCents` sin duplicar el total por varias líneas.
- `rowCount` concilia con `ticketCount` del resumen; `SUM(unitsSold)` concilia con `unitsSold`.
- `lineCount` permite detectar ventas multilínea sin convertir el archivo en un detalle de líneas.
- El detalle por producto/categoría ya lo aportan las exportaciones analíticas; no se mezcla en ventas.
- Una fila por línea requeriría repetir el total de venta o prorratearlo, lo que rompería la conciliación directa con tickets/importes.

### Columnas y orden exactos

| # | Columna | Tipo / regla |
| --- | --- | --- |
| 1 | `saleId` | String decimal exacto del `Sale.id` |
| 2 | `saleNumber` | Texto de negocio (`^V[0-9]{6,}$` en datos actuales); no PII |
| 3 | `orderId` | String decimal exacto |
| 4 | `paymentId` | String decimal exacto |
| 5 | `soldAtUtc` | UTC con seis decimales y `Z` |
| 6 | `soldAtLocal` | America/Tijuana ISO con offset, seis decimales |
| 7 | `method` | `CASH` o `STRIPE` |
| 8 | `orderStatus` | Estado **actual** de la orden al generar (`PENDIENTE_PAGO`, `EN_PREPARACION`, `LISTO`, `EXPIRADA`); no es un snapshot histórico |
| 9 | `currency` | `MXN` |
| 10 | `totalCents` | Centavos enteros, importe bruto de la venta; no descuenta reembolsos |
| 11 | `unitsSold` | Suma de `OrderItem.quantity` de la venta, sin multiplicar opciones |
| 12 | `lineCount` | Número de líneas `OrderItem` de la venta |

Sin cliente, nombre de cliente, correo, teléfono, `folio`, ticket, QR, token, NIP, cajero ni datos personales. `orderStatus`, `saleNumber`, IDs internos y método son datos operativos no personales.

### Metadatos específicos

`export`, `schemaVersion`, `generatedAt`, `currency`, `timeZone`, `period.from`, `period.to`, `method`, `rowCount`, `rowLimit=20000`, `truncated=false`, `contentKind=data`, `containsImage=false`, `orderStatusScope=current-at-generation`, `totals.totalCents`, `totals.unitsSold`, `totals.lineCount`.

`totals.*` se calculan sobre el mismo conjunto de la exportación para conciliación; no son una página.

### Ejemplo documental (no ejecutado)

```csv
#meta,export,sales-export
#meta,schemaVersion,1
#meta,generatedAt,2026-11-25T18:30:00.000Z
#meta,currency,MXN
#meta,timeZone,America/Tijuana
#meta,period.from,2026-11-24T08:00:00.000Z
#meta,period.to,2026-11-25T08:00:00.000Z
#meta,method,CASH
#meta,rowCount,2
#meta,rowLimit,20000
#meta,truncated,false
#meta,contentKind,data
#meta,containsImage,false
#meta,orderStatusScope,current-at-generation
#meta,totals.totalCents,8500
#meta,totals.unitsSold,3
#meta,totals.lineCount,3
saleId,saleNumber,orderId,paymentId,soldAtUtc,soldAtLocal,method,orderStatus,currency,totalCents,unitsSold,lineCount
1,V000001,101,201,2026-11-24T16:00:00.123456Z,2026-11-24T08:00:00.123456-08:00,CASH,LISTO,MXN,4000,2,2
2,V000002,102,202,2026-11-24T17:00:00.000001Z,2026-11-24T09:00:00.000001-08:00,CASH,EN_PREPARACION,MXN,4500,1,1
```

## Exportación de series

### Columnas y orden

| # | Columna | Tipo / regla |
| --- | --- | --- |
| 1 | `bucketIndex` | Entero 1-based en orden ascendente de buckets |
| 2 | `startUtc` | Inicio natural UTC, tres decimales |
| 3 | `endUtc` | Fin exclusivo natural UTC, tres decimales |
| 4 | `localStart` | Inicio local ISO con offset IANA exacto |
| 5 | `effectiveFromUtc` | Máximo(`startUtc`, `from`), tres decimales |
| 6 | `effectiveToUtc` | Mínimo(`endUtc`, `to`), tres decimales |
| 7 | `partial` | `true` si el bucket fue recortado por el rango |
| 8 | `totalCents` | Importe bruto del bucket, centavos |
| 9 | `ticketCount` | Tickets del bucket |
| 10 | `unitsSold` | Unidades del bucket |

No se añade `metric`: se exportan las tres métricas, como el DTO aceptado. Los buckets vacíos se incluyen con ceros. La suma de cada métrica concilia con `totals`.

### Metadatos específicos

`granularity`, `bucketCount`, `totals.totalCents`, `totals.ticketCount`, `totals.unitsSold`, además de los comunes.

### Ejemplo documental

```csv
#meta,export,sales-series-export
#meta,schemaVersion,1
#meta,generatedAt,2026-11-25T18:30:00.000Z
#meta,currency,MXN
#meta,timeZone,America/Tijuana
#meta,period.from,2026-11-24T08:15:00.000Z
#meta,period.to,2026-11-24T09:15:00.000Z
#meta,method,all
#meta,granularity,hour
#meta,bucketCount,2
#meta,totals.totalCents,8500
#meta,totals.ticketCount,2
#meta,totals.unitsSold,3
#meta,rowCount,2
#meta,rowLimit,745
#meta,truncated,false
#meta,contentKind,data
#meta,containsImage,false
bucketIndex,startUtc,endUtc,localStart,effectiveFromUtc,effectiveToUtc,partial,totalCents,ticketCount,unitsSold
1,2026-11-24T08:00:00.000Z,2026-11-24T09:00:00.000Z,2026-11-24T00:00:00-08:00,2026-11-24T08:15:00.000Z,2026-11-24T09:00:00.000Z,true,4000,1,2
2,2026-11-24T09:00:00.000Z,2026-11-24T10:00:00.000Z,2026-11-24T01:00:00-08:00,2026-11-24T09:00:00.000Z,2026-11-24T09:15:00.000Z,true,4500,1,1
```

## Exportación de ranking

### Columnas y orden

| # | Columna | Tipo / regla |
| --- | --- | --- |
| 1 | `position` | Posición 1-based derivada del orden del endpoint; no es un ID |
| 2 | `productId` | String decimal exacto; identidad de agrupación |
| 3 | `name` | Nombre actual o snapshot según contrato aceptado; texto de catálogo |
| 4 | `nameSource` | `current` o `snapshot` |
| 5 | `unitsSold` | Unidades del producto |
| 6 | `totalCents` | Importe histórico bruto del producto, centavos |

El archivo contiene **hasta `top` filas**, igual que el endpoint. No exporta el conjunto completo de productos con movimiento: los metadatos `matchedProductCount`/`matchedTotals`/`truncated` describen el conjunto completo anterior al corte. Esto evita confundir «top N» con «todas las ventas» y permite conciliar el corte con el endpoint.

### Metadatos específicos

`metric`, `direction`, `top`, `matchedProductCount`, `matchedTotals.unitsSold`, `matchedTotals.totalCents`, `truncated`, además de los comunes.

### Ejemplo documental con escape/antifórmulas

```csv
#meta,export,product-ranking-export
#meta,schemaVersion,1
#meta,generatedAt,2026-11-25T18:30:00.000Z
#meta,currency,MXN
#meta,timeZone,America/Tijuana
#meta,period.from,2026-11-24T08:00:00.000Z
#meta,period.to,2026-11-25T08:00:00.000Z
#meta,method,all
#meta,metric,units
#meta,direction,top
#meta,top,5
#meta,matchedProductCount,3
#meta,matchedTotals.unitsSold,12
#meta,matchedTotals.totalCents,34500
#meta,truncated,false
#meta,rowCount,3
#meta,rowLimit,20
#meta,contentKind,data
#meta,containsImage,false
position,productId,name,nameSource,unitsSold,totalCents
1,10,"Café ""La Especial"", S.A.",current,6,21000
2,11,'=1+1,snapshot,3,8500
3,12,'-Moka,snapshot,3,5000
```

La segunda y tercera filas muestran la comilla de protección antifórmulas en campos de texto; los importes/unidades no se alteran.

## Exportación de activos sin movimiento

### Columnas y orden

| # | Columna | Tipo / regla |
| --- | --- | --- |
| 1 | `productId` | String decimal exacto |
| 2 | `name` | Nombre actual del producto |
| 3 | `categoryId` | String decimal exacto de la categoría actual |
| 4 | `categoryName` | Nombre actual de la categoría |
| 5 | `isAvailable` | `true`/`false` actual; no define actividad |
| 6 | `createdAtUtc` | Alta UTC con seis decimales |
| 7 | `createdAtLocal` | Alta local ISO con offset, seis decimales |

El archivo contiene el **conjunto completo** del universo sin movimiento, sin cursor, sin paginación y sin top N. Orden: `name COLLATE "C" ASC, productId ASC`, igual que el contrato aceptado. No se reordena en frontend.

### Metadatos específicos

`universe.asOf`, `universe.definition`, `universe.includesUnavailable`, `totalNoMovementProducts`, además de los comunes. `universe.asOf` es un corte de cohorte, no un snapshot histórico; la UI debe rotularlo como «corte del universo».

### Límite y cero resultados

- Tope propuesto: 2 000 productos. Si el conjunto completo supera el tope, `400 EXPORT_LIMIT_EXCEEDED` sin archivo parcial.
- Cero resultados: metadatos con `rowCount=0`, `totalNoMovementProducts=0`, encabezado y ninguna fila de datos.

## Exportación de participación por categorías

### Columnas y orden

| # | Columna | Tipo / regla |
| --- | --- | --- |
| 1 | `categoryId` | String decimal exacto de la categoría actual |
| 2 | `name` | Nombre actual de la categoría |
| 3 | `isActive` | `true`/`false` actual; las inactivas con movimiento se incluyen |
| 4 | `unitsSold` | Unidades de la categoría |
| 5 | `totalCents` | Importe histórico bruto de la categoría, centavos |
| 6 | `sharePercent` | Porcentaje backend half-up, dos decimales, sin `%` |

Orden: métrica seleccionada descendente, `name COLLATE "C" ASC`, `categoryId ASC`, igual que el contrato aceptado. No hay top N, cursor ni relleno de categorías sin movimiento. La suma de unidades/importes de las filas concilia con `denominator`; los porcentajes no se fuerzan a 100.

### Metadatos específicos

`metric`, `denominator.unitsSold`, `denominator.totalCents`, `totalCategories`, además de los comunes.

### Límite y cero resultados

- Tope propuesto: 1 000 categorías. Exceso → `400 EXPORT_LIMIT_EXCEEDED`.
- Sin líneas en el universo: metadatos con `totalCategories=0`, `rowCount=0`, encabezado y ninguna fila.
- Base cero con líneas e `metric=amount` (importes 0): se conservan ítems y `sharePercent=0.00`; los metadatos permiten mostrar «sin base».

## Límites por exportación

| Exportación | Rango | Filas/buckets máximos | Comportamiento al exceder |
| --- | --- | --- | --- |
| Ventas | 366 días absolutos | 20 000 ventas | `400 EXPORT_LIMIT_EXCEEDED`, sin CSV parcial |
| Series `hour` | 744 h absolutas | 745 buckets | `400 VALIDATION_ERROR` |
| Series `day` | 366 × 24 h | 368 buckets | `400 VALIDATION_ERROR` |
| Ranking | 366 días absolutos | 20 filas (`top` máximo) | `400 VALIDATION_ERROR` por `top`/rango inválido; sin archivo parcial |
| Sin movimiento | 366 días absolutos | 2 000 productos | `400 EXPORT_LIMIT_EXCEEDED`, sin CSV parcial |
| Categorías | 366 días absolutos | 1 000 categorías | `400 EXPORT_LIMIT_EXCEEDED`, sin CSV parcial |

Los topes son límites de contrato y protección de memoria/tiempo; no son SLA ni prometen latencia. Se medirán en `CSV-01`. No se añaden índices ni migraciones por este contrato.

## Seguridad, cabeceras y errores

### Cabeceras de éxito

- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="<nombre-seguro>.csv"` con nombre ASCII, sin acentos, sin PII, sin CR/LF, sin rutas.
- `Cache-Control: no-store`
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff` (helmet existente; se documenta)
- `Content-Length` opcional si la generación acotada ya tiene el cuerpo completo; no se promete si se adoptara streaming en el futuro.

Nombres propuestos:

```text
dashboard-sales-20261124T080000Z-20261125T080000Z-cash.csv
dashboard-sales-series-20261124T081500Z-20261124T091500Z-hour-all.csv
dashboard-product-ranking-20261124T080000Z-20261125T080000Z-units-top5-all.csv
dashboard-no-movement-20261124T080000Z-20261125T080000Z-all.csv
dashboard-category-participation-20261124T080000Z-20261125T080000Z-amount-all.csv
```

### Errores

Todos los errores son `application/problem+json` con `type,title,status,detail,instance,code,requestId` y `errors` cuando aplique; sin stack, SQL, secretos ni PII. **Nunca** se responde un CSV parcial con estado 200.

| Código | Uso |
| --- | --- |
| `400 VALIDATION_ERROR` | Parámetros faltantes/ inválidos, fechas imposibles, rango/precisión, extras, repetidos, arrays, body no vacío, `top` inválido |
| `400 EXPORT_LIMIT_EXCEEDED` | Filas del conjunto completo superan el tope de la exportación; no se escribe archivo |
| `401 UNAUTHENTICATED` | Sin sesión vigente |
| `403 FORBIDDEN` | Rol distinto de ADMINISTRADOR, incluido GERENTE |
| `403 PIN_CHANGE_REQUIRED` | Cambio obligatorio de NIP |
| `403 ORIGIN_NOT_ALLOWED` | Origen no permitido |
| `413 PAYLOAD_TOO_LARGE` | Parser global si se enviara un body superior a 256 KiB; no es el mecanismo para exceder filas |
| `429 RATE_LIMITED` | Limitador existente; sin bucle de reintentos |
| `500 INTERNAL_ERROR` | Fallo inesperado o integridad no resoluble (p. ej. categoría borrada con líneas) saneado |
| `503 DEPENDENCY_UNAVAILABLE` | Fallo de dependencia reconocido por `problemHandler` |

`Cache-Control`/`Referrer-Policy` se garantizan dentro del middleware privado temprano `/api/v1/admin/dashboard`. Los rechazos globales previos a la ruta (Origin/parsing/413/429) quedan cubiertos por ese montaje actual, según `app.ts`; `CSV-01` debe verificarlo con pruebas de integración y no se declara caos live.

### Frontend futuro (`CSV-02`)

- Descarga autenticada con el cliente HTTP y la sesión única existentes; cookies/`credentials: include`; **sin token en URL**.
- Distinguir `text/csv` de `application/problem+json`; no descargar un Problem Details como CSV.
- Estado ocupado, prevención de doble descarga, aborto/descarte al cambiar filtros, liberación de `Blob`/object URL, sin persistencia local de CSV.
- No recalcular ni reconstruir reportes en el navegador; no concatenar páginas visibles.

## Generación y coste

Se propone **generación acotada en memoria** para las cinco exportaciones, no streaming:

1. Validar entrada estricta y rango.
2. Ejecutar una lectura coherente (preferentemente en la misma transacción/`REPEATABLE READ`) que cuente el conjunto y obtenga filas/agregados.
3. Si el conteo supera el tope, lanzar `400 EXPORT_LIMIT_EXCEEDED` antes de escribir cabeceras.
4. Serializar metadatos, encabezado y filas en un buffer; enviar una sola respuesta.
5. Liberar el buffer al terminar; sin archivos temporales, sin colas, sin almacenamiento persistente, sin object storage.

Justificación: los topes (20 000 ventas, 745/368 buckets, 20 filas de ranking, 2 000 productos, 1 000 categorías) mantienen el buffer acotado; generar completo antes de enviar evita el problema de un error a mitad de stream que dejaría un CSV parcial. Si una medición futura autorizada mostrara que el buffer es inaceptable, se evaluará streaming con pre-conteo en una decisión/tarea propia, sin cambiar este contrato unilateralmente. El coste real se medirá en `CSV-01`; no se promete latencia.

## Matriz de escenarios CSV

Todos los resultados son **exigencias de contrato**, no pruebas ejecutadas. La evidencia futura se reparte entre `CSV-01` (backend), `CSV-02` (frontend) y `CSV-03` (aceptación real/cierre E2).

| ID | RF | Escenario | Resultado exigido | Evidencia futura |
| --- | --- | --- | --- | --- |
| CSV-R01 | RF-21 | Dataset de ventas con más filas que una página visible de `/sales` | El CSV incluye todas las ventas del rango/método, no solo la página; `rowCount` completo | CSV-01, CSV-03 |
| CSV-R02 | RF-21 | `method` omitido/CASH/STRIPE; rango con ventas de ambos métodos | Cada archivo incluye solo su subconjunto; no mezcla métodos; concilia con resumen | CSV-01, CSV-03 |
| CSV-R03 | RF-21 | Ventas multilínea, opciones, reembolso | Una fila por venta; `unitsSold` suma cantidades una vez; `lineCount` correcto; total bruto no resta reembolso | CSV-01 |
| CSV-R04 | RF-21 | Suma de `totalCents`/`unitsSold`/`rowCount` del CSV frente a resumen y `/sales/summary` | Conciliación exacta con mismo rango/método/dataset | CSV-01, CSV-03 |
| CSV-R05 | RF-21 | Cero ventas en el rango | `200` con metadatos, encabezado y cero filas; sin 404 ni filas ficticias | CSV-01, CSV-02 |
| CSV-R06 | RF-21 | Rango >366 días, `from>=to`, fecha imposible, 4–6 decimales, offset | `400 VALIDATION_ERROR`; sin CSV | CSV-01, CSV-02 |
| CSV-R07 | RF-21 | Conjunto de ventas >20 000 | `400 EXPORT_LIMIT_EXCEEDED`; sin archivo parcial ni truncado | CSV-01 |
| CSV-R08 | RF-22 | Series con buckets vacíos, parciales y DST 23/25 h | CSV idéntico al endpoint; suma de métricas = totals; identidad UTC/offset | CSV-01, CSV-03 |
| CSV-R09 | RF-22 | Series `hour`/`day` en límites y exceso 745/368 | Dentro: 200; exceso: 400 sin truncar | CSV-01 |
| CSV-R10 | RF-22 | Ranking `units/amount`, `top/bottom`, `top` 5/10/20/default | Mismas filas/orden que el endpoint; `top` efectivo en metadatos | CSV-01, CSV-03 |
| CSV-R11 | RF-22 | Ranking con más productos que `top` y `truncated=true` | CSV contiene exactamente el top N; metadatos conservan conjunto completo previo al corte | CSV-01, CSV-03 |
| CSV-R12 | RF-22 | Ranking con nombres iguales, acentos, comillas y nombres que empiezan por `=,+,-,@` | Orden/identidad del endpoint; escape RFC; antifórmulas solo en texto; importes exactos | CSV-01, CSV-02 |
| CSV-R13 | RF-22 | Sin movimiento con más de una página del endpoint | CSV incluye **todo** el conjunto elegible, sin cursor/top; orden `name COLLATE "C", productId` | CSV-01, CSV-03 |
| CSV-R14 | RF-22 | Sin movimiento: producto vendido fuera de rango, otro método, alta en `to`, baja/categoría inactiva | Misma semántica del contrato aceptado; `totalNoMovementProducts` correcto | CSV-01, CSV-03 |
| CSV-R15 | RF-22 | Sin movimiento >2 000 productos | `400 EXPORT_LIMIT_EXCEEDED`; sin archivo parcial | CSV-01 |
| CSV-R16 | RF-22 | Categorías `units/amount`, método omitido/CASH/STRIPE | Mismas categorías/orden/métricas que el endpoint; incluye inactivas con movimiento | CSV-01, CSV-03 |
| CSV-R17 | RF-22 | Categorías con residuo 99.99, base cero, cero líneas | `sharePercent` backend exacto, sin normalizar; base cero `0.00`; cero filas solo si no hay líneas | CSV-01, CSV-02 |
| CSV-R18 | RF-22 | Categorías >1 000 | `400 EXPORT_LIMIT_EXCEEDED`; sin archivo parcial | CSV-01 |
| CSV-R19 | RF-23 | Sin sesión; ADMINISTRADOR; CLIENTE/CAJERO/PREPARACION/GERENTE | 401/200/403; denegados sin consultar agregados; sin CSRF nuevo para GET | CSV-01, CSV-02, CSV-03 |
| CSV-R20 | RF-23 | Origin inválido, PIN obligatorio, token en URL | 403 con código existente; no se aceptan tokens de sesión en query | CSV-01, CSV-02 |
| CSV-R21 | RF-23 | Respuesta 200 | `text/csv; charset=utf-8`, `Content-Disposition` seguro, `no-store`, `no-referrer`, sin PII en el nombre | CSV-01, CSV-02 |
| CSV-R22 | RF-23 | Acentos, comillas, comas y saltos de línea en nombres | UTF-8, comillas RFC 4180, CRLF, sin corrupción | CSV-01, CSV-03 |
| CSV-R23 | RF-23 | Texto que empieza por `=`, `+`, `-`, `@`, tab o CR | Prefijo `'` solo en campos de texto; importes/unidades/IDs válidos sin alterar | CSV-01 |
| CSV-R24 | RNF-02 | IDs/importes/conteos > `Number.MAX_SAFE_INTEGER` | Strings exactos; sin `Number`, exponentes ni notación científica | CSV-01 |
| CSV-R25 | RF-23 | Cero resultados en cualquier exportación | Metadatos + encabezado, sin filas; no 404/CSV vacío sin encabezado | CSV-01, CSV-02 |
| CSV-R26 | RF-19 | 413 de parser, 429, 500 inesperado, 503 de dependencia | Problem Details saneados; sin CSV parcial; cabeceras privadas según middleware; sin bucle | CSV-01, CSV-03 |
| CSV-R27 | RF-23 | Archivo generado con BOM/CRLF/coma | Abre en hoja de cálculo con acentos; no se promete tipado automático de IDs/fechas | CSV-03 |
| CSV-R28 | RF-22 | Intento de exportar imagen/PNG/XLSX o de inferir CSV desde la UI | No existe esa ruta; metadatos `contentKind=data`, `containsImage=false`; UI descarga datos | CSV-02, CSV-03 |
| CSV-R29 | RF-21/22 | Cambio de filtros durante la descarga | Prevalece la última selección; no se mezclan archivos; aborto/descarte seguro | CSV-02 |
| CSV-R30 | RF-23 | Error Problem Details devuelto al frontend | No se descarga como `.csv`; se muestra error; no se guarda archivo local | CSV-02 |
| CSV-R31 | RNF-06 | Volumen representativo y memoria | Generación acotada sin colas/persistencia; coste medido en CSV-01; sin N+1 | CSV-01, CSV-03 |
| CSV-R32 | RF-23 | Inyección de cabeceras en nombre de archivo o valores | Sin CR/LF en `Content-Disposition`; nombre ASCII; celdas escapadas | CSV-01 |
| CSV-R33 | RF-21/22 | Mismo dataset estable, exportación vs endpoint | Filas/agregados coinciden con el endpoint y el resumen; `generatedAt` no es token compartido | CSV-01, CSV-03 |
| CSV-R34 | RF-23 | PII innecesaria | Ventas sin cliente/correo/teléfono/ticket/QR; analítica solo catálogo/IDs | CSV-01, CSV-03 |
| CSV-R35 | RF-23 | Persistencia temporal | No se crean archivos versionados, temporales persistentes, colas ni object storage | CSV-01, CSV-03 |

## Decisiones que el responsable debe aceptar

La aceptación de `CSV-00` no debe interpretarse como aceptación de estas decisiones ni al revés. Se agrupan para una aceptación explícita antes de `CSV-01`/`CSV-02`.

### A. Rutas y alcance

| ID | Decisión propuesta |
| --- | --- |
| D01 | Exportar cinco archivos: ventas + series + ranking + sin movimiento + categorías. «Cuatro exportaciones» se interpreta como las cuatro capacidades analíticas más ventas. |
| D02 | Usar rutas `GET /api/v1/admin/dashboard/<capacidad>-export.csv`, incluida ventas, en lugar de `/admin/sales/export.csv` o `/api/v1/admin/sales/export.csv`. Motivo: middleware privado temprano y convenciones E2. |
| D03 | Mantener los parámetros del endpoint de origen, sin cursor/paginación; rechazar extras/repetidos/arrays/body. |
| D04 | Ventas exige `from`/`to` (0–3 decimales, mínimo 2000, máximo 366 días), más estricto que `/sales` actual; no cambia `/sales` ni `/sales/summary`. |

### B. Ventas

| ID | Decisión propuesta |
| --- | --- |
| D05 | Una fila por venta, no por línea; `unitsSold` y `lineCount` agregados por venta. |
| D06 | Columnas exactas de ventas: IDs, `saleNumber`, `soldAtUtc`, `soldAtLocal`, `method`, `orderStatus`, `currency`, `totalCents`, `unitsSold`, `lineCount`; sin PII ni ticket/QR. |
| D07 | `orderStatus` es el estado actual de la orden al generar, no un snapshot histórico; se documenta en metadatos. |
| D08 | Tope de 20 000 ventas; exceso → `400 EXPORT_LIMIT_EXCEEDED` sin archivo parcial. |
| D09 | Metadatos de ventas incluyen totales del conjunto (`totals.totalCents`, `unitsSold`, `lineCount`) para conciliación. |

### C. Analítica

| ID | Decisión propuesta |
| --- | --- |
| D10 | Series exporta siempre las tres métricas, sin parámetro `metric`; mismos buckets/totales/límites que el endpoint. |
| D11 | Ranking exporta exactamente el top N del endpoint; los metadatos llevan `matchedProductCount`/`matchedTotals`/`truncated` del conjunto completo previo al corte. |
| D12 | Sin movimiento exporta el conjunto completo, sin cursor/limit/top; tope 2 000 productos. |
| D13 | Categorías exporta todas las categorías con movimiento, incluidas inactivas; `metric` obligatoria; tope 1 000 categorías. |
| D14 | Metadatos como filas `#meta` antes del encabezado; cero resultados produce metadatos + encabezado sin filas. |
| D15 | Semántica de estado actual para `orderStatus`, universo de sin movimiento y categoría vigente; no se reconstruyen snapshots históricos no existentes. |
| D16 | Ranking conserva nombre actual/snapshot del contrato aceptado; no se inventa fallback nuevo. |
| D17 | Categorías borradas o líneas sin categoría resoluble → `500 INTERNAL_ERROR` saneado; no se inventa categoría ni se descarta la línea. |
| D18 | Porcentajes de categorías se exportan tal como los calcula backend (half-up, dos decimales); no se normalizan a 100. |

### D. Formato

| ID | Decisión propuesta |
| --- | --- |
| D19 | UTF-8 **con BOM**; coma; CRLF; comillas RFC 4180; CRLF final. |
| D20 | Antifórmulas: prefijo `'` solo en campos de texto que empiecen por `=`, `+`, `-`, `@`, tab o CR; importes/unidades/IDs no se alteran. La comilla es reversible. |
| D21 | Fechas de fila UTC con seis decimales; límites de contrato con tres; locales con offset IANA. Importes en centavos MXN; porcentajes con punto y dos decimales. |

### E. Seguridad, cabeceras y errores

| ID | Decisión propuesta |
| --- | --- |
| D22 | Solo ADMINISTRADOR; GERENTE 403; GET sin CSRF nuevo; Origin/sesión existentes; sin token en URL. |
| D23 | Cabeceras: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition` con nombre ASCII seguro, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`. |
| D24 | Errores `application/problem+json`; 400/401/403/413/429/500/503 saneados; nunca CSV parcial con 200. |
| D25 | `400 EXPORT_LIMIT_EXCEEDED` para topes de filas; no usar 413 para ese caso (413 queda para parser global). |

### F. Generación y puertas

| ID | Decisión propuesta |
| --- | --- |
| D26 | Generación acotada en memoria con pre-conteo en una lectura coherente; sin streaming, colas, archivos temporales ni almacenamiento persistente. |
| D27 | OpenAPI aditivo con `x-contract-status: proposed-2026-11-25`; no se modifican esquemas existentes. |
| D28 | `CSV-01`/`CSV-02` quedan bloqueadas hasta aceptación explícita de D01–D27; `CSV-03` sigue siendo el único cierre de E2. |

## Contradicciones y reservas detectadas

1. **Ruta de ventas:** la spec menciona `/admin/sales/export.csv` como candidata; el plan menciona `/api/v1/admin/sales/export.csv`; esta propuesta usa `/api/v1/admin/dashboard/sales-export.csv` por el middleware privado temprano. Ninguna es aceptada aún. Requiere D02.
2. **«Cuatro exportaciones»:** el encargo lista cinco conjuntos (ventas, series, ranking, sin movimiento, categorías). Se interpreta como cuatro capacidades analíticas + ventas; requiere D01.
3. **Precisión de ventas:** `/sales` actual permite fechas opcionales y hasta seis decimales; la exportación propone `from`/`to` obligatorios y 0–3 decimales. No se cambia el contrato existente; requiere D04.
4. **Estado de venta:** `Sale` no tiene un campo `status`; se propone `orderStatus` actual. No es un snapshot histórico y puede cambiar después de la venta. Requiere D07.
5. **Ranking top N vs conjunto completo:** el endpoint devuelve top N; el CSV propuesto también. Los metadatos describen el conjunto completo, pero no se exportan todas las filas del conjunto. Requiere D11.
6. **`position`/`nameSource` opcionales en el DTO de ranking:** el CSV propone incluirlos siempre; `position` se deriva del orden y `nameSource` se toma del backend. No se cambia el DTO JSON; requiere D11/D16.
7. **Series sin `metric`:** el contrato aceptado devuelve siempre tres métricas; el CSV no añade selector. Coherente, pero se registra para evitar expectativa de `metric` en series.
8. **Sin movimiento con cursor vs CSV completo:** el endpoint pagina; el CSV no acepta cursor/limit y puede superar el tamaño de una página. Requiere D12.
9. **Categorías borradas:** el contrato aceptado exige fallo interno saneado; el CSV no inventa categoría. Requiere D17.
10. **BOM:** la spec no fija BOM; se propone con BOM por compatibilidad con hojas de cálculo. Requiere D19.
11. **OpenAPI `DashboardAdmin` tag:** su descripción histórica dice «Propuesta DA-001… contrato pendiente»; no se modifica en esta tarea para no tocar contenido existente. No afecta a los paths CSV.
12. **413 vs tope de filas:** 413 es un límite global de body, no de respuesta; el tope de filas se propone como 400 `EXPORT_LIMIT_EXCEEDED`. Requiere D25.

## Verificación de esta tarea

Prevista y ejecutada solo como validación documental, sin runtime, HTTP, BD, UI ni CSV real:

- Desde `backend/`: `npm.cmd run format:check`, `npm.cmd run api:validate`.
- Desde `backend/`: `node scripts/check-doc-links.mjs` (enlaces del backend; los de `frontend/docs` se revisan a mano).
- Desde la raíz: `git diff --check` y revisión del diff/archivos nuevos.
- No se ejecutan pruebas HTTP/BD, benchmarks ni descargas reales; no se atribuye aceptación de API a ejemplos documentales.
- Los resultados reales de los comandos se registran en [validation.md](../validation.md); no se inventan.

## Puerta siguiente

`CSV-00` queda **propuesta, no aceptada**. El responsable debe aceptar o modificar las decisiones D01–D28, en particular rutas, formato/BOM, columnas de ventas, topes y generación. Solo después podrán iniciarse `CSV-01` (backend) y `CSV-02` (descarga frontend); `CSV-03` sigue siendo la aceptación real y el cierre único de E2. Esta propuesta no autoriza commit, push, despliegue, migraciones, dependencias ni cambios de runtime.
