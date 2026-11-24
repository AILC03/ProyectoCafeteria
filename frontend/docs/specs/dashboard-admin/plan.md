# Plan técnico — DA-001

Estado: **aprobado por el responsable en esta conversación el 2026-11-24, incluida la ampliación CSV al cierre de E2**. Fuente: [spec.md](./spec.md) y backlog [tasks.md](./tasks.md), también aceptados explícitamente. No se cambia código, OpenAPI, dependencias ni base de datos en esta entrega documental. La aceptación documental no inicia automáticamente ninguna tarea ni aprueba contratos pendientes.

Ampliación posterior solicitada por el responsable: CSV obligatorio al finalizar E2, para ventas y datos de analítica implementada; sin PNG/XLSX ni histórico global. Su contrato y tareas requieren aprobación antes de ejecutarse.

## Objetivo y orden de ejecución

Entregar Inicio con datos agregados reales desde el primer MVP, no construir un resumen provisional que deba reemplazarse después. Reutilizar autenticación, catálogo, empleados, ventas, caja y ticket existentes. Cada capacidad sigue contrato aprobado → tareas aprobadas → backend/frontend → integración → revisión independiente. Aprobar la spec no aprueba automáticamente este plan, los detalles de contrato ni las tareas.

| Entrega | Resultado | No bloquea su cierre |
| --- | --- | --- |
| E1 — Inicio integrado | Resumen de ventas, tickets, promedio, unidades, mezcla por importe, comparación; caja actual, últimas ventas y accesos protegidos | Series, rankings, alertas sin fuente aprobada y reorganización completa de CRUD |
| E2 — Analítica y cierre CSV | Series y rankings; sin movimiento separado; categorías como ampliación explícita; exportación CSV de ventas y datos analíticos implementados | Imágenes, XLSX e histórico global |
| E3 — Órdenes | Listado administrativo y detalle con acciones existentes autorizadas | Cancelación o cambios de responsable, excluidos |
| E4 — Administración adicional | Clientes, caja histórica, auditoría/incidencias/estado y reorganización incremental necesaria | Proveedores reales y opcionales no aprobados |

Las capacidades obligatorias de E1 no se sustituyen por placeholders para declararla terminada. Las posteriores pueden omitirse o mostrarse como pendientes, sin cifras ficticias ni peticiones a rutas ausentes.

## Estructura y reutilización

Base propuesta: `frontend/unified/`. Mantener React/TypeScript/Vite/React Router y pruebas existentes. La organización por features del PDF se adapta a la estructura real; no exige mover toda la aplicación.

| Módulo/archivo existente | Responsabilidad / cambio previsto | Requisitos |
| --- | --- | --- |
| `src/app/router.tsx`, `src/app/guards.tsx` | Anidar administración conservando guarda ADMINISTRADOR y aliases necesarios | RF-01/02 |
| `src/layouts/TerminalLayout.tsx` | Integración sin duplicar landmarks/navegación ni alterar roles operativos | RF-01, RNF-04/07 |
| `src/features/terminal/admin/AdminPage.tsx`, `adminApi.ts` | Integrar shell sin reconstruir CRUD; preservar parsers/bloqueos; extracción adicional en E4 cuando sea necesaria | RF-09/10/20 |
| `src/features/terminal/admin/dashboard/` (nuevo propuesto) | Inicio, paneles y adaptador validado del resumen nuevo; reutilizar cliente HTTP | RF-03–06/11/12/14 |
| `src/features/terminal/sales/salesApi.ts`, `history/HistoryPage.tsx` | Tabla, cursor y reimpresión; resumen actual como referencia de conciliación, sin modificar su DTO | RF-04/07/08 |
| `src/features/terminal/cash/`, `payment/`, `kitchen/` | Reutilizar flujos protegidos de caja, ticket, detalle y LISTO | RF-06/08/15 |
| `src/shared/api/client.ts`, `idempotency.ts`, `shared/auth/` | Mantener cookies, CSRF, refresh coordinado, sustitución de actor y resultados inciertos | RF-02/19/20 |
| `src/shared/utils/money.ts`; utilidades de periodo nuevas | Formateo exacto y conversión IANA, reloj inyectable para pruebas | RF-03/05, RNF-02 |
| `src/styles/base.css` y estilos administrativos acotados | Tokens/estados y responsive conforme PDF sin restilizar cliente/POS | RNF-04/05 |
| `src/features/terminal/admin/{analytics,customers,audit}/` (E2–E4 propuesto) | Lectores/DTO específicos, habilitados solo al aprobar contrato | RF-12–18 |
| `backend/docs/api/openapi.yaml` y pruebas/ejemplos de contrato | Contratos aditivos aprobados por capacidad, empezando por summary E1 | RF-04/05/12/14 |
| `backend/src/modules/sales/` y módulos vecinos `orders/`, `cash/` | Reutilizar consultas/reglas; ubicar agregación y transporte administrativo tras inspección de patrones vecinos; no asumir que existe módulo dashboard | RF-04–06/12/14 |
| `backend/src/modules/` y pruebas de integración de la capacidad | Validación estricta, autorización ADMINISTRADOR y agregación transaccional/coherente según contrato | RF-01/04/05/12/14/19 |
| `e2e/`, pruebas junto a componentes y APIs | Roles, filtros, sesión, regresión, accesibilidad y evidencia visual | Todos |

