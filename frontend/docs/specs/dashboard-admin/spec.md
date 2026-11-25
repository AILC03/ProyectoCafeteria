# Spec DA-001 — Dashboard de administrador

- Estado: **aprobada por el responsable en esta conversación el 2026-11-24**. La aprobación de alcance no autoriza implementar tareas ni contratos concretos sin sus aprobaciones correspondientes.
- Fecha: 2026-11-23.
- Rama de elaboración: `feat/dashboard-admin`.
- Plan: [plan.md](./plan.md). Backlog: [tasks.md](./tasks.md).

> Spec, plan y backlog aceptados explícitamente por el responsable en esta conversación el 2026-11-24, incluida la ampliación CSV al cierre de E2. Los contratos concretos y decisiones de detalle siguen requiriendo aprobación propia; la ejecución se inicia mediante selección explícita de una tarea, una a la vez. No se autorizan migraciones, commits ni despliegues por extensión.

> Ampliación solicitada por el responsable: exportación **solo CSV como requisito de cierre de E2**, después de implementar su analítica. Incluye ventas filtradas y datos que alimentan las gráficas implementadas; no imágenes, PNG, XLSX ni gráficas editables. Esta ampliación no aprueba anticipadamente los contratos de exportación ni autoriza ejecutar tareas.

## Contexto y objetivo

Centralizar indicadores y tareas administrativas de la cafetería sin modificar reglas de negocio ni presentar información simulada como real. El administrador debe poder responder cuánto se vendió hoy, consultar ventas y caja, y gestionar catálogo y empleados desde una navegación estable.

Fuente funcional: **Propuesta de Dashboard Administrativo v1.1**, Leonel Durán, 19/11/2026, PDF local `C:\Users\angel\Downloads\Propuesta-Dashboard-Administrador-Propuesta-Dashboard-Administrador.pdf`. Referencias: secciones 3–8 para alcance/diseño/datos y 10 para aceptación; figura 1, página impresa 6 (página 7 del PDF), para composición visual. El PDF no se incorpora al repositorio y su disponibilidad para el equipo sigue pendiente.

