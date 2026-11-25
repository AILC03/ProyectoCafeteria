# Contrato E2 aceptado — Series horarias/diarias desde 2000

Estado: **contrato documental aceptado explícitamente por el responsable el 2026-11-24**, mediante «aprobar y continuar» tras recomendar dominio desde 2000. Esta aceptación corresponde al contrato redactado con la acotación siguiente, no a runtime, mediciones de coste ni evidencia HTTP/BD. TASK-DA-E2-00, autor `dashboard-backend-implementer`; verificador `dashboard-verifier`; revisor independiente `dashboard-reviewer`. Backlog previo `846aab6`. Resultados actuales y límites de revisión en [validation.md](../validation.md); no se atribuye aprobación técnica independiente todavía no recibida. No E2-01 ni commit en este encargo.

Fuentes: [spec](../spec.md), [plan](../plan.md), [tasks](../tasks.md), [validación](../validation.md), [contrato E1](./E1-summary-contract.md), [OpenAPI](../../../../../backend/docs/api/openapi.yaml), reglas/permisos y ADR 0004/0006/0009. Las referencias E1 se reutilizan como semántica, no se modifican sus decisiones, evidencia ni contratos.

## Alcance documental y hechos corroborados

- Contrato de lectura administrativa aditiva; sin runtime, SQL ejecutable, UI, CSV, dependencias, índices/migraciones, proveedores ni secretos. No inicia E2-01 ni autoriza commit.
- `backend/src/modules/sales/{sales.routes.ts,sales.validation.ts,sales.service.ts,sales.read.repository.ts}` ya separan rutas/validación/cálculo/repositorio, reutilizan autorización y `privateCashResponse`; E1 acepta fracciones de hasta seis dígitos y usa `Date`. Este contrato E2 limita solo entradas nuevas a milisegundos: no cambia E1 ni afirma corregir su tratamiento de microsegundos.
- `Sale` tiene una venta por orden/pago, `soldAt` TIMESTAMPTZ(6), importe histórico; `OrderItem.quantity` conserva unidades. Opciones e intentos no deben multiplicar ventas ni líneas. Un reembolso no elimina ni reduce una venta registrada.
- `backend/src/shared/http/problem.ts` transforma fallos de dependencia reconocidos (p. ej. P1001/P2010/ECONNREFUSED) en 503 `DEPENDENCY_UNAVAILABLE`; otros inesperados en 500. No prometer 503 para todo fallo ni ceros de éxito por error.
- `backend/src/app.ts` procesa Origin, JSON y limitador global antes del router. La nueva ruta no está en el montaje temprano de `privateCashResponse`. No-store/no-referrer pueden garantizarse dentro del middleware privado de ruta, no para rechazos anteriores con el orden actual. El contrato aceptado documenta ese límite; ampliar cobertura requiere encargo propio, no una edición runtime aquí.

## Ruta y entrada aceptadas (DA-D04/06 de series)

`GET /api/v1/admin/dashboard/sales-series?from=...Z&to=...Z&granularity=hour|day[&method=CASH|STRIPE]`

| Parámetro | Regla aceptada |
| --- | --- |
| `from` | Obligatorio, escalar único, fecha real UTC terminada en Z; inicio inclusivo, mínimo `2000-01-01T08:00:00.000Z` |
| `to` | Obligatorio, escalar único, fecha real UTC Z, estrictamente mayor; fin exclusivo |
| `granularity` | Obligatoria, `hour` o `day`, sin valor por defecto |
| `method` | Opcional, CASH/STRIPE; omisión incluye ambos y produce `method: null`; vacío/null literal inválidos |