Los nombres nuevos son orientativos: confirmar en la task antes de crear archivos. No añadir bibliotecas sugeridas por el PDF como si ya estuvieran instaladas. No refactorizar autenticación ni distribuir cambios estéticos globales para construir el dashboard.

## Flujo de datos

1. Guarda de personal y rol existente → shell administrativo.
2. Inicio selecciona Hoy en America/Tijuana. Filtro validado → límites UTC → resumen agregado nuevo y últimas ventas con los mismos filtros soportados. Caja actual se consulta independientemente, sin filtro de fechas/método.
3. Adaptadores actuales y nuevos validan sus DTO antes de renderizar. Un panel fallido no reemplaza otro correcto por ceros. Preferir reutilizar `/cash-sessions/current` para aislar la caja; confirmar distribución definitiva al aprobar contrato E1.
4. Cambio de filtros invalida cursor y resultados anteriores mediante cancelación o identificador de consulta; desmontaje/logout limpia memoria privada.
5. Mutaciones conservan CSRF, idempotencia donde el contrato la define y reconciliación explícita. No se repiten automáticamente por error de red/CSRF.
6. Desde E1, promedio, unidades y comparación vienen de backend, nunca del listado parcial ni de cálculos del frontend. No enviar categoría a endpoints existentes que no la acepten.

## Contrato y precisión

- Mantener sin cambios los envelopes existentes: resumen `/sales/summary` `{ data: { count, totalCents, cashCents, stripeCents } }`; ventas `{ data: [...], page: { limit, nextCursor } }`. Definir el nuevo DTO administrativo en un contrato separado, sin extender el actual unilateralmente.
- Mantener strings decimales e importe histórico bruto. El formateador no cambia el valor original.
- Resolver DA-D03 en el contrato E1: promedio calculado por backend sobre total/tickets del conjunto completo, aritmética exacta y cero sin tickets. Propuesta pendiente: centavos enteros y mitades hacia arriba. El frontend solo formatea; no existe alternativa de derivación frontend en este plan.
- Resolver DA-D04 antes de utilidades temporales: IANA `America/Tijuana`, no UTC-8 fijo, intervalo semiabierto, pruebas DST y reloj inyectable. Una dependencia temporal nueva requiere DA-D02, no se instala por defecto.
- Definir si «7 días» son siete fechas locales incluyendo hoy y cómo se compara un día de 23/25 h. No ocultar esta diferencia detrás de un offset fijo.
- No mostrar «participación por tickets» usando importes: la mezcla de E1 es **por importe**; los campos exactos del DTO nuevo están pendientes de aprobación.

### Contrato E1 — checklist antes de implementar

Ruta candidata: `GET /api/v1/admin/dashboard/summary`, solo ADMINISTRADOR con sesión vigente y respuesta privada no-store. No se aprueba por aparecer en este plan. Reutilizar middleware, errores Problem Details y convenciones de OpenAPI existentes; no exigir CSRF nuevo a una lectura ni ampliar roles de `/sales/summary`.

El acuerdo de contrato debe cerrar:

- Entradas estrictas: límites UTC `from`/`to`, método opcional, rango permitido y comportamiento ante omisión, inválidos/campos extra; no categoría ni cursor salvo aprobación expresa.
- Totales brutos/tickets y mezcla coherentes con `/sales/summary`; unidades sobre partidas de ventas pagadas sin multiplicarlas por joins de opciones/pagos. No descontar reembolsos ni incluir órdenes pendientes/expiradas.
- Promedio y comparación: campos, representación exacta, redondeo, valores cero, base anterior cero, variación absoluta/porcentual y aplicación del mismo método en ambos periodos.
- Periodo anterior: límites y semántica DST según DA-D04; no confundir días de calendario con intervalos fijos de 24 h. El backend debe devolver o documentar límites efectivos que permitan verificarlo.
- Instante de actualización/consistencia de agregados, relación con listado separado y concurrencia; no exigir igualdad entre respuestas tomadas en momentos distintos con ventas nuevas. Conciliación sobre dataset controlado estable.
- Caja: fuente existente separada o sección independiente con indisponibilidad explícita; nunca interpretar un fallo como caja cerrada ni filtrar caja actual por el periodo de ventas.
- DTO sanitizado sin datos de cliente, ejemplos de éxito/cero/sin comparación, errores/roles negativos, límites de coste y pruebas vinculadas a RF.

Sin este cierre no se implementa el endpoint ni se consolida un mock como contrato oficial. No se asumen nombres de campos, parámetros nuevos o estructura de respuesta desde la figura del PDF.

## Entregas, dependencias y puertas de aceptación

### Preparación — decisiones y baseline

La spec ya está aprobada. Cerrar únicamente los detalles pendientes de la capacidad que se va a abordar: DA-D01/02 para integración/rutas/dependencias, DA-D03/04 para contrato/precisión/fechas, DA-D05 para actualización y DA-D08 para aceptación visual. Inventariar enlaces existentes y conservar baseline con fixtures identificadas. No reabrir alcance aprobado por rutina ni convertir el cronograma orientativo del PDF en compromiso.

Salida: plan aprobado, tareas actualizadas y decisiones requeridas registradas. El primer paso de trabajo propuesto es redactar el contrato E1 y sus escenarios, no implementar un dashboard limitado a API antigua. Su task documental también requiere aprobación explícita.

### E1 — Inicio integrado

Orden y dependencias propuestos para descomponer en tareas atómicas:

1. **Contrato y escenarios:** proponer OpenAPI/ejemplos/criterios del resumen; revisar consultas/modelos existentes y obtener aprobación. No escribir implementación en la task de contrato.
2. **Backend de resumen:** validación/roles, servicio y persistencia de agregados, pruebas HTTP/BD y contrato. Reutilizar capas existentes; confirmar ubicación de archivos tras investigar vecinos y evitar consultas SQL en controlador. No crear migraciones implícitas.
3. **Shell y periodos:** rutas/guardas, layout administrativo, reloj y límites IANA; pruebas de roles y periodos. Mantener enlaces hacia CRUD existente sin obligar a extraerlo entero.
4. **Resumen frontend:** adaptador estricto, tarjetas, promedio/unidades/comparación desde API, mezcla por importe, estados y actualización según decisión. MSW usa exactamente ejemplos aprobados.
5. **Caja/últimas ventas/detalle:** reutilizar lecturas y ticket existentes; reiniciar cursor al cambiar filtros e ignorar resultados antiguos. No cobrar ni emitir tokens nuevos desde consulta de ventas. Perfil/entorno/logout reutilizan sesión actual.
6. **Integración y aceptación E1:** backend de ensayo autorizado, conciliación, regresión de cliente/cajero/preparación/Electron, evidencia visual/teclado y revisión independiente.

Después de cerrar el contrato, backend y frontend **pueden desarrollarse como líneas de trabajo independientes** sobre sus mismos ejemplos; este plan no autoriza ejecución simultánea de tareas ni delegación a agentes por sí solo. El trabajo asistido mantiene una task aprobada a la vez, salvo encargo explícito de coordinación paralela. La integración final espera las dos partes verificadas.

Salida obligatoria: resumen real de ventas/tickets/promedio/unidades/comparación, caja actual y últimas ventas, detalle accesible en ≤2 acciones y navegación usable. RF-09/10 son regresión de administración existente, no requisito de reconstrucción. Series/rankings y alertas sin fuente aprobada no bloquean E1; ningún indicador obligatorio se declara entregado mediante placeholder.

### E2 — Analítica prioritaria

Orden: series horarias/diarias → ranking por unidades/importe → lista separada de activos sin movimiento; categoría como ampliación aprobada. Cada capacidad repite contrato, aprobación, backend y frontend probados e integración real. Definir máximo de rango/buckets, DST, top 5/10/20, desempates estables, inactivos/snapshots y denominadores.