Formato SDD inspirado en [habits-cli, spec 001](https://github.com/mouredev/hello-sdd/tree/main/habits-cli/specs/001-habits-mvp): contexto, historias, requisitos EARS, plan técnico y tareas verificables. No se copia su implementación ni se importan decisiones de ese proyecto.

## Evidencia del repositorio y diferencias con la propuesta

1. El frontend **ya está en este repositorio**. Existe `frontend/unified/` con React, TypeScript, Vite, React Router, Vitest, Testing Library, MSW, Playwright y axe. No es necesario iniciar otro repositorio.
2. `src/features/terminal/admin/AdminPage.tsx` ya tiene dashboard básico, catálogo, configuración y personal; el resumen usa `getSalesSummary({})` sin periodo explícito. Esta entrega amplía/reorganiza ese punto de entrada, no lo declara inexistente.
3. Ya existen ventas/historial, caja, cobro, cocina, disponibilidad y ticket protegido. Deben reutilizarse sin perder permisos, validación de respuestas ni protección ante resultados inciertos.
4. OpenAPI vigente: `backend/docs/api/openapi.yaml`, versión 0.11.0. No contiene los endpoints de agregación/listados administrativos de fase 2 del PDF.
5. La imagen se autoriza con `POST /admin/products/{id}/image-upload` y se asocia con `PUT /admin/products/{id}/image`; el resumen del PDF no sustituye estas rutas exactas.
6. El reset de NIP recibe `temporaryPin`, `reason`, `verificationSummary` y `recentSaleId`; responde 204. El servidor **no devuelve ni genera para la interfaz** el NIP temporal.
7. La documentación de unificación registra pruebas locales y migraciones aplicadas en ese contexto. No se asume el estado de otras bases ni un despliegue HTTPS validado. No ejecutar migraciones en esta entrega.

Fuentes normativas: [reglas](../../../../backend/docs/business-rules.md), [permisos](../../../../backend/docs/permissions.md), [OpenAPI](../../../../backend/docs/api/openapi.yaml), [flujo backend](../../../../backend/docs/workflow/README.md), [decisiones frontend](../frontend-unification/FRONTEND-UNIFICATION-DECISIONS.md) y [estado de unificación](../frontend-unification/FRONTEND-UNIFICATION-STATUS.md).

## Usuarios y matriz de permisos

| Actor | Dashboard `/terminal/administracion/*` | Operación permitida fuera del dashboard | Prohibiciones |
| --- | --- | --- | --- |
| ADMINISTRADOR | Sí | Operaciones de caja según responsabilidad, cocina y ventas | No historial/favoritos personales de clientes; no cancelar; no cobrar caja ajena |
| CAJERO | No | POS, caja propia, ventas, cocina y disponibilidad | No CRUD administrativo ni auditoría |
| PREPARACION | No | Cola EN_PREPARACION y marcar LISTO | No caja, ventas ni catálogo administrativo |
| CLIENTE | No | Área `/cliente/*` según propiedad | No terminal ni datos administrativos |
| Invitado / sin sesión | No | Rutas públicas existentes | No consultas administrativas |

No se añade GERENTE ni se amplían permisos por menciones históricas en documentos. La autorización del backend sigue siendo obligatoria; una guarda visual no la sustituye.

## Historias de usuario

- H1: Como administrador quiero entrar con mi sesión de personal y conservar el contexto al navegar.
- H2: Quiero consultar ventas registradas, tickets, promedio y mezcla de pago del periodo, y distinguirlos del estado de caja actual para revisar el negocio.
- H3: Quiero abrir una venta, su orden y su ticket sin repetir cobros.
- H4: Quiero gestionar catálogo y empleados conservando las restricciones actuales.
- H5: Quiero comparar periodos y distinguir productos más vendidos, menos vendidos y sin movimiento con datos completos.
- H6: Quiero consultar órdenes, clientes y caja histórica y revisar eventos/incidencias con mínimo acceso a datos personales.

## Alcance por entrega

### Estrategia aceptada — entregas verticales

No se construirá primero un dashboard provisional limitado a la API actual para sustituirlo después. Cada entrega incorpora contrato aprobado, backend con pruebas, interfaz integrada y evidencia de aceptación. Se reutilizan autenticación, catálogo, empleados, caja, ventas y ticket existentes sin reconstruirlos. No es necesario terminar toda la administración antes de entregar Inicio.

### E1 — Inicio administrativo integrado (primer MVP)

Shell administrativo, periodos y método de pago; resumen agregado con ventas registradas, tickets, ticket promedio, unidades, mezcla de pago y comparación del periodo anterior; estado de caja actual, últimas ventas y enlaces a detalle/ticket y flujos existentes de caja, catálogo y personal. Configuración básica reutiliza perfil, entorno y logout actuales.

El resumen requiere un contrato nuevo, candidato `GET /admin/dashboard/summary`, aprobado antes de implementarse. Promedio y comparación se calculan en backend, no en la interfaz ni desde páginas de ventas. El listado existente de ventas y los flujos administrativos actuales se reutilizan. La caja actual es independiente del periodo de ventas; no representa una caja histórica del rango seleccionado.

Series, rankings, categorías, listado global de órdenes y alertas sin fuente aprobada no son criterios de cierre de E1. Se omiten o identifican como capacidad pendiente sin datos ficticios. Una capacidad obligatoria de E1 no puede sustituirse por un placeholder para declarar terminado el MVP.

### E2 — Analítica prioritaria

Series horarias/diarias, productos más y menos vendidos y activos sin movimiento, con selector de métrica y top N. Cada capacidad se entrega tras aprobar su contrato y verificar la agregación. Participación por categoría se incorpora como ampliación explícita de esta entrega, no como filtro implícito de endpoints existentes.

Al finalizar la analítica, incorporar descarga CSV de ventas y de los datos de series/rankings/sin movimiento y categorías cuando estén implementadas. CSV contiene filas de datos, **no la imagen de la gráfica**. E2 no se considera completa sin esta exportación integrada y verificada.

### E3 — Operación de órdenes

Listado administrativo de órdenes, filtros y detalle, reutilizando acciones existentes de preparación/cobro según permisos. No se agrega cancelación ni cambio de responsable de caja.

### E4 — Administración adicional

Búsqueda/listado mínimo de clientes, correcciones y reset presencial, historial de caja, auditoría/incidencias y estado del sistema. Catálogo y empleados se reorganizan incrementalmente cuando sea necesario, conservando funcionalidades existentes. Las alertas requieren una tarea específica con fuente, umbral, vigencia y navegación definidos; no se infieren del wireframe.

CSV queda fuera de E1 y es obligatorio al cerrar E2. El acumulado histórico global sigue siendo opcional y requiere aprobación específica; no se añade como efecto de exportar ventas de un periodo. Los contratos se aprueban por capacidad, no todos de una vez.

### Puerta de aprobación por capacidad

1. Especificar método/ruta, parámetros estrictos, DTO y ejemplos, permisos, errores, privacidad, límites y semántica de datos en OpenAPI; obtener aprobación explícita del responsable y coordinar frontend/backend.
2. Acordar pruebas y una tarea atómica. Backend e interfaz pueden avanzar en paralelo sobre el mismo contrato aprobado y fixtures MSW, sin modificarlo unilateralmente; no implica delegación automática a agentes.
3. Integrar y verificar contra backend de ensayo autorizado, incluyendo permisos negativos y conciliación de cifras. Mocks no sustituyen esta comprobación.
4. Cerrar con revisión independiente antes de continuar. No se altera `/sales/summary` ni otro contrato existente para acomodar el dashboard sin aprobación específica.

### Exclusiones

Inventario, descuentos, promociones, propinas, factura fiscal, devoluciones generales, cancelación de órdenes, registro público, recuperación de NIP por correo, configuración real de Stripe/Cloudinary/correo, cambios al modelo de roles o al mecanismo de sesión y reescritura del POS o del portal cliente. Se mantienen cambios de rol de empleados y sustitución de sesión ya autorizados por las reglas vigentes. No se autorizan migraciones por esta spec: si una consulta requiere índices o cambios de esquema, necesitan análisis y aprobación propios. La consulta de incidencias no incluye resolverlas mediante mutaciones nuevas.

## Rutas y canales

Base actual: `/terminal/administracion/*`, protegida para ADMINISTRADOR. Se propone conservarla y añadir subrutas `ventas`, `ordenes`, `catalogo`, `clientes`, `empleados`, `caja`, `auditoria`, `configuracion`; el índice es Inicio. Los sufijos se aprueban en DA-D01 y deben mantener alias de rutas administrativas anteriores cuando proceda.

Públicas existentes: `/`, `/terminal/acceso`, `/cliente/iniciar-sesion`, `/cliente/registro-ticket` y catálogo público según guardas vigentes. Privadas de cliente: `/cliente/cuenta`; privadas de terminal: `/terminal/pos`, `/terminal/caja`, `/terminal/cobro`, `/terminal/historial`, `/terminal/cocina`, `/terminal/disponibilidad`. No se cambian sus permisos ni se redirige a todo el personal al dashboard.

Electron conserva arranque `/terminal`, origen HTTP(S) permitido, HTTPS empaquetado, bloqueo de `/cliente/**` y navegación de mismo origen. El dashboard vive bajo la terminal y no añade `file://`, offline, Node en renderer ni otro almacén de sesión. Se verifica navegador y Electron; no se retiran `clientes/` ni `empleados/`.

## Requisitos funcionales — EARS

| ID | Requisito verificable | Historia / entrega |
| --- | --- | --- |
| RF-01 | CUANDO un administrador autenticado entre al área, EL SISTEMA mostrará Inicio y navegación administrativa; SI entra otro actor, impedirá el acceso incluso con URL directa y no solicitará datos del dashboard. | H1 / E1 |
| RF-02 | CUANDO se intente sustituir una sesión cliente/personal, EL SISTEMA usará confirmación y logout del gestor existente; SI falla el logout, no iniciará la sustitución. | H1 / E1 |
| RF-03 | CUANDO se entre por primera vez a Inicio, EL SISTEMA seleccionará Hoy; CUANDO se elija hoy, 7 días, 30 días o rango personalizado, convertirá límites de America/Tijuana a UTC y usará `from` inclusivo y `to` exclusivo; SI el rango es inválido no consultará. La conservación de filtros al navegar y semántica de presets se aprueban en DA-D04. | H2 / E1 |
| RF-04 | CUANDO cargue un periodo/método, EL SISTEMA mostrará totales, tickets y mezcla por importe desde el contrato agregado aprobado, con etiqueta «Ventas registradas» y nota «Importe bruto; no descuenta reembolsos». Para idénticos filtros y datos, las métricas compartidas coincidirán con `/sales/summary`; no sumará la tabla paginada. | H2 / E1 |
| RF-05 | CUANDO se muestre ticket promedio, EL SISTEMA usará el agregado calculado por backend sobre total/tickets del conjunto filtrado, con precisión y redondeo acordados en DA-D03; SI no hay tickets, mostrará cero. Sin contrato y pruebas de esa regla no se dará E1 por terminada. | H2 / E1 |
| RF-06 | CUANDO se consulte caja actual, EL SISTEMA distinguirá abierta/cerrada y mostrará solo campos autorizados, independientemente del periodo/método de ventas; NO confundirá fondo inicial, esperado ni saldo disponible. Abrir/cerrar usará los flujos existentes y cierre ajeno exigirá motivo. | H2 / E1 |
| RF-07 | CUANDO cambien filtros, EL SISTEMA reiniciará cursor, resumen y tabla de forma coherente e ignorará respuestas de consultas anteriores; CUANDO se avance, enviará el cursor opaco sin modificarlo. | H3 / E1 |
| RF-08 | CUANDO se abra una venta desde Inicio, EL SISTEMA permitirá llegar a su detalle en como máximo dos acciones y consultar orden/ticket autorizados, sin cobrar, emitir permisos nuevos ni alterar históricos. | H3 / E1 |
| RF-09 | CUANDO se gestione catálogo, EL SISTEMA conservará validaciones de mínimos/máximos, bajas lógicas, restricción de categoría asociada y snapshots; la disponibilidad de cajero seguirá en su flujo. | H4 / E1 regresión; E4 reorganización |
| RF-10 | CUANDO se gestione personal, EL SISTEMA conservará motivos y restricciones de cuenta propia/caja abierta; la revocación de sesiones será responsabilidad del backend. | H4 / E1 regresión; E4 reorganización |
| RF-11 | MIENTRAS falte una capacidad o proveedor, EL SISTEMA mostrará «Pendiente de API», «Simulado» o «No disponible» según evidencia, sin solicitudes a rutas inventadas ni estadísticas ficticias. | Todas / E1–E4 |
| RF-12 | CUANDO se consulte Inicio, EL SISTEMA mostrará unidades agregadas por backend sobre ventas pagadas para el periodo/método; CUANDO se habiliten series, mostrará agregados horarios/diarios con los mismos filtros soportados y alternativa textual. | H5 / E1 unidades; E2 series |
| RF-13 | CUANDO se consulte ranking, EL SISTEMA indicará unidades o importe, top 5 por defecto y opciones 5/10/20; más/menos vendidos agruparán por productId y menos vendidos excluirá ceros. Sin movimiento será una lista separada de activos. | H5 / E2 |
| RF-14 | CUANDO se compare un periodo, EL SISTEMA mostrará variación absoluta/porcentual calculada por backend contra el anterior de igual duración; SI la base es cero, mostrará «Sin comparación». La categoría vigente podrá reclasificar históricos y deberá advertirse al habilitar esa analítica. | H5 / E1 comparación; E2 categoría |
| RF-15 | CUANDO se consulten órdenes, EL SISTEMA mostrará estados del contrato; solo permitirá LISTO desde EN_PREPARACION con pago confirmado y nunca cancelación. Antes de E3 solo ofrecerá consulta por ID/cola existentes, no pestañas globales falsas. | H6 / E1 consulta existente; E3 listado |
| RF-16 | CUANDO se busque cliente, EL SISTEMA mostrará datos mínimos autorizados; CUANDO se corrijan sus datos, exigirá motivo y auditoría backend. NO usará búsqueda exacta de caja como listado global ni accederá a `/customers/me` como administrador. | H6 / E4 |
| RF-17 | CUANDO se restablezca NIP, EL SISTEMA exigirá verificación presencial, venta reciente asociada y los cuatro campos de OpenAPI; el NIP temporal introducido se mantendrá solo en memoria, se limpiará al cerrar/finalizar y no aparecerá en respuesta, auditoría ni logs. | H6 / E4 |
| RF-18 | CUANDO se habiliten historial de caja/auditoría/incidencias/estado, EL SISTEMA consumirá consultas administrativas autorizadas, sin payloads sensibles ni acciones nuevas de resolución. | H6 / E4 |
| RF-19 | CUANDO ocurra 401, EL SISTEMA delegará renovación/expiración en el gestor único; SI ocurre 403 CSRF, recuperará token sin reenvío automático de mutaciones; SI ocurre 429, informará el límite sin bucle de reintentos. | Todas / E1–E4 |
| RF-20 | SI una mutación tiene resultado incierto, EL SISTEMA no confirmará éxito ni duplicará escritura; conservará bloqueo/reconciliación y reintento explícito del flujo existente. | H4, H6 / E1–E4 |
| RF-21 | CUANDO un administrador solicite exportar ventas, EL SISTEMA descargará un CSV generado por backend con todas las filas del periodo/método seleccionado dentro de los límites aprobados, no solo la página visible; SI el rango supera los límites, rechazará explícitamente sin truncar el archivo. | H3 / cierre E2 |
| RF-22 | CUANDO solicite exportar datos de una gráfica o ranking implementado, EL SISTEMA descargará CSV con el mismo periodo, filtros soportados, agrupación, métrica y top N aplicables; identificará estos parámetros en el archivo y no exportará imágenes ni sugerirá que CSV contiene una gráfica dibujada. | H5 / cierre E2 |
| RF-23 | CUANDO genere un CSV, EL SISTEMA verificará sesión y rol ADMINISTRADOR en backend, emitirá respuesta privada no-store y escapará delimitadores, comillas, saltos de línea y celdas de texto peligrosas para hojas de cálculo; excluirá datos personales innecesarios y secretos. | H3, H5 / cierre E2 |

## Datos y API

Todas las rutas siguientes tienen prefijo `/api/v1`. IDs, conteos e importes agregados permanecen como cadenas decimales; dinero en centavos enteros, MXN en presentación. No convertir identificadores ni sumas monetarias a `Number`. Los porcentajes/dibujo de gráficas requieren conversión acotada y probada, nunca sirven como fuente de totales.

| Capacidad | Contrato existente / brecha |
| --- | --- |
| Sesión | `/auth/csrf`, `/auth/login/staff`, `/auth/me`, `/auth/refresh`, `/auth/logout`; cambio de contraseña `/auth/password` existe, su UI se planifica aparte |
| Resumen / tabla | GET `/sales/summary?from&to&method`; GET `/sales?from&to&method&limit&cursor`; sin filtro categoría ni promedio en DTO actual |
| Orden / preparación | GET `/orders/{id}`, GET `/preparation/orders`, POST `/orders/{id}/ready` |
| Caja | GET `/cash-sessions/current`, GET `/cash-sessions/{id}`, POST `/cash-sessions`, POST `/cash-sessions/{id}/close` |
| Ticket | GET `/sales/{id}/ticket`; reutilizar lector protegido, no `ticket-access` para reimpresión |
| Catálogo | CRUD `/admin/categories`, `/admin/products`, `/admin/option-groups`, `/admin/option-values`; valores por grupo, configuración e imagen según rutas exactas de OpenAPI |
| Personal | GET/POST `/admin/employees`, PATCH `/admin/employees/{id}`; baja lógica, no DELETE |
| Clientes | POST `/cashier/customers/search`, PATCH `/admin/customers/{id}`, POST `/admin/customers/{id}/pin-reset`; no listado administrativo actual |

### Contratos candidatos por entrega — no aprobados ni disponibles

GET `/admin/dashboard/summary`, `/admin/dashboard/sales-series`, `/admin/dashboard/product-ranking`, `/admin/dashboard/sales-by-category`, `/admin/orders`, `/admin/customers`, `/admin/cash-sessions`, `/admin/audit-events`, `/admin/payment-incidents`, `/admin/system/status` y `/admin/sales/export.csv` para cierre de E2. Las rutas de CSV analítico se definirán en su contrato; no se presupone que el exportador de ventas sirva para todos los datasets.

Prioridad: summary en E1; series/ranking y ampliación de categorías en E2; orders en E3; clientes/caja histórica/auditoría/incidencias/estado en E4. La ruta definitiva y distribución de datos entre consultas se acuerdan al cerrar cada contrato; el resumen no debe hacer fallar todos los indicadores si la caja no está disponible.

Exportación al cierre de E2: contratos de lectura administrativos separados de los listados paginados; fijar columnas/orden, UTF-8, delimitador, escape/antifórmulas, importes con moneda y unidad inequívocas, fechas con zona explícita, metadatos de filtros/métrica/top N, nombres seguros de descarga y cabeceras `text/csv`/`Content-Disposition`. Conservar IDs/importes exactos en serialización, sin prometer que Excel preserve tipos al abrir CSV automáticamente. Definir rango/filas máximas, consistencia, respuesta sin resultados, errores y descarga segura. Nunca concatenar páginas visibles en frontend, truncar silenciosamente, recalcular series/rankings desde filas parciales ni guardar archivos privados en almacenamiento persistente sin aprobación.

El contrato de E1 debe definir rango y método, totales brutos, tickets, promedio, unidades, mezcla por importe y comparación con periodo previo, incluyendo los valores cero y ausencia de base. Precisará si la caja se consulta por su endpoint existente o se incluye como sección independiente, cómo informa su indisponibilidad y qué instante de actualización representa cada conjunto. La caja no se filtra por fechas ni método. No se fijan nombres de campos nuevos ni una respuesta JSON como aprobados en esta revisión.

Antes de implementarlos deben definirse DTO, parámetros estrictos, rango máximo, límites/cursor, roles, errores, privacidad, pruebas y coste. `includeZeroSales` del PDF no autoriza mezclar ceros con menos vendidos: definir respuesta separada o endpoint específico. No inferir rankings descargando páginas de `/sales` ni haciendo una llamada por orden.

Definiciones propuestas para aprobar: agrupación por producto sobre líneas de ventas pagadas; importe por suma de `lineTotalCents`; desempate por métrica secundaria, nombre y finalmente ID estable; nombre vigente con fallback a snapshot; categorías vigentes con advertencia; el contrato deberá fijar dirección de desempate, productos dados de baja y conciliación de totales por categoría. Comparación de periodos y días de cambio de horario se cierra en DA-D04.

## Requisitos no funcionales

- RNF-01: cookies HttpOnly, `credentials: include`, CSRF solo en memoria y gestor de refresh existente; sin JWT, NIP, contraseña, tokens de QR ni datos privados operativos en localStorage, URL, telemetría o logs. Limpieza al cambiar actor/logout.
- RNF-02: español de México, MXN, fechas en America/Tijuana; no usar offset UTC fijo. Probar cambios de horario, fin de mes y enteros mayores que `Number.MAX_SAFE_INTEGER`.
- RNF-03: estados carga, vacío, error recuperable, éxito y capacidad no disponible diferenciados por panel; caída de caja no invalida ventas correctas ni muestra caja cerrada por error.
- RNF-04: objetivo WCAG 2.1 AA: teclado, foco visible, etiquetas/errores, encabezados de tabla, diálogos con foco y retorno, Escape; gráficas con alternativa textual/tabular. Sin color como único indicador.
- RNF-05: referencia visual del PDF: barra lateral café oscuro, superficie crema, tarjetas claras, cifras tabulares, jerarquía sobria y alertas con texto. Comparar capturas a 1280 px y 768 px; consulta móvil sin desbordamiento general a 390 px. Antes de aceptación, compartir una referencia accesible al equipo y fijar altura, fixture, reloj y estado de cada captura; documentar diferencias deliberadas entre E1 y el diseño completo. La búsqueda global del wireframe no se activará sin fuentes/contrato aprobados.
- RNF-06: sin consultas N+1, acumulación de páginas para estadísticas ni polling no aprobado. Mostrar fecha de actualización; frecuencia pendiente DA-D05. No se compromete una latencia de API sin medir volumen/entorno.
- RNF-07: compatibilidad con navegador y wrapper Electron actual sin debilitar aislamiento, permisos ni navegación. Sin modo administrativo offline.

## Casos límite y aceptación

| Escenario | Resultado exigido | Cobertura |
| --- | --- | --- |
| Cero ventas | Importes/conteo cero verificados; promedio según RF-05; gráficos sin datos, no datos de ejemplo | RF-04/05/12 |
| Cambio rápido de periodo/página | Solo se aplica la consulta vigente y cursor reiniciado | RF-03/07 |
| DST y medianoche Tijuana | Límites UTC reales; ningún registro se duplica o pierde en bordes | RF-03/14, RNF-02 |
| Acceso por URL/rol incorrecto y sesión expirada | Sin datos privados ni solicitudes administrativas indebidas | RF-01/02/19 |
| Caja ajena / cuenta propia | Sin cobro ajeno, degradación propia ni cierre excepcional sin motivo | RF-06/10 |
| API caída o DTO inválido | Error o respuesta no verificable; nunca éxito/ceros inventados | RF-11/20, RNF-03 |
| Ranking con empates, inactivos y ceros | Orden determinista; sin movimiento separado; sin órdenes impagadas | RF-12/13 |
| Base comparativa cero | «Sin comparación», nunca infinito/NaN | RF-14 |
| Reset NIP con error o abandono | Sin persistencia/exposición del NIP ni repetición automática | RF-17/19/20 |

Finalización E1: contrato del resumen aprobado e implementado, totales/tickets/promedio/unidades/comparación reales, estado de caja actual y últimas ventas integrados, RF/RNF aplicables con pruebas identificadas, conciliación HTTP/BD y permisos negativos, regresión de rutas existentes, revisión independiente y capturas comparables aprobadas. No requiere reconstruir CRUD existente ni cerrar E2–E4.

Finalización E2–E4: por cada capacidad seleccionada, contrato aprobado, backend/frontend integrados, evidencia HTTP/BD con permisos negativos, conciliación de agregados cuando corresponda y revisión independiente. Los RF-09/10 se verifican como regresión en E1; su reorganización visual adicional no bloquea Inicio si los accesos y restricciones se conservan. Mocks no acreditan operación real de API/proveedores.

Además, cierre obligatorio E2: RF-21–23 verificados con descarga real, filtros coherentes, ventas de varias páginas incluidas, datos analíticos conciliados y casos CSV con acentos/comillas/saltos de línea/texto susceptible de fórmulas. Probar cero resultados, límites excedidos y roles incorrectos. No exige PNG, XLSX ni histórico global.

Metas de usabilidad propuestas del PDF: identificar ventas del día en menos de 10 s; rankings en menos de 15 s en E2; detalle en máximo dos acciones. Las metas de 80 % de uso y 90 % de incidencias detectadas requieren seguimiento real posterior y no son resultados de esta entrega.

## Riesgos y decisiones abiertas

| ID | Decisión propuesta / pregunta | Bloquea |
| --- | --- | --- |
| DA-D01 | Ampliar `frontend/unified` y conservar prefijo administrativo; aprobar subrutas y compatibilidad de enlaces | Shell/ruteo |
| DA-D02 | Reutilizar stack/CSS y gestión de datos actual; no añadir TanStack Query, RHF, Zod frontend, Recharts o Tailwind sin justificación/aprobación | Nuevas dependencias/diseño |
| DA-D03 | Promedio calculado en backend para E1; acordar representación y redondeo al cerrar el contrato. Propuesta: centavos enteros, mitades hacia arriba y cero sin tickets; no cálculo frontend | Contrato y aceptación E1 |
| DA-D04 | Confirmar medianoche Tijuana, presets inclusivos del día actual, conservación de filtros al navegar, periodos anteriores de igual duración y semántica ante DST; validar métrica/desempate y categoría vigente para E2 | Fechas E1 y analítica E2 |
| DA-D05 | Proponer recarga manual inicial; elegir después foco o polling 30 s y política de obsolescencia | Actualización automática |
| DA-D06 | Aprobar contratos por capacidad empezando por summary E1; cerrar DTO, errores, permisos, privacidad, coste y pruebas. Las fuentes de alertas/proveedores se acuerdan en E4 | Cada capacidad antes de código |
| DA-D07 | CSV aprobado en alcance para cierre E2; acordar contratos, columnas/metadatos, límites, formatos y descarga segura antes de implementar. Histórico global permanece opcional con aprobación separada | Contratos CSV E2; histórico opcional |
| DA-D08 | Validar identidad visual del PDF frente a marca existente y entregar PDF/wireframe accesible al equipo | Aceptación visual |

La estrategia de entregas verticales con backend desde E1 está **aceptada por el responsable en esta conversación**. Las decisiones de detalle de esta tabla que no consten cerradas en [validation.md](./validation.md) permanecen **pendientes**; no hay contratos específicos ni tareas aprobados por esta actualización. Registrar su aceptación explícita y límites antes de ejecutar la task afectada; decisiones transversales se incorporarán al registro frontend existente sin reescribir acuerdos previos.

**Cierre registrado en E1:** DA-D03/04/06 se resolvieron en el contrato y las tareas E1 según [validation.md](./validation.md). DA-D05 quedó en recarga manual sin polling para E1; el polling sigue no aprobado. **DA-D08 se cerró el 2026-11-24**: el responsable aprobó el diseño actual implementado como baseline visual de E1, sin comparación con el PDF (no accesible en el repositorio), y aceptó el desplazamiento horizontal de la tabla a 768/390. Riesgos principales: alcance excesivo (entregas separadas), contratos ausentes (bloqueo de la capacidad afectada), precisión/horario (pruebas), fuga de datos (mínimo privilegio), proveedores simulados (etiquetas), regresión de administración existente (migración incremental) y coste de agregación (mediciones e índices solo autorizados).

## Referencias normativas locales

- [Reglas de negocio](../../../../backend/docs/business-rules.md).
- [Permisos](../../../../backend/docs/permissions.md).
- [OpenAPI](../../../../backend/docs/api/openapi.yaml).
- [Flujo de cambios backend](../../../../backend/docs/workflow/README.md).