- Forma temporal `YYYY-MM-DDTHH:mm:ss[.S|.SS|.SSS]Z`; años de cuatro dígitos 2000–9999, fecha gregoriana real, segundos 00–59, sin hora 24 ni normalización de fechas imposibles. Sin offsets, minúsculas ni segundos intercalares. Salidas UTC normalizadas a tres decimales. **Mínimo aceptado: 2000-01-01 00:00 America/Tijuana = `2000-01-01T08:00:00.000Z`**. Cualquier `from` anterior devuelve 400 `VALIDATION_ERROR`, incluso si `to` cae después del mínimo; nunca truncar ni ajustar a 2000. Los patrones 2000–9999 no bastan para rechazar las primeras ocho horas UTC del año 2000: comparar el instante contra el mínimo explícito. Los límites naturales devueltos deben permanecer en el dominio (rechazar 400, p. ej. si fin natural cae en año 10000). No cambia entradas, dominio ni contratos E1.
- Rechazar extras (incluidos `metric`, `category`, `cursor`, `limit`, `timeZone`), repetidos incluso iguales, arrays/objetos/variantes con corchetes, valores vacíos y body no vacío. No ignorar silenciosamente datos. No nuevo CSRF para GET; sesión/cookies y verificación de actor existentes.
- El intervalo es `[from,to)` UTC, zona fija `America/Tijuana`. No offset UTC-8 fijo. Ambos límites siguientes son obligatorios, con 400 `VALIDATION_ERROR` si cualquiera falla, sin truncar, ajustar granularidad ni devolver parcial:

| Granularidad | Duración absoluta máxima | Máximo de buckets naturales con intersección positiva |
| --- | --- | --- |
| `hour` | 31 × 24 h (744 h) | 745 |
| `day` | 366 × 24 h | 368 |

Los topes son **aceptados como límites de contrato, no medidos**, no SLA ni prueba de coste suficiente. Se eligen límites separados para acotar trabajo; no todos los máximos de buckets tienen por qué ser alcanzables bajo la duración admitida. E2-01 deberá medir coste con volumen autorizado, proponer ajustes antes de cambiar el contrato si son necesarios y no añadir índices por extensión.

### Precisión y conciliación con E1

La entrada aceptada solo ms evita que el transporte por `Date` cambie un límite E2. No permite convertir/truncar `sold_at` de las filas a ms: filtrado y asignación al bucket futuros deben preservar su precisión PostgreSQL de microsegundos. `from` se incluye, `to` se excluye y una venta en `to − 1 μs` se incluye sin redondearla a `to`. La forma técnica se decidirá en E2-01, sin SQL ejecutable en esta tarea. Fracciones 4–6 dígitos en entrada E2 se rechazan, incluso si son ceros; E1 continúa intacto. La conciliación con E1 usa los mismos límites ms y dataset estable, no entradas E1 de mayor precisión.

## Buckets y DST aceptados en el dominio desde 2000