Salida: agregados completos sobre ventas pagadas, sin inferir estadísticas de páginas de `/sales`, sin N+1 y con alternativa accesible a las gráficas. Categoría vigente lleva advertencia de reclasificación histórica; índices o snapshots nuevos requieren aprobación propia.

#### Cierre E2 — Exportación solo CSV

Después de implementar la analítica seleccionada, ejecutar tareas separadas de contrato CSV, backend, descarga frontend y aceptación real. RF-21–23 son obligatorios para cerrar E2; E1 no cambia.

- Ventas: generar en backend todas las filas del rango/método aprobado, independientemente de páginas visibles. Reutilizar consultas/semántica de ventas sin cambiar su contrato; no descargar páginas desde navegador para reconstruir un reporte.
- Analítica: reutilizar agregaciones de series/rankings/sin movimiento y categorías implementadas. Exportar datos, no dibujos; respetar agrupación, filtros y métrica/top N activos. No exigir exportación de categorías todavía no implementadas.
- Contratos: ruta candidata `/api/v1/admin/sales/export.csv` para ventas; acordar rutas analíticas, parámetros estrictos, columnas/metadatos, UTF-8, delimitador, importes/fechas/unidades, vacío, límites/rangos, consistencia y errores. No aprobar rutas o dependencias por mencionarlas en el plan.
- Backend: ADMINISTRADOR, sesión válida y no-store; cabeceras de descarga con nombre seguro; escape CSV y neutralización de textos que puedan interpretarse como fórmulas. Sin PII innecesaria ni archivos privados persistentes. Evaluar streaming o generación acotada según volumen aprobado; no truncar ni añadir colas/almacenamiento sin acuerdo.
- Frontend: descarga autenticada con cliente existente o adaptación acotada aprobada para respuesta binaria/textual; distinguir error Problem Details de CSV. Mostrar progreso/estado, impedir descargas duplicadas y liberar recursos temporales de navegador. No almacenar archivos ni introducir tokens en URL; no modificar gestor de refresh.
- Verificación: ventas de varias páginas, mismos filtros/dataset estable, agregados analíticos coincidentes, acentos/comillas/saltos de línea, fórmulas, enteros grandes, límites, cero resultados y 401/403/429. Descargar desde API real de ensayo y abrir un ejemplo en hoja de cálculo como compatibilidad, sin prometer tipado automático de CSV.

Salida: datos CSV completos y seguros, trazados a filtros/metadatos y verificados por responsables backend/frontend. No PNG, XLSX, PDF ni gráficas editables. El acumulado histórico global sigue fuera de alcance.

### E3 — Operación de órdenes

Contrato candidato de listado administrativo, con filtros/rango/cursor y datos mínimos. Reutilizar detalle, cola de cocina y transición LISTO, conservando pago confirmado y EN_PREPARACION; cobro solo con caja propia. Validar roles, estados, concurrencia y paginación. No cancelar ni cambiar responsable. Listado nuevo no amplía acceso al historial personal de clientes.

### E4 — Administración adicional

Seleccionar y aprobar capacidades por separado: consulta mínima de clientes → corrección → reset presencial; historial de caja; auditoría; incidencias; estado de sistema. No bloquear una consulta independiente por esperar todo el módulo. Motivo obligatorio para corrección, no para búsqueda por defecto; NIP temporal solo en memoria, nunca devuelto por el servidor ni registrado.

Las alertas tienen su propio contrato/tarea con fuente, umbral, vigencia, recarga y destino. GET de incidencias no autoriza resolverlas. Reorganización de catálogo/empleados y carga de imágenes se incorporan incrementalmente sin configurar Cloudinary real. CSV se entrega al cierre de E2; histórico global y cambio de contraseña adicional requieren alcance específico, no se añaden por extensión.

### Endurecimiento — transversal a cada entrega

Usabilidad, WCAG, comparación visual con figura 1 y estados reales, seguridad, coste de consultas con volumen representativo autorizado y backend de ensayo. No aplazar autorización/precisión/accesibilidad básica a una fase final. HTTPS/fallback SPA y distribución Electron se validan en entorno autorizado: no se acreditan por una build local. Registrar resultados y bloqueos reales por entrega.

## Estrategia de pruebas

- Unitarias: periodos/DST/reloj, dinero grande, formateo y parsers estrictos en frontend; promedio/variaciones y unidades en backend desde E1; rankings en E2; rechazo de datos no verificables.
- Componentes con MSW: éxito, cero, pendiente de API, carga, fallo parcial, 400, 401, 403 por rol/CSRF, 409 y 429; filtros rápidos y respuestas fuera de orden; doble clic y resultado incierto.
- E2E con API simulada: administrador → inicio → venta/ticket; CRUD autorizado; roles por URL directa; caja ajena; logout y cambio de actor entre pestañas; sin afirmar integración real por pasar mocks.
- Backend desde E1: pruebas HTTP/contrato y PostgreSQL aislado mediante runners existentes. Casos negativos sin sesión, CLIENTE/CAJERO/PREPARACION, entrada extra/rangos inválidos; ventas pagadas, líneas/opciones sin doble conteo, reembolsos brutos, base cero, redondeo y bordes UTC. No usar desarrollo/producción ni ejecutar resets.
- Visual/accesibilidad: referencia PDF accesible al equipo, capturas comparables de anchos 1280/768/390 con alturas acordadas y mismo fixture/reloj/estado; axe WCAG A/AA, teclado manual, contraste, diálogos y tablas/gráficas alternativas. Registrar diferencias deliberadas de E1 y aceptación humana.
- Integración real autorizada desde E1: conciliar métricas compartidas contra `/sales/summary` con idénticos parámetros y dataset estable; validar promedio/unidades/comparación mediante agregación esperada de fixtures BD. Probar que cambiar periodo no cambia el significado de caja actual. Validar ticket y navegación sin nuevo cobro. Evidencia sin secretos/PII.

### Comandos reales previstos (no ejecutados por redactar este plan)

Desde `frontend/unified/`: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run test`, `npm.cmd run test:e2e`, `npm.cmd run build`. Suites dirigidas pueden usar `npm.cmd run test -- <archivo>` y `npm.cmd run test:e2e -- <archivo>` una vez creadas. Revisar que haya pruebas ejecutadas: el script E2E admite cero tests y no basta como evidencia.

Desde `backend/`, para tareas aplicables desde E1: `npm.cmd run format:check`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run api:validate`; persistencia: `npm.cmd run db:validate`, `npm.cmd run test:integration`, `npm.cmd run db:verify` con base de prueba autorizada y Node 22 >=22.13 <23. No instalar/configurar servicios solo para esta documentación.

Desde raíz: `git diff --check`; revisar diff y archivos nuevos. Para dependencias futuras: lockfile y `npm.cmd audit`, sin `fix --force`.

## Migración, reversión y operación

- Cambios incrementales detrás de rutas existentes; registrar aliases antes de sustituir navegación. Conservar POS, cocina, caja e historial operativo como puntos de entrada.
- No borrar clientes/empleados legacy, cachés permitidas ni documentación histórica. La migración visual de otra rama no se presume integrada aquí.
- Despliegue propuesto: backend aditivo verificado antes de publicar la UI que lo consume. Versiones frontend previas siguen usando contratos anteriores; aprobar entorno y procedimiento antes de ejecutar despliegues.
- Reversión propuesta: retirar enlace/nuevas rutas y restaurar frontend anterior mediante despliegue autorizado; conservar contratos y datos. La UI antigua actual no es un fallback silencioso para declarar aceptada E1. Reversión de backend solo si no rompe consumidores nuevos; retirar primero sus dependencias o acordar compatibilidad. No reset de Git ni BD.
- No añadir bandera de feature/dependencia/configuración sin aprobación. Para E2–E4 no disponibles, UI de capacidad pendiente o exclusión explícita según spec, no degradación oculta de indicadores obligatorios de E1.
- Documentar entorno, API base y limitaciones sin secretos. No inferir estado real de Stripe/worker/Cloudinary de una constante visual.

## Responsabilidades y revisión

Propuesta de reparto del PDF: Enrique frontend, Ángel contratos/backend, Leonel consultas/datos; aceptación conjunta. Confirmar asignaciones en cada task. Revisión independiente obligatoria antes de cerrar; los roles indicados no equivalen a una asignación ya aceptada ni a una revisión ejecutada. No crear commit, push ni despliegue sin encargo.

## Próxima puerta SDD

Spec y plan están aprobados. Revisar y aprobar el backlog alineado en `tasks.md`, que registra la sustitución de los identificadores anteriores. Seleccionar y aprobar explícitamente una tarea antes de ejecutarla. La primera propuesta es TASK-DA-E1-00, contrato E1, sin implementación de runtime. Aprobar las tareas no equivale a aprobar anticipadamente el contrato que se redactará en esa tarea.