1. Fronteras `hour`: todas las ocurrencias del timeline IANA America/Tijuana cuya fecha/hora local tenga minuto, segundo y fracción cero, ordenadas por instante UTC. No generar una hora local inexistente; ambas ocurrencias de una hora repetida son fronteras distintas. Fronteras `day`: medianoches locales sucesivas (únicas en el dominio con las reglas examinadas). Cada par de fronteras adyacentes define un intervalo natural. Enumerar solo los que intersecten positivamente el rango. `start` es identidad inequívoca y `end` exclusivo; límites naturales adyacentes contiguos. No identificar por etiqueta local ni por índice de hora 0…23.
2. Incluir todos los intervalos intersectados, aunque no tengan ventas: sus tres métricas son `"0"`. No existe bucket ficticio para una hora local inexistente ni se fusionan horas repetidas. Al ser rango positivo válido, hay al menos un bucket.
3. `localStart` es el inicio natural ISO/RFC 3339 `YYYY-MM-DDTHH:mm:ss±HH:mm`, sin fracción, con offset IANA exacto: `-08:00` o `-07:00` en las reglas de Tijuana desde 2000. Se retira la extensión con segundos de offset, necesaria solo en el dominio histórico anterior ahora excluido, y se restituye `format: date-time`. Validar fecha real, frontera local hour/day, offset IANA e igualdad exacta `civil − offset = start`; no usar offset fijo. Fechas locales/UTC 2000–9999 y límites de periodo/buckets no anteriores al mínimo UTC; rechazar sin truncar los límites fuera de dominio. Una hora repetida tiene offset y UTC distintos. `day` inicia en medianoche local y termina en la siguiente: en las reglas del dominio examinado dura 23/24/25 h. No dividir días en 24 h fijas ni extrapolar esa propiedad a datos anteriores a 2000 o a futuros cambios de ley no conocidos.
4. `effectiveFrom = max(start,from)`, `effectiveTo = min(end,to)`; asignar ventas solo en ese intervalo semiabierto. `partial = (effectiveFrom != start || effectiveTo != end)`. Los extremos efectivos cubren exactamente el rango sin huecos/solapes. `partial` expresa recorte por filtro, **no** si el reloj `generatedAt` está dentro de un bucket; no recortar automáticamente a «ahora».
5. Primavera Tijuana: `[2026-03-08T08:00:00.000Z,2026-03-09T07:00:00.000Z)` es un día local de 23 h. En `hour`, 23 buckets: tras `01:00:00-08:00` sigue `03:00:00-07:00`, sin 02:00 local.
6. Otoño Tijuana: `[2026-11-01T07:00:00.000Z,2026-11-02T08:00:00.000Z)` es un día de 25 h. En `hour`, 25 buckets: `2026-11-01T08:00:00.000Z` es `01:00:00-07:00`, seguido por `2026-11-01T09:00:00.000Z` como `01:00:00-08:00`. No duplica ventas; son intervalos UTC distintos. En `day`, cada rango anterior devuelve un único bucket completo.

### Decisión histórica resuelta por acotación aceptada

El responsable aprobó acotar series a fechas desde 2000: queda reemplazada la propuesta 0001–9999 y fuera de alcance la política para saltos históricos no horarios/LMT anteriores. No es una corrección silenciosa ni una modificación de E1. Los ejemplos históricos de F1 se reemplazan por negativos de dominio, no por supuesta evidencia histórica verificada.

Comprobación de reglas: la [fuente IANA northamerica](https://raw.githubusercontent.com/eggert/tz/main/northamerica) y su [representación tzdata.zi](https://www.iana.org/time-zones/repository/tzdb/tzdata.zi) muestran base -08:00 y reglas Mexico hasta 2001, US hasta 2002-02-20, Mexico hasta 2010 y US desde 2010. En esos tramos desde 2000, SAVE alterna 0/1 h a las 02:00 locales, sin cambio de base, segundos LMT ni medianoches inexistentes/ambiguas; los cambios de conjunto de reglas ocurren en invierno sin salto de offset. Las fechas de inicio DST de 2007–2009 siguen Mexico, no deben copiarse retrospectivamente las fechas US de 2010+. Comprobación documental actual con Intl/tzdb y cobertura exacta se registra en validation.md; no acredita HTTP/BD ni ley futura. Con las reglas examinadas no queda transición histórica rara en el dominio que requiera la política excluida. Cambios futuros de tzdb que introduzcan tales casos requieren revisar el contrato, no normalizar silenciosamente ni inventar fronteras.

## DTO y semántica aceptados

OpenAPI define objetos cerrados (`additionalProperties: false`) y todos los campos obligatorios. Esquema de `data`:

| Campo | Regla |
| --- | --- |
| `generatedAt` | UTC con tres decimales, instante de generación; no token de snapshot entre peticiones |
| `currency` | `MXN` |
| `period` | Objeto cerrado `{from,to,timeZone}`; límites normalizados y zona fija Tijuana |
| `method` | `null`, `CASH` o `STRIPE`, eco del filtro efectivo |
| `granularity` | `hour` o `day`, eco de entrada |
| `bucketCount` | String decimal canónica, igual a longitud de `buckets` |
| `totals` | Objeto cerrado `{totalCents,ticketCount,unitsSold}`, sobre todo el rango filtrado |
| `buckets` | Array cronológico completo; campos cerrados `start,end,localStart,effectiveFrom,effectiveTo,partial,totalCents,ticketCount,unitsSold` |

- Métricas siempre presentes: `totalCents` = suma de `Sale.totalCents` bruto histórico, no descuenta reembolsos; `ticketCount` = número de ventas pagadas, no de líneas; `unitsSold` = suma de `OrderItem.quantity` asociadas a esas ventas. Cada venta se asigna por `Sale.soldAt` al intervalo correspondiente y sus unidades acompañan esa venta. No incluir órdenes sin venta (pendientes/fallidas/expiradas) ni sumar intentos de pago.
- Strings canónicas `^(0|[1-9][0-9]*)$`: sin signo, ceros iniciales, exponentes, fracciones ni límite heredado injustificado de 19 dígitos. Agregados exactos, no `Number`; límites del volumen no son licencia para desbordar. Dinero en centavos enteros. No se devuelven IDs ni PII; los IDs que use infraestructura permanecen exactos.
- Totals y buckets deben representar una lectura/snapshot coherente en backend, sin N+1, doble conteo de joins de opciones/pagos ni acumulación de páginas. Suma de cada métrica de buckets = misma métrica de totals. Totals de importe/tickets/unidades = resumen administrativo completo E1 con idénticos límites ms, método y dataset estable; importe/tickets = `/sales/summary` total/count. Ventas nuevas entre peticiones distintas no obligan a igualdad: `generatedAt` no fija un snapshot compartido.
- No promedio, comparación, porcentajes ni mezcla por método dentro del DTO; no cálculo derivado frontend. La interfaz futura solo presenta métricas backend, valida filtros/DTO/orden/identidades y muestra alternativa tabular, actualización y fallo por panel; cancelación/descarte de respuestas antiguas y sesión única existentes. C-UI/C-VIS se verifican en tareas posteriores, no se implementan aquí.

## Ejemplos documentales (no ejecución HTTP)

El ejemplo 200 en OpenAPI es un rango de dos buckets parciales `[08:15Z,09:15Z)` del 24/11: CASH 4000 centavos / 1 ticket / 2 unidades, STRIPE 4500 / 1 / 1; totals 8500 / 2 / 3, método omitido → null. Consultar con CASH produce 4000/1/2 y un segundo bucket cero; con STRIPE produce 4500/1/1 y un primer bucket cero. No se obtienen filtrando el resultado mixto en FE.

### Cero (ejemplo completo del contrato)

```json
{
  "data": {
    "generatedAt": "2026-11-24T18:30:00.000Z",
    "currency": "MXN",
    "period": {"from": "2026-11-24T08:00:00.000Z", "to": "2026-11-24T09:00:00.000Z", "timeZone": "America/Tijuana"},
    "method": "CASH",
    "granularity": "hour",
    "bucketCount": "1",
    "totals": {"totalCents": "0", "ticketCount": "0", "unitsSold": "0"},
    "buckets": [
      {"start": "2026-11-24T08:00:00.000Z", "end": "2026-11-24T09:00:00.000Z", "localStart": "2026-11-24T00:00:00-08:00", "effectiveFrom": "2026-11-24T08:00:00.000Z", "effectiveTo": "2026-11-24T09:00:00.000Z", "partial": false, "totalCents": "0", "ticketCount": "0", "unitsSold": "0"}
    ]
  }
}
```

### DST: ambas 01:00 de otoño (ejemplo completo del contrato)

```json
{
  "data": {
    "generatedAt": "2026-11-24T18:30:00.000Z",
    "currency": "MXN",
    "period": {"from": "2026-11-01T08:00:00.000Z", "to": "2026-11-01T10:00:00.000Z", "timeZone": "America/Tijuana"},
    "method": null,
    "granularity": "hour",
    "bucketCount": "2",
    "totals": {"totalCents": "300", "ticketCount": "2", "unitsSold": "2"},
    "buckets": [
      {"start": "2026-11-01T08:00:00.000Z", "end": "2026-11-01T09:00:00.000Z", "localStart": "2026-11-01T01:00:00-07:00", "effectiveFrom": "2026-11-01T08:00:00.000Z", "effectiveTo": "2026-11-01T09:00:00.000Z", "partial": false, "totalCents": "100", "ticketCount": "1", "unitsSold": "1"},
      {"start": "2026-11-01T09:00:00.000Z", "end": "2026-11-01T10:00:00.000Z", "localStart": "2026-11-01T01:00:00-08:00", "effectiveFrom": "2026-11-01T09:00:00.000Z", "effectiveTo": "2026-11-01T10:00:00.000Z", "partial": false, "totalCents": "200", "ticketCount": "1", "unitsSold": "1"}
    ]
  }
}
```

### Agregado grande y cero intermedio

Vector aritmético documental: dos **agregados de buckets**, `"9007199254740993"` y `"2"`, suman `"9007199254740995"` exactamente. No representan dos ventas individuales permitidas por BR-ORD-010 ni se deben sembrar como tales. En fixture futuro se construirá el agregado con ventas válidas o se probará la serialización/cálculo aisladamente, diferenciando prueba aritmética de factibilidad/coste del dataset. Un bucket intermedio sin ventas se incluye con las tres métricas cero y no altera la suma. Nunca usar Number para comprobarlo.

### Frontera mínima aceptada y negativos históricos

Entrada en la frontera: `from=2000-01-01T08:00:00.000Z`, `to=2000-01-02T08:00:00.000Z`, `granularity=day`. Bucket natural: `start=2000-01-01T08:00:00.000Z`, `end=2000-01-02T08:00:00.000Z`, `localStart=2000-01-01T00:00:00-08:00`, efectivos iguales a límites naturales y `partial=false`. Si no hay ventas, las tres métricas son `"0"`. Es un ejemplo documental, no ejecución HTTP.

Negativos: `from=2000-01-01T07:59:59.999Z` (1 ms antes), `2000-01-01T00:00:00Z`, `1999-12-31T23:59:59.999Z`, año 0000 y rango histórico 1880 → 400 `VALIDATION_ERROR`, sin truncar ni siquiera cuando `to` es posterior al mínimo. DTO con period/bucket antes del mínimo o `localStart` histórico con segundos → inválido; no admitirlo por ser sintácticamente una fecha. La comparación del mínimo es semántica adicional a patrones.

Patrón aceptado de `localStart` (también en OpenAPI):

```text
^[2-9]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):00:00-0[78]:00$
```

Las dos formas `2026-11-01T01:00:00-07:00` y `...-08:00` siguen representables, y 1880/offset con segundos queda excluido. El patrón no prueba que 31/02 exista ni que un offset corresponda a Tijuana en esa fecha: fecha real, identidad UTC y semántica IANA requieren comprobaciones adicionales. Los resultados nuevos se registran separados de las verificaciones previas y de las denegaciones históricas en validation.md; no presentar el chequeo de schema como runtime probado.

## Autorización, errores y privacidad aceptados

- ADMINISTRADOR con sesión vigente, backend revalida actor/rol usando capas existentes; sin sesión 401 `UNAUTHENTICATED`; CLIENTE, CAJERO y PREPARACION 403 `FORBIDDEN`, sin consulta de agregados. Must-change-PIN y Origin conservan sus códigos existentes; no nuevo rol ni permiso de lectura para cajero.
- Dentro del middleware privado: `Cache-Control: no-store`, `Referrer-Policy: no-referrer` para 200 y errores que lo atraviesen (validación, auth, dependencia). Rechazos globales anteriores de Origin/parsing/413/429 pueden carecer de cabeceras privadas. Límite documentado dentro del contrato aceptado; no atribuir cabeceras globales inexistentes ni modificar middleware en esta tarea documental.
- Errores `application/problem+json` con `type,title,status,detail,instance,code,requestId` y `errors` de validación cuando corresponda, según convenciones existentes; sin stack/SQL/PII. 400 `VALIDATION_ERROR`, 401/403 anteriores, 429 `RATE_LIMITED`, 413 `PAYLOAD_TOO_LARGE` global, 500 `INTERNAL_ERROR` inesperado y 503 `DEPENDENCY_UNAVAILABLE` solo para fallos reconocidos por `problemHandler`. No se inventa un mapeo nuevo ni se promete éxito con datos incompletos.
- No secretos/PII en DTO, URLs, fixtures, logs o evidencia. Usar cliente HTTP y sesión única existentes en frontend posterior; 401 delega en gestor común, 429 informa sin bucle. Fallo de series no anula caja/resumen correctos; sin fallback silencioso a páginas de ventas ni polling nuevo.

## Matriz RF → escenarios → verificación futura

Todos los resultados son **exigencias del contrato aceptado**, no pruebas runtime ejecutadas. OpenAPI no expresa todas las relaciones entre campos, fechas reales, mínimo UTC ni límites cruzados: backend y parsers deberán probarlas explícitamente en sus tareas posteriores.

| ID / RF-RNF | Escenario | Resultado exigido / evidencia futura |
| --- | --- | --- |
| S01 / RF-12 | CASH 4000/1/2 + STRIPE 4500/1/1, método omitido y ambos métodos por separado | 8500/2/3 mixto; cada método concilia resumen completo, no mezcla filtros; HTTP/BD E2-01, real E2-03 |
| S02 / RF-12 | Cero, bucket vacío intermedio, rango sin ventas | Todos los buckets intersectados y cero explícito; no array vacío para rango válido; contrato/BD/parser |
| S03 / RF-12, RNF-02 | Rango 08:15Z–09:15Z, extremos en límite exacto y un bucket | Dos parciales del ejemplo, efectivos contiguos; rango alineado sin bucket extra; generatedAt no determina partial |
| S04 / RNF-02 | Primavera 08/03/2026 y otoño 01/11/2026, hour/day | 23/25 horas o un día 23/25 h; sin 02 primavera, dos 01 otoño con start/offset distintos; 100+200=300 y 2 tickets |
| S04-F1 / RNF-02 | Dominio mínimo local 2000 y datos históricos anteriores | from=2000-01-01T08:00:00.000Z válido; from 1 ms antes, primeras ocho horas UTC de 2000, 1999 o LMT 1880 → 400 sin truncar, incluso si to está dentro; DTO histórico inválido. Política histórica anterior reemplazada por acotación aceptada |
| S05 / RF-03/12 | Venta en from, justo antes de from, en to y to−1μs | Solo from y to−1μs incluidas; conservar sold_at(6), no redondear fila; BD E2-01 y conciliación real |
| S06 / RNF-02 | Entradas sin fracción y con 1/2/3 decimales; 4/5/6 incluso cero | Válidas normalizadas ms; 4–6 rechazadas 400 E2 sin cambiar E1 |
| S07 / RF-01/19 | Sin sesión; CLIENTE/CAJERO/PREPARACION; admin válido | 401/403/200, sin agregación para denegados; cookies/revalidación y cabeceras según alcance middleware |
| S08 / RF-03/19 | Falta requerido, granularity/method inválidos, extras, repetidos iguales/distintos, arrays, vacíos y body no vacío | 400 sin consulta; parser global conserva 413/errores propios si se dispara antes; pruebas HTTP negativas |
| S09 / RNF-02 | 30/02, mes 13, hora 24, segundo 60, offset, from>=to, límite natural fuera dominio | 400 sin normalizar ni truncar; entradas imposibles no pasan solo por regex |
| S09-B1 / RNF-02 | Año 0000, 1999 o anterior en entrada y DTO: generatedAt, period.from/to, start/end/effectiveFrom/effectiveTo y localStart | Entrada rechazada 400; DTO inválido en cualquiera de esos campos. Patrones restringidos 2000–9999 y comparación de mínimo adicional en periodo/buckets; resultados documentales actuales en validation.md, no ejecución HTTP |
| S10 / RNF-06 | hour exactamente 744 h alineadas/no alineadas; +1 ms; day exactamente 366×24 h y +1 ms | Dentro de ambos topes 200, exceso duración 400; hour 744/745 buckets según alineación; validar además 745/368 como guardas sin exigir que todo exceso de buckets sea alcanzable con duración válida |
| S11 / RF-12 | Varias líneas/opciones/intentos; pendientes/fallidas/expiradas; reembolso | Tickets una vez, unidades por cantidad sin multiplicar, no ventas impagadas, bruto sin descuento; BD |
| S12 / RNF-02 | Agregados 9007199254740993 + 2; strings inválidas/DTO extra | Suma 9007199254740995 exacta; no venta individual inválida; esquema/parser/cálculo posterior |
| S13 / RF-12, RNF-06 | Totals, buckets y resúmenes con mismo filtro/dataset estable | Sumas exactas en las tres métricas; sales/summary importe/count; no joins multiplicadores/páginas/N+1 |
| S14 / RNF-06 | Venta concurrente durante consulta y entre dos peticiones | Cada respuesta internamente coherente; no exigir igualdad entre snapshots distintos ni tratar generatedAt como token |
| S15 / RF-11/19 | 429, fallo dependencia reconocido, otro inesperado, DTO inválido | Problem Details 429/503/500 según mapeo; sin ceros/fallback; FE posterior conserva otros paneles y sesión única |
| S16 / RNF-04/06 | Volumen/coste, aborto/cambio rápido de filtros, alternativa textual | E2-01 mide coste sin índices implícitos; E2-02 descarta respuesta antigua y prueba teclado/tabla/V-VIS; E2-03 integra real autorizado |

## Verificación de esta tarea y puertas pendientes

V-DOC (lectura de diff/enlaces/alcance) y V-CONTRACT: `npm.cmd run format:check`, `npm.cmd run api:validate` en backend; comprobación documental de ejemplos y relaciones donde sea viable sin runtime/BD. El validador existente revisa `example` singular; los JSON de este documento deben comprobarse aparte, no se atribuyen al contador del validador OpenAPI. `git diff --check` no se ejecuta por restricción expresa tras denegación previa, sin eludirla. Evidencia real de comandos/resultados se registra en [validation.md](../validation.md), no se presume por esta lista.

## Aceptación explícita registrada y límites

El responsable respondió **«aprobar y continuar»** tras la recomendación de acotar series E2 a fechas desde 2000, aceptando el contrato redactado con esa modificación. Se registran solo sus decisiones contractuales, no aprobación de código, pruebas runtime, medición de coste, infraestructura o composición visual:

1. Ruta/DTO cerrados, tres métricas siempre, sin `metric`, método omitido=null y agregados exactos sin máximo artificial de dígitos.
2. Precisión solo ms en entrada nueva, conservación de microsegundos de filas y conciliación con E1 en límites ms; E1 intacto.
3. Dominio mínimo 2000-01-01 00:00 Tijuana (08:00Z), rechazo 400 sin truncar de rangos anteriores. Buckets naturales Tijuana, identidad UTC/offset en DST, vacíos y recortes/partial por rango. Con esta acotación localStart vuelve a ISO/RFC 3339 con offset de minutos; queda reemplazada la propuesta histórica 0001–9999 y su política pendiente. E1 intacto.
4. Topes hour 31×24 h/745 y day 366×24 h/368, rechazo sin truncar y medición posterior; no SLA medido.
5. Consistencia interna única, generatedAt sin token compartido; suma buckets/totals/resúmenes con dataset estable.
6. Seguridad/errores existentes, incluyendo límite de cabeceras en rechazos globales previos; no modificación runtime ni de contratos antiguos.

E2-00 queda con aceptación explícita del responsable registrada; la disposición para commit y evidencia de revalidación se registra en validation.md sin atribuir resultados ni aprobación independiente inexistentes. No iniciar E2-01 ni crear commit en este encargo. Las autorizaciones de entornos/dataset, asignaciones y verificaciones de backend/frontend siguen siendo puertas de sus tareas posteriores; la baseline E1 no acepta automáticamente composición E2 ni entornos nuevos. CSV permanece en tareas propias al cierre E2.
