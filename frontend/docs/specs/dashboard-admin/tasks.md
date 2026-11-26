# Tareas — DA-001

Actualizado: 2026-11-26. Fuentes: [spec.md](./spec.md) y [plan.md](./plan.md), **aprobados por el responsable en esta conversación el 2026-11-24**.

> **Estado vigente (2026-11-26) — leer primero.** E1 está cerrada y aceptada. **E2 está cerrada y aceptada** con las limitaciones registradas en [validation.md](./validation.md): series, ranking, activos sin movimiento y participación por categorías implementados, aceptados como capacidad y con sus pruebas live; exportación CSV de las cinco capacidades implementada, descargable y aceptada en CSV-03. E3, E4 y las capacidades opcionales **no se iniciaron**.
>
> **Commits existentes en `feat/dashboard-admin`** (locales, sin push): `e46905c` sin movimiento E2-10/E2-11 con refresco accesible; `c448481` API de categorías E2-13; `a766505` panel de categorías E2-14; `326cd07` aceptación live de categorías E2-15; `5149c3e` registro documental E2 y contratos CSV; `81a6b77` contrato CSV aceptado; `8df4a57` exportadores CSV-01; `06b788e` descargas CSV-02; `81f0e3e` aceptación real CSV-03 y cierre E2. Las menciones históricas «sin commit» de las secciones siguientes describen el instante de cada cierre y **no** el estado actual.
>
> **Correcciones del 2026-11-26** (posteriores al cierre, autorizadas por el responsable): rango anterior a 2000 ya no lanza en los paneles y deshabilita la exportación con mensaje accesible; liberación de la object URL garantizada si `click()`/`remove()` fallan. Se omitieron por decisión del responsable: foco de actualización en los demás paneles, atomicidad estricta de commits y evidencia nominal de la apertura en hoja de cálculo.

Estado del backlog: **aceptado explícitamente por el responsable el 2026-11-24**, junto con spec y plan; la descomposición TASK-DA-E2-00…15 fue aceptada posteriormente con la instrucción «haz commit y empieza con las tareas». Se autorizó ejecución secuencial E2 en el orden indicado abajo, una tarea a la vez y respetando precondiciones, verificación y revisión independiente. Los contratos nuevos siguieron requiriendo aceptación explícita antes de runtime. Las secciones de cada tarea conservan el estado del momento en que se cerraron; el bloque «Estado vigente» de arriba es la referencia actual. E1 conserva su cierre aceptado.

Ampliación aceptada dentro del backlog: exportación **solo CSV obligatoria al cierre de E2**, incluyendo ventas filtradas y datos de analítica implementada. Las tareas CSV mantienen su alcance aceptado y forman parte de la secuencia autorizada tras las aceptaciones analíticas; sus contratos no quedan aprobados ni su ejecución iniciada por este registro. PNG/XLSX e histórico global no se incluyen.

## Reglas de ejecución y sustitución del backlog anterior

- Orden SDD: spec aprobada → plan aprobado → backlog revisado → tarea concreta aprobada → ejecución → verificación y revisión independiente. Una tarea a la vez; el paralelismo entre responsables requiere encargo explícito, no implica delegación automática a agentes.
- Cada tarea termina como unidad revisable con pruebas/documentación propias. No dejar seguridad o evidencia obligatoria para la tarea final. Si surge una decisión nueva o cambia alcance aprobado, detener únicamente la parte afectada y solicitar resolución.
- El contrato E1 se redacta en la primera tarea. Su aprobación explícita es una puerta separada antes del backend o del adaptador frontend; aprobar este backlog no aprueba un DTO todavía inexistente.
- Asignaciones propuestas: Ángel backend/contrato, Enrique frontend, Leonel datos; confirmar ejecutor y revisor nominal antes de iniciar cada tarea. El revisor debe ser independiente del autor. Ningún nombre propuesto equivale a asignación aceptada.
- Las decisiones de detalle pendientes de la spec conservan ese estado hasta aceptación explícita registrada. No reabrir el alcance aprobado por rutina ni marcar propuestas como aceptadas.
- Los commits indicados son mensajes esperados, **no autorización de commit/push/despliegue**.
- Decisión posterior E2: el responsable aceptó el bloque y autorizó la secuencia 00…15 → CSV-00…03, sin paralelismo y con las puertas contractuales vigentes. Para TASK-DA-E2-00 quedan confirmados autor `dashboard-backend-implementer`, verificación `dashboard-verifier` y revisión independiente `dashboard-reviewer`; las asignaciones restantes se confirman antes de cada tarea. El commit del backlog fue autorizado al coordinador, no se ejecuta en este encargo documental ni autoriza push/despliegue.

### Sustitución explícita — no son tareas ejecutables vigentes

Los identificadores anteriores no registraban implementación. Se conservan aquí como trazabilidad; sus definiciones anteriores quedan sustituidas, no ejecutadas ni terminadas:

| Identificador anterior | Sustitución / motivo |
| --- | --- |
| TASK-DA-00 | TASK-DA-E1-00 y decisiones específicas previas a cada tarea; no exigir cerrar todo E4 para empezar Inicio |
| TASK-DA-01 | TASK-DA-E1-02, shell |
| TASK-DA-02 | TASK-DA-E1-03, periodos; promedio se traslada a backend E1-01 |
| TASK-DA-03 | TASK-DA-E1-04/05, resumen nuevo con promedio, unidades y comparación obligatorios |
| TASK-DA-04 | TASK-DA-E1-06, caja y últimas ventas |
| TASK-DA-05 | TASK-DA-E1-07, detalle y navegación reutilizados |
| TASK-DA-06/07 | EP-DA-E4-08/09, reorganización adicional; regresión CRUD en E1-02/09 |
| TASK-DA-08 | TASK-DA-E1-08, configuración básica |
| TASK-DA-09 | TASK-DA-E1-09, aceptación con backend real de ensayo |
| EP-DA-10 | E1-00/01/04/05; agregación, unidades y comparación ya no se posponen |
| EP-DA-11/12/13 | EP-DA-E2-01/02/03 |
| EP-DA-14 | EP-DA-E3-01 |
| EP-DA-15/16/17/18/19/20/21 | EP-DA-E4-01/02/03/04/05/06/07 |
| EP-DA-22/23/24/25 | EP-DA-E4-10; CSV en TASK-DA-E2-CSV-00…03; histórico en EP-DA-OPT-01; contraseña en EP-DA-OPT-02; aceptación por entrega |

## Verificación común

- **V-DOC:** revisar diff y archivos nuevos, trazabilidad RF → aceptación → prueba, enlaces locales y `git diff --check` desde raíz. Archivos nuevos no rastreados se revisan explícitamente: `git diff` no muestra su contenido por defecto.
- **V-CONTRACT:** desde `backend/`, `npm.cmd run format:check` y `npm.cmd run api:validate`, más pruebas documentales/contrato existentes aplicables. Si el generador exige modificar artefactos vecinos, identificar y revisar esos archivos sin alterar contratos ajenos.
- **V-BE:** desde `backend/`, `npm.cmd run format:check`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run api:validate`. Persistencia: `npm.cmd run db:validate`, `npm.cmd run test:integration`, `npm.cmd run db:verify` en entorno autorizado, Node >=22.13 <23; seguir runners y base de prueba aislada del flujo backend. No reset ni pruebas contra datos de desarrollo/producción. `npm test` no sustituye integración BD.
- **V-FE:** desde `frontend/unified/`, `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run test`, `npm.cmd run test:e2e`, `npm.cmd run build`. Pruebas dirigidas adicionales: `npm.cmd run test -- <archivo>` y `npm.cmd run test:e2e -- <archivo>` una vez creados. Registrar pruebas realmente ejecutadas; cero E2E no acredita cobertura.
- **V-VIS:** referencia PDF accesible al equipo, capturas a anchos 1280/768/390 con altura acordada, fixture/reloj/estado equivalentes, axe WCAG A/AA y teclado manual; documentar diferencias deliberadas de E1 y aprobación visual humana. Fixtures identificadas como pruebas.
- **V-REAL:** API de ensayo autorizada con dataset controlado estable; conciliar métricas y permisos sin exponer secretos/PII ni modificar bases reales. Diferenciar esta evidencia de MSW. Si no existe entorno autorizado, registrar bloqueo: no declarar E1 aceptada solo con mocks.
- Todas las tareas aplican V-DOC. Resultados, omitidos, bloqueos, decisiones y revisión se registran al cierre; no inventar pruebas ni aprobaciones.

## E1 — Inicio integrado: tareas atómicas propuestas

### TASK-DA-E1-00 — Contrato del resumen y escenarios

- Objetivo: acordar la interfaz backend/frontend de RF-04/05/12 (unidades)/14 (comparación), con RF-01/06/19 y RNF-01/02/03/06.
- Precondiciones: aprobación explícita de esta tarea; confirmar revisor; inspeccionar OpenAPI, esquema y módulos vecinos. DA-D03/04/06 se resuelven como parte del contrato, no se presumen aprobadas.
- Alcance / exclusiones: proponer GET administrativo de resumen, DTO/ejemplos, errores/roles, precisión/rangos y matriz de pruebas. No implementar rutas, servicio, consultas runtime, UI ni migraciones; no modificar `/sales/summary` ni permisos existentes.
- Archivos esperados: `backend/docs/api/openapi.yaml`, documentación de contrato/feature exigida por flujo existente y nota de decisiones/matriz de escenarios en esta carpeta o tarea backend; registro frontend existente para decisiones transversales aceptadas.
- Criterios de aceptación: parámetros estrictos, ADMINISTRADOR, no-store, totales brutos/tickets/unidades/mezcla por importe/promedio/comparación definidos; promedio y variaciones de backend con redondeo/representación explícitos; cero/base anterior cero; periodos efectivos y DST; límites de coste; caja actual independiente con fuente/indisponibilidad acordadas; actualización/consistencia; ejemplos sin PII y escenarios negativos. Misma semántica que ventas actuales para métricas comunes. Registrar aceptación o cambios solicitados sin autoaprobarlos.
- Verificación: V-CONTRACT; revisión de escenarios con dataset de ejemplo incluyendo opciones sin doble conteo, pagos fallidos, reembolsos brutos, cero, valores grandes y límites UTC. No atribuir ejecución HTTP a ejemplos documentales.
- Revisor: backend independiente y coordinación frontend/datos, por confirmar. El responsable aprueba el contrato resultante antes de E1-01/04.
- Commit esperado: `docs(dashboard-admin): define integrated summary contract`.

### TASK-DA-E1-01 — Backend del resumen integrado

- Objetivo: implementar el contrato aprobado de E1-00 (RF-04/05/12/14 y autorización RF-01).
- Precondiciones: E1-00 revisada y contrato aceptado explícitamente; decisiones temporales/precisión cerradas; entorno BD de prueba autorizado; aprobación de esta tarea.
- Alcance / exclusiones: unidad vertical backend de ruta/validación/autorización, servicio/repositorio, pruebas HTTP/BD y documentación. Solo lectura; sin UI, nuevos permisos, proveedores ni migraciones implícitas.
- Archivos esperados: módulo de ventas o módulo administrativo acordado tras inspección en `backend/src/modules/`, montaje de rutas y pruebas vecinas; artefactos de contrato solo para mantener sincronización aprobada. No asumir un módulo dashboard preexistente.
- Criterios de aceptación: DTO exacto y totales conciliables con `/sales/summary` sobre conjunto completo; unidades sin duplicación de joins; promedio/comparación exactos en servidor; pendientes/expiradas excluidas, reembolsos no restados; 401/403 negativos, rechazo de query extra/rangos inválidos; consistencia, no-store y límites según contrato. Caja no condiciona indiscriminadamente el resumen. Sin N+1 ni alteración de históricos.
- Verificación: V-BE; pruebas HTTP e integración PostgreSQL de los escenarios E1-00, incluidos DST, cero y base cero, redondeo, método y enteros grandes. No cerrar si falla una prueba obligatoria.
- Revisor: backend independiente con revisión de consultas por datos, por confirmar.
- Commit esperado: `feat(dashboard-admin): implement aggregated summary API`.

### TASK-DA-E1-02 — Shell administrativo y accesos existentes

- Objetivo: integrar Inicio y navegación protegida conservando operación (RF-01/02/09/10 y RNF-04/05/07).
- Precondiciones: aprobación de esta tarea; DA-D01/02 y detalles de diseño DA-D08 necesarios aceptados. No requiere terminar backend; no inicia tareas paralelas automáticamente.
- Alcance / exclusiones: layout/subrutas aprobadas y aliases; enlaces a catálogo/personal/caja/historial existentes. Sin reconstruir CRUD, cambiar sesión, agregar APIs ni activar búsqueda global ficticia.
- Archivos esperados: `frontend/unified/src/app/router.tsx`, `layouts/TerminalLayout.tsx` si procede, `features/terminal/admin/`, estilos acotados y pruebas router/componentes/E2E.
- Criterios de aceptación: solo administrador entra por navegación o URL directa; otros roles no disparan consultas administrativas; cajero/preparación conservan destino; CRUD existente accesible y guardas intactas; sin doble `main`; menú/foco/landmarks usables; estilos no afectan cliente/POS.
- Verificación: V-FE + V-VIS del shell; regresión de enlaces, roles y wrapper Electron sin debilitar aislamiento/origen.
- Revisor: frontend independiente, por confirmar.
- Commit esperado: `feat(dashboard-admin): integrate protected administrative shell`.

### TASK-DA-E1-03 — Periodos de negocio y presentación exacta

- Objetivo: filtros temporales comprobables de RF-03 y RNF-02.
- Precondiciones: contrato/decisión DA-D04 cerrados en E1-00; DA-D02 resuelta si requiere dependencia; aprobación de esta tarea.
- Alcance / exclusiones: reloj inyectable, límites IANA, presets/personalizado y conservación de filtros según decisión; formateo exacto de valores backend. No calcular promedio, variaciones o unidades en frontend.
- Archivos esperados: utilidades de periodo en `features/terminal/admin/` o shared según reutilización real, `shared/utils/money.ts` solo si necesario y pruebas unitarias.
- Criterios de aceptación: Hoy inicial, `from` inclusivo/`to` exclusivo; 7/30 días y rango inválido según contrato; DST 23/25 h, fin de mes y año sin UTC-8 fijo; identificadores/importes grandes permanecen exactos. Porcentajes se formatean según representación aprobada, sin reconstruirlos desde totales.
- Verificación: V-FE y tests dirigidos de límites con reloj inyectado; cotejar límites efectivos frontend/backend.
- Revisor: frontend independiente con validación temporal por backend/datos, por confirmar.
- Commit esperado: `feat(dashboard-admin): add exact business-period filters`.

### TASK-DA-E1-04 — Adaptador frontend del resumen nuevo

- Objetivo: lector tipado y verificable de RF-04/05/11/12/14/19, sin segundo cliente HTTP.
- Precondiciones: E1-00 y contrato aprobados; aprobación de esta tarea. Puede verificarse con MSW antes de disponibilidad runtime, sin declarar integración real.
- Alcance / exclusiones: query builder/DTO/parser/errores y fixtures exactas del contrato aprobado; usar `shared/api/client.ts` y gestor de sesión existentes. Sin UI ni fallback silencioso al resumen antiguo.
- Archivos esperados: adaptador y tests en `frontend/unified/src/features/terminal/admin/dashboard/`; fixtures MSW de prueba.
- Criterios de aceptación: campos/rangos/strings/semántica coherentes; rechaza datos no verificables, no convierte importes/IDs a Number; no consulta endpoint antes de guarda; 401/403/429 manejados por infraestructura y mensajes existentes; soporte de cancelación o descarte de respuestas antiguas según patrón acordado.
- Verificación: V-FE; tests de éxito/cero/base cero/DTO inválido, errores y filtros; no reintentos de mutaciones ni nuevo refresh manager.
- Revisor: frontend independiente, por confirmar.
- Commit esperado: `feat(dashboard-admin): add validated summary API adapter`.

### TASK-DA-E1-05 — Tarjetas de Inicio con analítica integrada

- Objetivo: mostrar RF-03/04/05/11/12 (unidades)/14 (comparación), RNF-03/04/05/06.
- Precondiciones: E1-02/03/04 cerradas; DA-D05/08 aceptadas; aprobación de esta tarea. E1-01 será obligatoria antes de aceptación real, no para pruebas aisladas MSW.
- Alcance / exclusiones: tarjetas de ventas/tickets/promedio/unidades/comparación, mezcla por importe y actualización visible. No series/rankings/categorías ni alertas sin fuente aprobada.
- Archivos esperados: componentes en `admin/dashboard/`, estilos acotados, tests de componentes y E2E.
- Criterios de aceptación: todos los indicadores obligatorios vienen del nuevo DTO sin recálculo frontend; nota de bruto; cero y «Sin comparación» correctos; carga/error/vacío/pendiente diferenciados; no éxito con DTO inválido; filtro actual prevalece ante carreras; sin polling no aprobado; alternativa textual a mezcla visual.
- Verificación: V-FE + V-VIS; pruebas MSW de estados y respuestas fuera de orden. La UI con mocks no acredita cierre de E1.
- Revisor: frontend independiente y aceptación visual del responsable, por confirmar.
- Commit esperado: `feat(dashboard-admin): render integrated business summary`.

### TASK-DA-E1-06 — Caja actual y últimas ventas

- Objetivo: contexto operativo de RF-06/07/08/11.
- Precondiciones: E1-02/03/05 cerradas; decisión de fuente de caja en E1-00; aprobación de esta tarea.
- Alcance / exclusiones: caja actual independiente, últimas ventas filtradas y accesos rápidos. Reutilizar `/cash-sessions/current` y `/sales` si así se aprobó; sin historial de caja, cobro ni operaciones nuevas.
- Archivos esperados: componentes de Inicio y tests, adaptadores `cash/` y `sales/` solo donde integración lo requiera.
- Criterios de aceptación: fechas/método afectan ventas, no significado de caja actual; fondo/esperado/responsable sin confusión; fallo de caja no produce estado cerrada ni anula resumen; ventas con cursor opaco y consultas antiguas descartadas; enlaces preservan permisos de caja propia/cierre excepcional.
- Verificación: V-FE + V-VIS; pruebas caja abierta/cerrada/ajena/error parcial, ventas vacías y cambio rápido de filtros.
- Revisor: frontend independiente con revisión funcional de caja, por confirmar.
- Commit esperado: `feat(dashboard-admin): connect current cash and latest sales`.

### TASK-DA-E1-07 — Detalle de venta, orden y ticket reutilizados

- Objetivo: RF-07/08/15 (consulta existente)/19 sin repetir cobros.
- Precondiciones: E1-06; contratos actuales de detalle/ticket; aprobación de esta tarea.
- Alcance / exclusiones: navegación desde últimas ventas y reutilización/extracción mínima de historial, detalle autorizado y ticket. Sin listado global de órdenes, CSV, filtro categoría ni emisión `ticket-access`.
- Archivos esperados: `features/terminal/history/HistoryPage.tsx`, `sales/`, lector protegido y `admin/` solo donde sea necesario; tests de navegación/componentes/E2E.
- Criterios de aceptación: detalle alcanzable en ≤2 acciones desde Inicio; orden/ticket asociados a venta correcta; CASH/STRIPE conservan reglas y campos nulos aplicables; ningún POST de cobro ni token nuevo al consultar/reimprimir; no romper historial de cajero ni copiar totales de filas como resumen.
- Verificación: V-FE; tests de navegación, filtros/cursor al regresar según decisión, permisos, errores y ausencia de escrituras al leer ticket.
- Revisor: frontend independiente, por confirmar.
- Commit esperado: `feat(dashboard-admin): reuse authorized sale detail and receipt`.

### TASK-DA-E1-08 — Configuración básica de sesión

- Objetivo: perfil/entorno/logout coherentes, RF-02/19 y RNF-01/07.
- Precondiciones: E1-02; aprobación de esta tarea.
- Alcance / exclusiones: nombre/usuario/rol, entorno verificable y logout existentes. Sin nuevo cambio de contraseña, cierre global no contratado ni segundo gestor de sesión.
- Archivos esperados: página/composición de configuración administrativa y pruebas usando `shared/auth/` actual.
- Criterios de aceptación: sin secretos, estado privado eliminado al salir/cambiar actor; logout fallido no permite sustitución; expiración/revocación usan infraestructura única; Electron conserva restricciones.
- Verificación: V-FE; tests logout/expiración, sustitución fallida y entre pestañas; inspección de almacenamiento/logs/URL sin secretos.
- Revisor: frontend independiente, por confirmar.
- Commit esperado: `feat(dashboard-admin): integrate existing session settings`.

### TASK-DA-E1-09 — Aceptación integrada del primer MVP

- Objetivo: acreditar E1 completa, RF/RNF aplicables, sin posponer datos obligatorios.
- Precondiciones: E1-00 a E1-08 cerradas/revisadas, contrato aceptado, entorno de ensayo y referencia visual autorizados; aprobación de esta tarea.
- Alcance / exclusiones: conciliación real, regresión, usabilidad/accesibilidad, evidencia visual y acta; no nuevas capacidades, despliegue, proveedores ni migraciones. Un defecto funcional significativo origina tarea correctiva aprobada; no se oculta como validación.
- Archivos esperados: suites de verificación E2E/integración necesarias y `frontend/docs/specs/dashboard-admin/validation.md` con matriz RF → prueba → evidencia y pendientes.
- Criterios de aceptación: ventas/tickets/promedio/unidades/comparación reales; backend/frontend coinciden sobre dataset estable; caja actual independiente; detalle en ≤2 acciones; ventas del día identificables en <10 s en prueba guiada; roles/CSRF/sesión y CRUD existentes sin regresión; precisión/DST y fallo parcial probados; capturas y teclado aceptados; operación Electron comprobada sin declarar HTTPS/distribución por build local.
- Verificación: V-BE + V-FE + V-VIS + V-REAL. Registrar resultados de comandos, prueba real, diferencia con mocks, revisiones y bloqueos. Falta de entorno real obligatorio impide declarar E1 aceptada.
- Revisor: independiente frontend/backend y aceptación funcional del responsable, por confirmar.
- Commit esperado: `test(dashboard-admin): validate integrated administrative MVP`.

## Dependencias E1

```text
E1-00 (redacción y aprobación del contrato) → E1-01 (backend)
E1-00 → E1-03 (periodos) y E1-04 (adaptador)
decisiones de rutas/diseño → E1-02 (shell)
E1-02 + E1-03 + E1-04 → E1-05 (tarjetas)
E1-05 → E1-06 (caja/ventas) → E1-07 (detalle)
E1-02 → E1-08 (sesión)
E1-00…08 cerradas → E1-09 (aceptación real)
```

El grafo expresa dependencias, no autorización de paralelismo ni de ejecución. E1-02 y E1-08 pueden adelantarse por selección explícita del responsable, sin evitar la aprobación del contrato para adaptador/backend.

## E2 — Analítica: backlog aceptado, ejecución secuencial autorizada

El responsable aceptó este bloque y autorizó ejecutar el orden recomendado: series (00…03) → ranking (04…07) → activos sin movimiento (08…11) → categorías (12…15) → CSV-00…03. **Una tarea a la vez, sin paralelismo**; avanzar solo tras satisfacer precondiciones y cerrar la anterior con verificación/revisión, deteniéndose en cada contrato nuevo hasta su aceptación explícita antes de runtime. No hace falta otra selección rutinaria dentro de esta secuencia autorizada; cambios de alcance o decisiones pendientes requieren resolución propia. Al commit del backlog ninguna tarea está iniciada ni contrato E2 aceptado. La siguiente autorizada es TASK-DA-E2-00, que no se inicia en esta edición documental. Las tareas de contrato solo redactan propuestas; ni su ejecución ni su revisión técnica autoaprueban el DTO resultante.

### Sustitución histórica E2

| Identificador anterior | Sustitución aceptada / motivo |
| --- | --- |
| EP-DA-E2-01 (antes EP-DA-11) | TASK-DA-E2-00…03: contrato, backend, frontend y aceptación real de series |
| EP-DA-E2-02 (antes EP-DA-12), ranking | TASK-DA-E2-04…07: ranking de productos con movimiento |
| EP-DA-E2-02 (antes EP-DA-12), sin movimiento | TASK-DA-E2-08…11: universo activo y contrato separados; no top de ceros |
| EP-DA-E2-03 (antes EP-DA-13) | TASK-DA-E2-12…15: categorías, ampliación de alcance ya aceptada, detalles pendientes |

Las épicas sustituidas se conservan como trazabilidad, no como tareas ejecutables ni como trabajo terminado. TASK-DA-E2-CSV-00…03 mantienen sus definiciones y función: CSV-03 es la única aceptación final y cierre E2; E2-03/07/11/15 aceptan capacidades, no cierran la entrega.

### Condiciones y criterios comunes E2 (parte obligatoria de cada tarea 00…15)

- **C-PRE:** backlog revisado/aceptado y secuencia autorizada por el responsable; iniciar cada tarea solo cuando corresponda en esa secuencia y sus precondiciones estén satisfechas. Autor y revisor nominales independientes se confirman antes de cada tarea: para E2-00 están confirmados `dashboard-backend-implementer` (autor), `dashboard-verifier` (verificación) y `dashboard-reviewer` (revisión independiente); las demás asignaciones siguen pendientes. DA-D04/06 se cierran por capacidad sin extrapolar el contrato E1. Las rutas de la spec son candidatas, no contratos aceptados; la ruta separada de sin movimiento también debe acordarse. En contratos se inspeccionan vecinos antes de redactar; backend/frontend/aceptación requieren aceptación explícita del contrato resultante, no solo de la tarea documental.
- **C-CONTRACT:** OpenAPI aditivo por capacidad: método/ruta, parámetros/query estrictos, body extra rechazado, DTO/ejemplos de éxito/cero/enteros grandes, metadatos de filtros, moneda/zona, `generatedAt` y consistencia; límites de rango/volumen y errores Problem Details saneados, incluidos 400/401/403/429/503 aplicables. Solo ADMINISTRADOR; sin sesión 401 y CLIENTE/CAJERO/PREPARACION 403; `Cache-Control: no-store` y `Referrer-Policy` según contrato acordado. Cookies/infraestructura existente, sin CSRF nuevo para lecturas ni ampliación de permisos antiguos. IDs/importes/conteos como strings decimales exactos, dinero en centavos; sin `Number` para IDs/importes. Resolver explícitamente precisión de límites con microsegundos frente a `Date` antes del runtime: el backlog no decide truncar, redondear ni cambiar E1. Registrar propuesta y aceptación o cambios solicitados, nunca autoaprobar.
- **C-DATA:** agregados sobre conjunto filtrado completo de ventas pagadas y método soportado, importe bruto sin descontar reembolsos, históricos intactos; excluir pendientes/fallidas/expiradas. Sin joins multiplicadores de opciones/intentos de pago, N+1, estadísticas desde páginas visibles ni precios actuales sustituyendo importes históricos. Backend calcula métricas, unidades, promedio, comparación o porcentajes aplicables; frontend solo presenta. Medir coste con volumen representativo autorizado y documentar plan/límites; no prometer latencia sin evidencia ni introducir índices por extensión.
- **C-UI:** reutilizar `frontend/unified/src/shared/api/client.ts`, guardas y sesión única; `shared/auth/` intacto. Parser estricto antes de renderizar; filtros inválidos no consultan, cancelación/descarte de respuestas antiguas al cambiar filtros/desmontar/logout. Estados carga/cero/error/DTO inválido/no disponible por panel y fallo parcial sin borrar paneles correctos ni inventar ceros. 401/403/429 sin refresh paralelo ni bucle de reintentos; recarga manual, sin polling nuevo. Formato exacto MXN/es-MX/Tijuana; alternativa tabular/textual, teclado/foco/axe y navegador/Electron sin debilitar aislamiento. No sumar ni recalcular agregados en UI; cualquier conversión acotada para dibujo necesita prueba y nunca es fuente de totales.
- **C-VIS/REAL:** baseline actual de E1 aprobado, no plantilla nueva por defecto. La composición E2 requiere referencia accesible acordada y V-VIS con capturas 1280/768/390, altura/fixture/reloj/estado comparables y aceptación humana propia. Cada aceptación real requiere autorización adecuada de API/BD/dataset controlado estable y usuarios QA; E1 no autoriza entornos nuevos, proveedores ni acceso a datos reales. Live sin mocks/intercepción, separado de `e2e/` en `e2e-live/`; omitidos no cuentan como aprobados. No inferir HTTPS/distribución por build local ni reutilizar evidencia E1 como aceptación E2.
- **C-LIMIT:** todas aplican V-DOC y registran RF → criterio → prueba/evidencia, comandos/resultados, omitidos, bloqueos y revisión en `validation.md` al cierre futuro. Sin dependencias, migraciones/índices, proveedores reales, reescritura histórica, cambios de negocio, contratos existentes, `.env`, STATUS de unificación ni commits por extensión. Los archivos nuevos indicados abajo son nombres propuestos concretos, a confirmar tras inspección; no autorizan refactor ajeno. Los mensajes de commit son esperados, **NO autorización** de commit/push/despliegue.

### TASK-DA-E2-00 — Contrato documental de series horarias/diarias

- Objetivo RF: RF-12 y RNF-02/04/06, con RF-01/03/11/19.
- Estado propio E2-00: **contrato documental aceptado por el responsable («aprobar y continuar»), acotado a fechas desde 2000; commit `mismo commit`**. [Contrato](./contracts/E2-series-contract.md) y OpenAPI `approved-2026-11-24`: mínimo 2000-01-01 00:00 Tijuana = 08:00Z, 400 explícito sin truncar si from es anterior; E1 intacto. Decisión histórica anterior resuelta por acotación; B1 excluye años fuera del dominio y B2 tiene revalidación actual correcta por el autor bajo el nuevo encargo, con revisión independiente final sin bloqueantes de contenido. Resultados/límites en [validation.md](./validation.md). Backlog previo `846aab6`; E2-01 no iniciada en el commit de E2-00.
- Precondiciones: C-PRE; tarea autorizada como primera de la secuencia, aún no iniciada al commit del backlog; autor `dashboard-backend-implementer`, verificación `dashboard-verifier`, revisión independiente `dashboard-reviewer` confirmados. Revisar resumen E1, filtros/consultas de ventas y precisión temporal existente; DA-D04/06 aplicables a series resueltas por el contrato aceptado; las de otras capacidades siguen pendientes.
- Alcance / exclusiones: C-CONTRACT y matriz de escenarios de series; solo documentación, sin rutas runtime, SQL ejecutable, UI ni contrato CSV.
- Archivos esperados: `backend/docs/api/openapi.yaml`, `frontend/docs/specs/dashboard-admin/contracts/E2-series-contract.md`, `validation.md` para registro futuro.
- Criterios de aceptación: definir `from` UTC inclusivo/`to` exclusivo y America/Tijuana, granularidad hora/día, métricas soportadas (importe/tickets/unidades), orden, buckets vacíos y parciales, rango máximo y máximo de buckets por granularidad. Definir identidad inequívoca de hora repetida/ausente en DST y días 23/25 h sin offset fijo; límites efectivos y metadatos/generatedAt/consistencia. Matriz exige que suma de buckets concilie con resumen completo para mismo método/dataset, sin duplicar tickets o unidades; incluir cero, bordes exactos y microsegundos. C-CONTRACT/C-DATA obligatorios; aceptación del responsable registrada el 2026-11-24 con dominio desde 2000; revisión independiente sin bloqueantes de contenido.
- Verificación: V-DOC + V-CONTRACT; revisión documental de ejemplos DST primavera/otoño, rango parcial/máximo/excedido, body/query extra y enteros grandes; no atribuir HTTP real a ejemplos.
- Revisor: `dashboard-reviewer`, independiente del autor `dashboard-backend-implementer`; verificación por `dashboard-verifier`, con coordinación datos/frontend para el contrato. La aceptación del contrato corresponde al responsable.
- Commit `mismo commit`: `docs(dashboard-admin): define E2 sales series contract`.

### TASK-DA-E2-01 — Backend de series

- Objetivo RF: RF-12, RF-01/03/19 y RNF-02/06.
- Precondiciones: C-PRE; E2-00 revisada y contrato de series explícitamente aceptado, decisiones temporales/límites resueltas y BD aislada autorizada.
- Alcance / exclusiones: ruta/validación, servicio/repositorio y pruebas HTTP/BD del contrato; sin UI, CSV, migraciones ni cambios del resumen E1.
- Archivos esperados: `backend/src/modules/sales/{sales.routes.ts,sales.validation.ts,sales.service.ts,sales.read.repository.ts}`, `backend/tests/dashboard-series.test.ts`, `backend/tests/integration/dashboard-series.integration.test.ts`; referencia/regresión en `backend/tests/integration/completion.integration.test.ts`.
- Criterios de aceptación: ejecutar todos los escenarios aceptados E2-00 y C-CONTRACT/C-DATA; conciliación exacta de sumas de importe/tickets/unidades con resumen completo por CASH/STRIPE y sin método sobre dataset estable. Probar buckets vacíos/parciales, orden, máximos/exceso, DST 23/25 h y hora repetida/ausente, límites y precisión acordada; fixtures con varias líneas/opciones/intentos/reembolso sin multiplicar. Roles negativos/cabeceras/body/query extra/fallo saneado y coste sin N+1 acreditados.
- Verificación: V-DOC + V-BE, unitarias y PostgreSQL aislado con matriz RF → escenarios E2-00; pruebas omitidas de integración bloquean cierre.
- Revisor: backend independiente y revisión de consultas por datos, por confirmar antes de ejecución.
- Commit `mismo commit`: `feat(dashboard-admin): implement E2 sales series API`.
- Estado propio E2-01: **implementada, verificada y aceptada por el responsable el 2026-11-24; commit `mismo commit`**. Evidencia real en [validation.md](./validation.md): unitarias y integración con `completion.integration.test.ts` intacto, cabeceras privadas también en 400, corchetes/arrays, S03 exacto, guarda 368 `day`, concurrencia S14, precisión `to−1 µs`, H-01 corregido con `/api/v1/admin/dashboard` en el middleware privado temprano y R-03 con error explícito ante fila agregada ausente. `format:check`, `typecheck`, `lint`, `test` (139), `build`, `api:validate` (67 ejemplos), `db:validate`, `test:integration` (155/155) y `db:verify:docker` (22 comprobaciones) correctos. Benchmark aislado con dos mediciones reales separadas: autor 20 000/744 h/745 buckets mediana 878.85 ms y EXPLAIN ~1.496 s; coordinador 20 000 mediana 642.99 ms y EXPLAIN 1.282 s. El responsable **acepta el rendimiento actual por ahora** y deja documentada una **optimización pendiente** (asignación de cada venta a un bucket una vez) sin cambiar contrato, índices ni migraciones en E2-01; la proyección a 100 000 no es una medida. E2-02 no iniciada en el commit de E2-01.

### TASK-DA-E2-02 — Frontend de series y alternativa accesible

- Objetivo RF: RF-12/03/11/19, RNF-02/03/04/05/06/07.
- Precondiciones: C-PRE; contrato E2-00 explícitamente aceptado y composición/referencia E2 acordadas. E2-01 requerida para integración real; MSW no acredita disponibilidad.
- Alcance / exclusiones: adaptador validado, selector hora/día y panel/tabla accesible; C-UI/C-VIS; sin nuevo cliente/sesión, biblioteca gráfica ni recálculo de buckets.
- Archivos esperados: `frontend/unified/src/features/terminal/admin/analytics/{seriesApi.ts,seriesApi.unit.test.ts,SalesSeries.tsx,SalesSeries.component.test.tsx}`, integración acotada en `admin/dashboard/DashboardSummary.tsx`, estilos en `src/styles/base.css`, `frontend/unified/e2e/dashboard-series.spec.ts`.
- Criterios de aceptación: representar métricas/buckets/metadatos del contrato sin sumar páginas ni rellenar huecos con datos inferidos; distinguir horas repetidas y días 23/25 h, parciales/vacíos y límites. Parser rechaza DTO/orden/identidad/filtros incompatibles según contrato; strings grandes exactos y alternativa textual equivalente. C-UI completo, pruebas de carreras/aborto, fallo parcial, roles y errores; capturas propias revisadas y aceptación visual humana pendiente/registrada, no heredada de E1.
- Verificación: V-DOC + V-FE + V-VIS; fixtures MSW exactas E2-00, DST, cero/grandes/errores/429 y respuesta antigua; la V-REAL propia de E2-02 puede apoyarse en la suite live de E2-03 como referencia, pero E2-03 no acepta E2-02.
- Revisor: frontend independiente con validación temporal por backend/datos y aceptación visual del responsable, por confirmar antes de ejecución.
- Commit de implementación `mismo commit`: `feat(dashboard-admin): present E2 sales series`.
- Estado propio E2-02: **implementada y verificada localmente; NO aceptada/cerrada; commit `mismo commit`**. Evidencia en [validation.md](./validation.md): adaptador estricto, selector Hora/Día con caída automática a Día en rangos >31 días, tabla accesible, DST/parciales/vacíos, aborto/descarte, estados independientes y fallo parcial aislado. Verificación local: `typecheck`, `lint`, `test` 410/410, `test:e2e` 62/62 y `build` correctos. Revisión independiente estática sin bloqueantes tras cerrar B-01 (mínimo 2000 semántico) y R-01 (fin de día = medianoche local siguiente); el verificador no pudo ejecutar shell por permisos y la evidencia de ejecución es del coordinador. **Su V-VIS propia y su aceptación siguen pendientes; la evidencia live de E2-03 es independiente y no concede aceptación a E2-02.** No se hereda aceptación de E1.

### TASK-DA-E2-03 — Aceptación real de series

- Objetivo RF: acreditar RF-12 y RNF-02/04/06, más RF/RNF transversales de series.
- Precondiciones: C-PRE; E2-00…02 revisadas, contrato aceptado, referencia visual y entorno/dataset autorizados específicamente según C-VIS/REAL.
- Alcance / exclusiones: conciliación navegador→API/BD, regresión y acta de series; no cerrar E2 ni agregar funcionalidades/correcciones mayores sin tarea propia.
- Archivos esperados: `frontend/unified/e2e-live/dashboard-series-acceptance.spec.ts`, `e2e-live/README.md`, `backend/tests/integration/dashboard-series.integration.test.ts` si falta evidencia y `frontend/docs/specs/dashboard-admin/validation.md`.
- Criterios de aceptación: evidencia sin mocks de suma de buckets igual a resumen completo (importe/tickets/unidades, mismo método y dataset), DST ambas transiciones/hora repetida, cero/parciales/máximos y precisión aprobada. Probar roles 401/403, cabeceras, errores/fallo parcial/cancelación y sesión sin regresión; coste documentado. V-VIS/teclado/alternativa y navegador/Electron acreditados; revisión independiente y aceptación humana de capacidad, sin sustituir CSV-03.
- Verificación: V-DOC + V-BE + V-FE + V-VIS + V-REAL; registrar comandos live dirigidos, dataset esperado y resultados sin PII/secretos; entorno ausente bloquea aceptación.
- Revisor: backend/frontend independientes, datos para conciliación y responsable para aceptación, por confirmar antes de ejecución.
- Commit esperado (no autorizado): `test(dashboard-admin): validate E2 sales series integration`.
- Estado propio E2-03: **suite live implementada, corregida, re-verificada y aceptada por el responsable el 2026-11-25; re-revisión final registrada sin bloqueantes técnicos; sin commit**. Evidencia en [validation.md](./validation.md): 7/7 live sin mocks en cuatro corridas (autor y verificador), conciliación por método con resumen y `/sales/summary`, DST con valores por hora repetida, parciales, precisión con ventanas de 1 ms, máximo 745, mínimo 2000, cero, roles/cabeceras 400/401/403, teclado, axe y cancelación real con `requestfailed`; coste 745 buckets 53–57 ms observado, no SLA. Revisión inicial con B-1/B-2: B-1 corregido; **B-2 aceptado formalmente por el responsable** (429/503/fallo parcial real quedan en simulación/integración; caos real diferido a tarea posterior autorizada). V-VIS/capturas aprobadas, incluido el desplazamiento horizontal en 768/390. No cierra E2; CSV-03 es el cierre.

### TASK-DA-E2-04 — Contrato documental de ranking

- Objetivo RF: RF-13, RF-01/03/19 y RNF-02/06.
- Precondiciones: C-PRE; DA-D04/06 ranking pendientes; inspeccionar líneas/snapshots y reglas de bajas del catálogo.
- Alcance / exclusiones: C-CONTRACT y escenarios de más/menos vendidos; sin runtime/UI/CSV ni incluir ceros activos como menos vendidos.
- Archivos esperados: `backend/docs/api/openapi.yaml`, `frontend/docs/specs/dashboard-admin/contracts/E2-ranking-contract.md`, `validation.md` para registro futuro.
- Criterios de aceptación: agrupar por `productId`, no nombre; ventas pagadas/brutas, unidades de cantidades e importe de líneas histórico (`lineTotalCents`), no precios actuales. Métrica unidades/importe, más/menos, top 5 default y opciones 5/10/20; menos excluye ceros. Definir direcciones de orden/desempates estables, tratamiento de inactivos/bajas y nombre vigente con fallback snapshot determinista; estos detalles quedaron aceptados en el paquete D01–D15 del 2026-11-25, sin autorizar runtime. Agregar conjunto completo antes de top N; precisar metadatos/límites/consistencia y escenarios de empates/nombres iguales/cambios de precio/reembolso/varias páginas. C-CONTRACT/C-DATA obligatorios; aceptación explícita del contrato registrada el 2026-11-25.
- Verificación: V-DOC + V-CONTRACT; ejemplos de ambas métricas/direcciones/tops, cero/grandes y negativos de entrada/roles/coste.
- Revisor: `dashboard-reviewer`; revisión independiente documental registrada en [validation.md](./validation.md).
- Commit esperado (no autorizado): `docs(dashboard-admin): define E2 product ranking contract`.
- Estado propio E2-04: **contrato documental aceptado por el responsable el 2026-11-25; verificado y revisado; commit pendiente de autorización; sin runtime**. Evidencia en [validation.md](./validation.md): OpenAPI aditivo con 68 ejemplos y `x-contract-status: approved-2026-11-25`, contrato con R01–R22, decisiones D01–D15 aceptadas en el paquete, vectores documentales y revisión sin bloqueantes. D11 se aceptó sin filtro defensivo por defecto; cualquier adopción futura requiere tarea propia. No inicia E2-05/06/07 ni cierra E2/CSV.

### TASK-DA-E2-05 — Backend de ranking

- Objetivo RF: RF-13, RF-01/19 y RNF-02/06.
- Precondiciones: C-PRE; E2-04 revisada y contrato explícitamente aceptado; desempates/snapshots/bajas resueltos y BD de prueba autorizada.
- Alcance / exclusiones: consulta agregada, servicio/validación/ruta y pruebas; sin lista de sin movimiento, UI ni CSV.
- Archivos esperados: `backend/src/modules/sales/{sales.routes.ts,sales.validation.ts,sales.service.ts,sales.read.repository.ts}`, `backend/tests/dashboard-ranking.test.ts`, `backend/tests/integration/dashboard-ranking.integration.test.ts`; regresión `completion.integration.test.ts` si procede.
- Criterios de aceptación: matriz E2-04 completa y C-CONTRACT/C-DATA; probar agrupación por ID con nombres iguales/cambiados, importe histórico frente a precio actual, sumas sin multiplicar opciones/intentos y reembolsos no restados. Ambas métricas, más/menos, tops 5/10/20/default, empates repetibles e inactivos/bajas/fallback aprobados. Fixture mayor al top y a una página acredita agregado previo al corte; menos nunca devuelve ceros. Método/rango/precisión/cabeceras/permisos/errores y coste verificados.
- Verificación: V-DOC + V-BE; unitarias y HTTP/PostgreSQL aislado de todos los escenarios E2-04, sin N+1.
- Revisor: backend independiente con revisión de consultas por datos, por confirmar antes de ejecución.
- Commit esperado (no autorizado): `feat(dashboard-admin): implement E2 product ranking API`.
- Estado propio E2-05: **backend implementado, verificado y revisado sin bloqueantes; commit pendiente de autorización**. Evidencia en [validation.md](./validation.md): validación estricta, CTE única por `product_id`, snapshot de baja determinista, orden/desempates `COLLATE "C"`, D11 sin filtro por defecto, DTO de strings exactos y ruta ADMINISTRADOR; 13 unitarias, 15 integraciones y 170/170 integración total, `format/typecheck/lint/test/build/api:validate/db:validate` correctos; benchmark real 20 000 ventas/30 000 líneas/120 productos con medianas ~48–49 ms, 1 agregación, sin índices nuevos y 100 000 no medido (no SLA). Residuales no bloqueantes registrados (µs discriminatorio, >2^53 E2E, wiring `adminRoutes`, errores Problem completos, 100k/366 días). No cierra E2/CSV.

### TASK-DA-E2-06 — Frontend de ranking

- Objetivo RF: RF-13/03/11/19, RNF-02/03/04/05/06/07.
- Precondiciones: C-PRE; contrato E2-04 aceptado y referencia/composición acordadas; E2-05 necesaria para integración real.
- Alcance / exclusiones: adaptador/parser, panel y alternativa tabular con selectores métrica/más-menos/top; sin ranking local, sin mezclar sin movimiento ni nuevo stack.
- Archivos esperados: `frontend/unified/src/features/terminal/admin/analytics/{rankingApi.ts,rankingApi.unit.test.ts,ProductRanking.tsx,ProductRanking.component.test.tsx}`, integración en `admin/dashboard/DashboardSummary.tsx`, estilos acotados `src/styles/base.css`, `frontend/unified/e2e/dashboard-ranking.spec.ts`.
- Criterios de aceptación: top 5 inicial y 5/10/20 con métrica inequívoca, orden/nombres/fallback recibidos sin reagrupar/ordenar por nombre; ceros excluidos de menos y sin movimiento separado. IDs/importes exactos, parser rechaza respuesta incompatible con filtros/contrato, no completar top con ceros ficticios. C-UI y C-VIS, estados/429/carreras/limpieza, accesibilidad y metadatos/actualización probados. Medir ranking <15 s en prueba guiada de aceptación, sin afirmar aquí resultado.
- Verificación: V-DOC + V-FE + V-VIS; MSW de métricas/tops/direcciones/empates/bajas/cero/grandes/errores; V-REAL en E2-07.
- Revisor: frontend independiente con datos/backend y aceptación visual humana, por confirmar antes de ejecución.
- Commit esperado (no autorizado): `feat(dashboard-admin): present E2 product rankings`.
- Estado propio E2-06: **frontend implementado, verificado, revisado y aceptado visualmente por el responsable el 2026-11-25; commit pendiente de autorización**. Evidencia en [validation.md](./validation.md): parser estricto, panel top 5/10/20, métricas/direcciones, tabla accesible, estados/fallo parcial, aborto/descarte y correcciones R-3/P-1…P-4/R-2/R-1; 512/512 unit/componente, 72/72 E2E, `typecheck/lint/build` correctos; capturas 1280/768/390 aprobadas con scroll horizontal. V-REAL y prueba guiada <15 s quedan en E2-07. No cierra E2/CSV.

### TASK-DA-E2-07 — Aceptación real de ranking

- Objetivo RF: RF-13 y RF/RNF transversales de ranking; usabilidad de rankings E2.
- Precondiciones: C-PRE; E2-04…06 revisadas/contrato aceptado, referencia y API/BD/dataset específicamente autorizados.
- Alcance / exclusiones: conciliación real y acta de ranking; sin cierre E2 ni aceptación de sin movimiento por extensión.
- Archivos esperados: `frontend/unified/e2e-live/dashboard-ranking-acceptance.spec.ts`, `e2e-live/README.md`, `backend/tests/integration/dashboard-ranking.integration.test.ts` si necesario y `frontend/docs/specs/dashboard-admin/validation.md`.
- Criterios de aceptación: ambas métricas/direcciones/tops coinciden con agregado independiente completo por ID/método/rango y corte posterior; empates, bajas/fallback, históricos, cero y grandes verificados. Roles/cabeceras/errores/carreras/fallo parcial/sesión y coste acreditados sin mocks. V-VIS/teclado/tabla/Electron y prueba guiada de ranking <15 s con resultado humano registrado, no supuesto; revisión y aceptación de capacidad independientes; CSV sigue pendiente.
- Verificación: V-DOC + V-BE + V-FE + V-VIS + V-REAL; registrar comandos live, volumen y resultados reales; omisión/entorno no autorizado bloquean cierre de capacidad.
- Revisor: frontend/backend independientes y datos, aceptación funcional del responsable, por confirmar antes de ejecución.
- Commit esperado (no autorizado): `test(dashboard-admin): validate E2 ranking integration`.
- Estado propio E2-07: **suite live implementada y verificada; prueba guiada de 4 segundos y aceptación del responsable registradas el 2026-11-25; CERRADA como capacidad de ranking; commit pendiente de autorización**. Evidencia en [validation.md](./validation.md): 4/4 live en tres corridas, conciliación ranking/resumen/`/sales/summary`, CASH/STRIPE, cero, roles/cabeceras, axe/teclado/carrera; capturas 1280/768/390/Electron. Limitaciones: sin caso truncado real (>5 productos), sin cambio de precio actual live, >2^53 unitario/integración, coste E2-05, CLIENTE/GERENTE y fallo parcial/sesión solo integración/simulación, aborto sin `requestfailed`. No cierra E2/CSV.

### TASK-DA-E2-08 — Contrato documental separado de activos sin movimiento

- Objetivo RF: RF-13 (lista separada), RF-01/03/19 y RNF-02/06.
- Precondiciones: C-PRE; DA-D04/06 propios pendientes; inspeccionar `Product`/`Category` y altas/bajas reales, sin asumir `Product.isActive`.
- Alcance / exclusiones: contrato/escenarios de universo activo y ausencia de ventas del rango/método; sin runtime/UI/CSV ni redefinir menos vendidos.
- Archivos esperados: `backend/docs/api/openapi.yaml`, `frontend/docs/specs/dashboard-admin/contracts/E2-no-movement-contract.md`, `validation.md` para registro futuro.
- Criterios de aceptación: definir «activo» considerando que Product tiene `deletedAt`/`isAvailable`, no `isActive`, y Category tiene `isActive`/`deletedAt`; fijar instante del universo, altas dentro/después del rango, disponibilidad/categoría, límites y paginación/orden estable. Definir efecto del método: vendido fuera del rango u otro método no implica movimiento dentro del filtro; ausencia en rango NO ausencia global. No limitar universo a catálogo visible, página o top N ni mezclar con ranking de ceros. DTO separado, metadatos/consistencia y C-CONTRACT/C-DATA; ejemplos más de una página, cero activos, altas y bordes. Aceptación explícita del detalle pendiente.
- Verificación: V-DOC + V-CONTRACT; revisión datos/catálogo de matriz activo/no activo × alta × método × venta dentro/fuera, coste y privacidad.
- Revisor: backend independiente con catálogo/datos/frontend, por confirmar antes de ejecución.
- Commit esperado (no autorizado): `docs(dashboard-admin): define E2 no-movement contract`.
- Estado propio E2-08: **contrato documental aceptado por delegación del responsable el 2026-11-25; verificado sin bloqueantes; sin runtime ni commit**. Evidencia en [validation.md](./validation.md): ruta `/admin/dashboard/no-movement-products`, universo activo por `deletedAt`/categoría sin `Product.isActive`, cohorte `createdAt < to`, ausencia por rango/método, cursor keyset propio, `totalNoMovementProducts`, R01–R20/D01–D10; OpenAPI `approved-2026-11-25`, 69 ejemplos. No inicia E2-09 ni cierra E2/CSV.

### TASK-DA-E2-09 — Backend de activos sin movimiento

- Objetivo RF: RF-13, RF-01/19 y RNF-02/06.
- Precondiciones: C-PRE; E2-08 revisada y contrato explícitamente aceptado, definición de activo/altas/método/paginación resuelta; BD aislada autorizada.
- Alcance / exclusiones: ruta separada, validación/servicio/repositorio y pruebas; sin modificar flags de catálogo ni agregar esquema, top de ceros o CSV.
- Archivos esperados: `backend/src/modules/sales/{sales.routes.ts,sales.validation.ts,sales.service.ts,sales.read.repository.ts}`, `backend/tests/dashboard-no-movement.test.ts`, `backend/tests/integration/dashboard-no-movement.integration.test.ts`; lectura de catálogo existente sin reescritura.
- Criterios de aceptación: universo/ausencia según E2-08 sobre conjunto completo; fixtures de venta fuera de rango y por otro método, altas dentro/después, disponible/agotado/baja y categoría inactiva/baja según reglas aceptadas. Más de una página sin omitir/duplicar ni truncar a top N; orden/cursor/límites/filtros estrictos y bordes temporales aprobados. C-CONTRACT/C-DATA, roles/cabeceras/errores, precisión y coste sin N+1 comprobados.
- Verificación: V-DOC + V-BE; matriz E2-08 en unitarias y HTTP/PostgreSQL aislado, permisos negativos y paginación estable.
- Revisor: backend independiente con datos/catálogo, por confirmar antes de ejecución.
- Commit esperado (no autorizado): `feat(dashboard-admin): implement E2 no-movement API`.
- Estado propio E2-09: **backend implementado, verificado y revisado sin bloqueantes de código; commit pendiente de autorización**. Evidencia en [validation.md](./validation.md): 18 unitarias, 9 integraciones (179/179 total), `format/typecheck/lint/build/api:validate/db:validate/db:verify` correctos, benchmark 15 000 ventas/2 000 productos con medianas ~17–22 ms y Hash Anti Join, R-1 de cursor corregido. Residuales R-2/R-3 documentados. No cierra E2/CSV.

### TASK-DA-E2-10 — Frontend de lista separada sin movimiento

- Objetivo RF: RF-13/03/11/19, RNF-02/03/04/05/06/07.
- Precondiciones: C-PRE; E2-08 y contrato explícitamente aceptados, composición/referencia acordadas; E2-09 para integración real.
- Alcance / exclusiones: adaptador/parser, lista/paginación y explicación del universo/filtros; sin calcular ausencias descargando ventas/catálogo ni reutilizar top N como límite.
- Archivos esperados: `frontend/unified/src/features/terminal/admin/analytics/{noMovementApi.ts,noMovementApi.unit.test.ts,NoMovementProducts.tsx,NoMovementProducts.component.test.tsx}`, integración `admin/dashboard/DashboardSummary.tsx`, estilos acotados `src/styles/base.css`, `frontend/unified/e2e/dashboard-no-movement.spec.ts`.
- Criterios de aceptación: lista separada de menos vendidos y etiqueta «sin movimiento en el rango/método» sin afirmar ausencia global; mostrar definición activa aprobada y paginación sin ocultar conjunto. Cursor opaco/filtros reiniciados, sin límites top N ni datos deducidos; parser estricto/IDs grandes y C-UI completos. C-VIS con tabla/teclado/estados, fallo parcial y carreras; no llamar APIs antes de guarda ni cambiar sesión.
- Verificación: V-DOC + V-FE + V-VIS; MSW de varias páginas, vacío/altas/método/errores/429/respuestas antiguas, V-REAL en E2-11.
- Revisor: frontend independiente con datos/catálogo y aceptación visual humana, por confirmar antes de ejecución.
- Commit esperado (no autorizado): `feat(dashboard-admin): present E2 no-movement products`.
- Estado propio E2-10: **implementado, verificado, revisado y aceptado visualmente por el responsable el 2026-11-25; commit pendiente de autorización**. Evidencia en [validation.md](./validation.md): 622/622 unit/componente, 78/78 E2E, parser/cursor/DTO, etiqueta de rango/método, paginación Cargar más, estados/fallo parcial/aborto, tabla accesible; capturas 1280/768/390 generadas. El responsable confirmó el ajuste intuitivo definitivo con «1. apruebo como quedo 2. aprobado». Los defectos live nuevos de E2-11 se registran aparte, sin borrar esta aceptación histórica. No cierra E2/CSV.

### TASK-DA-E2-11 — Aceptación real de activos sin movimiento

- Objetivo RF: RF-13 y RF/RNF transversales de esta lista separada.
- Precondiciones: C-PRE; E2-08…10 revisadas y contrato aceptado; entorno/dataset y referencia autorizados específicamente.
- Alcance / exclusiones: demostrar universo/ausencia/paginación reales y registrar acta; no cierre E2 ni cambios de reglas del catálogo.
- Archivos esperados: `frontend/unified/e2e-live/dashboard-no-movement-acceptance.spec.ts`, `e2e-live/README.md`, `backend/tests/integration/dashboard-no-movement.integration.test.ts` si necesario y `frontend/docs/specs/dashboard-admin/validation.md`.
- Criterios de aceptación: conciliar lista completa con universo activo acordado y ausencia solo en rango/método; acreditar vendidos fuera/otro método, altas dentro/después, bajas/categorías y más de una página sin corte top N. Roles/cabeceras/precisión/límites/errores/carreras/fallo parcial/sesión y coste con evidencia real; C-VIS/REAL, navegador/Electron, teclado y revisión independiente/aceptación humana. Sin mocks como sustituto ni inferir aceptación de CSV.
- Verificación: V-DOC + V-BE + V-FE + V-VIS + V-REAL; comandos live dirigidos y resultados/omitidos registrados, sin entorno autorizado no cerrar.
- Revisor: backend/frontend independientes con datos/catálogo, aceptación del responsable, por confirmar antes de ejecución.
- Commit esperado (no autorizado): `test(dashboard-admin): validate E2 no-movement integration`.
- Estado propio E2-11: **CERRADA Y ACEPTADA por el responsable el 2026-11-25 con limitaciones registradas; sin commit**. Secuencia: correctiva B01/B02 cerrada técnicamente por `frontend-implementer` (autor), `dashboard-verifier` y `dashboard-reviewer`; ampliación QA aislada con **solo INSERT** (+12 productos/+1 categoría/+3 ventas/+1 reembolso/+3 cuentas, huella de originales intacta) y oráculo SQL independiente en **30 cortes × 10/20/50**; verificación independiente con **12 live correctas / 2 omitidas** y revisión independiente sin nuevos bloqueantes técnicos. El responsable respondió «acepto 1 y 2 y las referencias visuales»: difiere como **no probados** los dos omitidos (R20 caos/fallo parcial/DTO inválido live y expiración/refresh/multipestaña), autoriza las aclaraciones editoriales R18/D09 aplicadas en el contrato sin cambiar DTO ni permisos, y acepta las capturas sanitizadas de panel en 1280/768/390 y Electron. No consta recorrido manual de teclado ni prueba guiada humana: se registra como limitación, no como prueba ejecutada. Detalle completo en [validation.md](./validation.md). No cierra E2/CSV.

### TASK-DA-E2-12 — Contrato documental de participación por categorías

- Objetivo RF: RF-12/14, ampliación E2 aceptada en alcance; RF-01/03/19 y RNF-02/06.
- Precondiciones: C-PRE; DA-D04/06 de categorías pendientes; inspeccionar relaciones actuales y ausencia de snapshot de categoría.
- Alcance / exclusiones: C-CONTRACT y escenarios de agrupación por categoría vigente; sin runtime/UI/CSV, snapshot nuevo ni filtro de categoría por extensión.
- Archivos esperados: `backend/docs/api/openapi.yaml`, `frontend/docs/specs/dashboard-admin/contracts/E2-categories-contract.md`, `validation.md` para registro futuro.
- Criterios de aceptación: documentar categoría vigente, no categoría histórica inexistente; definir métricas (importe/unidades y cualquier otra explícitamente aceptada), denominadores, representación/redondeo de porcentajes backend, base cero, ceros, orden, inactivas/bajas y reclasificación. Acordar conciliación de importes/unidades con resumen completo mismo método/dataset y comportamiento de residuos de redondeo sin forzar 100% silenciosamente. Advertencia UI sobre reclasificación obligatoria. C-CONTRACT/C-DATA, límites/coste/consistencia y ejemplos cambio de categoría/precio, grandes y cero. No enviar categoría a rutas antiguas ni introducir filtro nuevo sin acuerdo específico; aceptación de alcance no aprueba DTO/denominadores.
- Verificación: V-DOC + V-CONTRACT; matriz de conciliación y porcentajes, revisión datos/backend/frontend; registrar aceptación explícita posterior.
- Revisor: backend independiente con datos/catálogo/frontend, por confirmar antes de ejecución.
- Commit esperado (no autorizado): `docs(dashboard-admin): define E2 category analytics contract`.
- Estado propio E2-12: **contrato documental aceptado por delegación del responsable el 2026-11-25; verificación documental y revisión independiente sin bloqueantes; commit pendiente de autorización; sin runtime**. Evidencia en [validation.md](./validation.md): ruta `/admin/dashboard/category-participation`, categoría vigente/reclasificación, denominadores/porcentajes half-up, conciliación, R01–R18, OpenAPI 70 ejemplos. Revisión `dashboard-reviewer` sin bloqueantes y observaciones editoriales aplicadas (cota de residuo inclusiva, cabeceras/montaje temprano, R18 desdoblada, nota de ruta candidata, base cero solo `metric=amount`). No inicia E2-13/14/15 ni cierra E2/CSV.

### TASK-DA-E2-13 — Backend de participación por categorías

- Objetivo RF: RF-12/14, RF-01/19 y RNF-02/06.
- Precondiciones: C-PRE; E2-12 revisada/contrato explícitamente aceptado, denominadores/redondeo/bajas resueltos y BD aislada autorizada.
- Alcance / exclusiones: ruta/validación/servicio/repositorio, porcentajes backend y pruebas; sin UI, snapshot categoría, filtro a rutas antiguas ni CSV.
- Archivos esperados: `backend/src/modules/sales/{sales.routes.ts,sales.validation.ts,sales.service.ts,sales.read.repository.ts}`, `backend/tests/dashboard-categories.test.ts`, `backend/tests/integration/dashboard-categories.integration.test.ts`; regresión `completion.integration.test.ts` si procede.
- Criterios de aceptación: C-CONTRACT/C-DATA y matriz E2-12; agrupar líneas históricas por relación vigente sin alterar históricos, conciliando importe/unidades completos con resumen por método. Reclasificación cambia grupo según contrato, no total; inactivas/bajas/ceros y denominadores/residuos de redondeo/base cero exactos, porcentajes calculados aquí. Pruebas de opciones/pagos/reembolsos y precios nuevos no modifican métricas; roles/cabeceras/body/query extra/precisión/coste sin N+1.
- Verificación: V-DOC + V-BE; unitarias de porcentajes y HTTP/PostgreSQL aislado con todas las categorías, varias líneas y grandes; sin integración omitida como aprobada.
- Revisor: backend independiente con datos/catálogo para consultas/conciliación, por confirmar antes de ejecución.
- Commit esperado (no autorizado): `feat(dashboard-admin): implement E2 category analytics API`.
- Estado propio E2-13: **CERRADA TÉCNICAMENTE el 2026-11-25; sin commit**. Evidencia en [validation.md](./validation.md): ruta `/admin/dashboard/category-participation` con entrada estricta, categoría actual e inactivas, denominadores/porcentajes half-up con bigint, base cero, conciliación con resumen, 500 saneado de integridad, 18/18 unitarias y 11/11 integraciones, benchmark aislado 20 000 ventas/8 categorías (medianas 93.97/93.80 ms, sin índices nuevos) y correcciones O1 (cota inclusiva del residuo en nota OpenAPI) y O2 (producto con `deletedAt`/`isAvailable=false` agregado por categoría actual). El verificador independiente quedó bloqueado dos veces por `permission.rejected` de shell y no se rodeó; el coordinador ejecutó la batería (format/typecheck/lint/build/api:validate 70 ejemplos/db:validate/test:integration 190 pruebas) y se registra como evidencia del coordinador. Revisión `dashboard-reviewer` **sin bloqueantes técnicos**, con residuales documentados y la salvedad de que la verificación independiente nominal no se acreditó. No inicia E2-15 ni CSV; no cierra E2.

### TASK-DA-E2-14 — Frontend de participación por categorías

- Objetivo RF: RF-12/14/03/11/19, RNF-02/03/04/05/06/07.
- Precondiciones: C-PRE; E2-12/contrato explícitamente aceptados y referencia/composición acordadas; E2-13 para integración real.
- Alcance / exclusiones: adaptador/parser y panel/alternativa tabular; sin porcentajes/reclasificaciones calculados en FE ni filtro categoría añadido a rutas antiguas.
- Archivos esperados: `frontend/unified/src/features/terminal/admin/analytics/{categoriesApi.ts,categoriesApi.unit.test.ts,CategoryParticipation.tsx,CategoryParticipation.component.test.tsx}`, integración en `admin/dashboard/DashboardSummary.tsx`, estilos acotados `src/styles/base.css`, `frontend/unified/e2e/dashboard-categories.spec.ts`.
- Criterios de aceptación: advertencia visible de categoría vigente/reclasificación histórica; métricas/denominador/unidad inequívocos, porcentajes recibidos del backend sin recalcular ni normalizar a 100%. Cero/bajas/inactivas/redondeo según contrato; parser estricto/strings exactos, tabla equivalente sin color único. C-UI/C-VIS completos con límites/429/errores/fallo parcial/carreras/sesión; no peticiones con filtro categoría a contratos que no lo aceptan.
- Verificación: V-DOC + V-FE + V-VIS; MSW de reclasificación, redondeos/cero/grandes/inválidos/respuestas antiguas y negativos de filtros; V-REAL en E2-15.
- Revisor: frontend independiente con backend/datos y aceptación visual humana, por confirmar antes de ejecución.
- Commit esperado (no autorizado): `feat(dashboard-admin): present E2 category participation`.
- Estado propio E2-14: **CERRADA TÉCNICAMENTE el 2026-11-25; sin commit**. Evidencia en [validation.md](./validation.md): adaptador/parser estricto, advertencia accesible de categoría vigente/reclasificación, métrica obligatoria y método opcional, denominador/unidad, porcentajes backend sin recalcular ni normalizar, base cero/«sin base», cero `[]`, bigint, fallo parcial, cancelación/descarte, tabla accesible y E2E simulada con axe a 1280/768/390; correcciones F1/P1/P2/R2/R3 aplicadas y cerradas en re-revisión independiente sin bloqueantes nuevos. El verificador independiente quedó bloqueado por `permission.rejected` de shell y no se rodeó: el **coordinador** ejecutó lint, typecheck, **720/720** unitarias, **9/9** E2E de categorías, **89/89** E2E completas y build correcto (el `code 1` de PowerShell fue solo el aviso de chunk en stderr), registrado como evidencia del coordinador y no como verificación independiente. V-VIS/V-REAL humanas quedan pendientes de E2-15. No inicia CSV; no cierra E2.

### TASK-DA-E2-15 — Aceptación real de categorías

- Objetivo RF: RF-12/14 y RF/RNF transversales de categorías, sin duplicar cierre E2.
- Precondiciones: C-PRE; E2-12…14 revisadas y contrato aceptado; API/BD/dataset/referencia autorizados específicamente.
- Alcance / exclusiones: conciliación real, regresión y acta de categorías; sin cierre E2, exportadores o cambios de catálogo/históricos por extensión.
- Archivos esperados: `frontend/unified/e2e-live/dashboard-categories-acceptance.spec.ts`, `e2e-live/README.md`, `backend/tests/integration/dashboard-categories.integration.test.ts` si necesario y `frontend/docs/specs/dashboard-admin/validation.md`.
- Criterios de aceptación: importes/unidades concilian resumen completo con mismo rango/método/dataset; porcentajes/denominadores/redondeo/base cero coinciden con esperado independiente. Acreditar categoría vigente, inactivas/bajas y reclasificación mediante fixture autorizado sin reescribir históricos; advertencia visible y ausencia de filtros nuevos en rutas antiguas. Roles/cabeceras/límites/precisión/errores/carreras/fallo parcial/sesión/coste y V-VIS/REAL con navegador/Electron; revisión independiente y aceptación humana propias. E2 sigue abierta hasta CSV-03.
- Verificación: V-DOC + V-BE + V-FE + V-VIS + V-REAL; registrar comandos dirigidos, evidencia y bloqueos sin secretos; mocks no acreditan aceptación.
- Revisor: backend/frontend independientes, datos/catálogo y aceptación funcional del responsable, por confirmar antes de ejecución.
- Commit esperado (no autorizado): `test(dashboard-admin): validate E2 category analytics integration`.
- Estado propio E2-15: **CERRADA Y ACEPTADA por el responsable el 2026-11-25 («Acepto E2-15 y sigo a CSV-00») con limitaciones registradas; sin commit**. Evidencia en [validation.md](./validation.md): fixtures QA aisladas (solo INSERT + una reclasificación controlada; +14 productos/+6 categorías/+16 ventas; 59 productos/26 ventas/11 categorías; huella original intacta), oráculo SQL independiente en **42 escenarios = 14 rangos × 3 métodos** con porcentajes half-up y conciliación, y suite live `dashboard-categories-acceptance.spec.ts` con **13 correctas / 1 omitida explícita** (autor 22.6–23.2 s; coordinador 21.9 s): reclasificación, inactiva, base cero/«sin base», cero `[]`, residuo 99.99, empates/acentos, µs y bordes, 366 días, negativos incluidos 400 de filtro `category` en rutas antiguas, roles 401/403, 500 saneado con fallo parcial real, carrera con `net::ERR_ABORTED` y última respuesta aplicada, axe 1280/768/390 y Electron. V-FE 720/720 y 89/89; V-BE 188/190 omitidas, 190/190 integración, 70 ejemplos y esquema válido. Capturas 1280/768/390/Electron aprobadas por el responsable en `...\da-e2-15\captures\`. Omitidos aceptados como **no probados**: 413/429/503 reales, DTO inválido live, expiración/refresh y multipestaña; sin caos ni revocación autorizados. Sin defectos de producto; la verificación independiente nominal no se acreditó (shell denegado al verificador) y la ejecución propia es del autor y del coordinador. Siguiente tarea autorizada: **CSV-00**; E2 no se cierra hasta **CSV-03**.

### Grafo de dependencias E2 aceptado y secuencia autorizada

```text
backlog aceptado + turno en secuencia autorizada + autor/revisor confirmados → cada tarea
E1 cerrado + DA-D04/06 pendientes identificadas → tarea documental de contrato (proponer resolución)
E2-00 → aceptación explícita contrato series → E2-01 + E2-02 → E2-03
E2-04 → aceptación explícita contrato ranking → E2-05 + E2-06 → E2-07
E2-08 → aceptación explícita contrato sin movimiento → E2-09 + E2-10 → E2-11
E2-12 → aceptación explícita contrato categorías → E2-13 + E2-14 → E2-15
E2-03 + E2-07 + E2-11 + E2-15 → CSV-00
CSV-00 → aceptación explícita contratos CSV → CSV-01 → CSV-02
E2-03 + E2-07 + E2-11 + E2-15 + CSV-00…02 revisadas → CSV-03 (único cierre E2)
```

El signo `+` expresa precondiciones conjuntas, no trabajo simultáneo autorizado. La autorización expresa del responsable fija ejecución secuencial 00…15 → CSV-00…03, una tarea a la vez, tras cierre verificado/revisado de la anterior y respetando cada aceptación contractual pendiente. El grafo muestra dependencias técnicas; la secuencia autorizada no permite saltar puertas ni ejecutar frontend en paralelo. Reusar datasets/semánticas aceptados al definir CSV; si se reduce alcance E2 debe aceptarse explícitamente antes de cambiar estas puertas, no omitir capacidades silenciosamente.

## E3–E4 y opcionales — Épicas pendientes de descomposición

Estos elementos **no son tareas atómicas ejecutables**. Antes de abordarlos, dividir cada capacidad en contrato aprobado (si cambia API), backend probado, frontend probado y aceptación real, con alcance, RF, archivos, comandos, decisiones, revisor y aprobación propios. Endpoints candidatos de la spec no son contratos aceptados. No aprobar toda una épica como un commit masivo.

| ID | Capacidad / requisitos | Dependencias y archivos previstos | Aceptación y revisión propuestas |
| --- | --- | --- | --- |
| EP-DA-E3-01 | Listado administrativo de órdenes; RF-15 | Contrato nuevo, filtros/cursor y DTO mínimo; módulos orders y UI administrativa | Roles/estados/paginación, LISTO solo pagada/en preparación, sin cancelación/cobro ajeno; V-BE/V-FE/V-REAL; revisión backend/frontend |
| EP-DA-E4-01 | Consulta mínima de clientes; RF-16 | DTO nuevo mínimo, búsqueda exacta actual diferenciada de listado; OpenAPI/accounts/customers/UI | Sin correo/NIP/favoritos/historial personal; permisos negativos/cursor; V-BE/V-FE/V-REAL; revisión privacidad/backend/frontend |
| EP-DA-E4-02 | Corrección cliente; RF-16/20 | Identificación autorizada E4-01 o flujo vigente aprobado; PATCH actual | Motivo/auditoría/unicidad y compras intactas; sin escritura duplicada; V-FE/V-REAL y pruebas backend aplicables; revisión backend/frontend |
| EP-DA-E4-03 | Reset presencial; RF-17/19/20 | Identidad y venta reciente verificables; contrato vigente y UX aprobada | Cuatro campos exactos, 204, NIP solo memoria/limpieza, revocación y cambio obligatorio; no reintento automático; V-FE/V-REAL y backend aplicable; revisión seguridad/backend/frontend |
| EP-DA-E4-04 | Historial caja; RF-18 | Contrato de lectura/DTO/cursor; cash/backend/UI | Esperado/contado/diferencia backend, sin ampliar cierre/cobro; V-BE/V-FE/V-REAL; revisión datos/backend/frontend |
| EP-DA-E4-05 | Auditoría; RF-18 | Contrato de eventos sanitizados, filtros y límites | Sin secretos/payloads sensibles, paginación/roles; V-BE/V-FE/V-REAL; revisión seguridad/backend/frontend |
| EP-DA-E4-06 | Incidencias; RF-18 | Contrato de consulta/privacidad; backend/UI | Estados reales, solo lectura, sin nuevas acciones de resolución; V-BE/V-FE/V-REAL; revisión backend/frontend |
| EP-DA-E4-07 | Estado de servicios; RF-11/18 | Fuente verificable y contrato sanitizado | Disponible/simulado/pendiente y actualización real sin credenciales/inferencias; V-BE/V-FE/V-REAL; revisión operación/backend/frontend |
| EP-DA-E4-08 | Reorganización catálogo; RF-09/20 | Necesidad de UI acordada, CRUD existente reutilizado | Restricciones/snapshots/resultados inciertos intactos; no proveedor real; V-FE/V-VIS y regresión; revisión frontend/catálogo |
| EP-DA-E4-09 | Reorganización personal; RF-10/20 | CRUD actual y diseño acordado | Sin DELETE, degradación/baja propia ni bloqueo de responsable con caja; motivos y revocación preservados; V-FE/V-VIS; revisión frontend/backend |
| EP-DA-E4-10 | Imágenes; RF-09/11 | Flujo existente dos pasos, autorización de alcance; no Cloudinary real | Tamaño/tipos/fallback, sin secretos; diferenciar simulación de proveedor real; V-FE y backend aplicable; revisión frontend/backend |
| EP-DA-E4-11 | Alertas operativas; RF-11/18 y alcance E4 | Aprobar fuentes, umbrales, vigencia y destinos por alerta | Incidencias/órdenes por expirar/caja abierta solo con datos verificables; estados obsoletos/error diferenciados, sin umbrales inferidos del dibujo; V-BE/V-FE/V-VIS/V-REAL; revisión funcional/backend/frontend |
| EP-DA-OPT-01 | Histórico global, sin CSV incluido por extensión | Alcance/coste aprobados por separado; fuera del MVP | Acumulado desde inicio con límites y semántica acordados; V-BE/V-FE/V-REAL; revisión datos/backend |
| EP-DA-OPT-02 | Cambio de contraseña adicional | Alcance específico y contrato `/auth/password`; fuera de configuración básica E1 | Contraseña actual/CSRF, revocación según contrato y sin persistencia/logs; V-FE/V-REAL; revisión seguridad/frontend/backend |

Cada entrega E3/E4 seleccionada termina con su propia tarea de aceptación y matriz RF/RNF, revisión independiente, pruebas reales/visuales aplicables y pendientes explícitamente aceptados. E2 tiene aceptaciones por capacidad y cierre único CSV-03. No se usa el cierre E1 como evidencia de funcionalidades posteriores.

## Cierre E2 — Tareas CSV aceptadas y cerradas

Ejecutar después de verificar la analítica E2 seleccionada. E2 no se declara completa sin estas tareas aceptadas. No incluyen exportación de imágenes ni XLSX; los CSV analíticos contienen los datos de las gráficas implementadas.

### TASK-DA-E2-CSV-00 — Contratos de exportación

- Objetivo: cerrar RF-21–23 y detalle pendiente DA-D07.
- Precondiciones: E2-03/07/11/15 aceptadas y sus contratos/datasets conocidos; tarea incluida en la secuencia autorizada y revisor confirmado antes de ejecución. La dependencia se aceptó con el bloque E2 y el contrato resultante requirió y obtuvo aceptación explícita antes de CSV-01/02.
- Alcance / exclusiones: propuesta OpenAPI para ventas y datasets analíticos implementados, ejemplos y matriz de escenarios; sin runtime, UI, histórico global, imágenes ni dependencias nuevas.
- Archivos esperados: `backend/docs/api/openapi.yaml`, documentación de contrato requerida por flujo backend y decisiones/matriz de escenarios del dashboard.
- Criterios de aceptación: fuentes/columnas/orden (ventas `soldAtUtc ASC, saleId ASC` y `rowOrder`) /metadatos, UTF-8/delimitador, fechas/zona/importes/unidades y precisión definidos; filtro completo de ventas versus top N analítico distinguido; `rowLimit` (máximo contractual) vs `top` (corte) explícito; cero resultados distinguiendo series (≥1 bucket vacío) del resto (encabezado sin filas); ADMINISTRADOR/no-store, cabeceras/nombre seguro, vacío/errores/rangos/filas máximas/consistencia (consulta única o aislamiento probado); separación 403 (Origin/PIN/rol) vs 400 (token/extra); escape y antifórmulas (incluido LF/espacios iniciales); sin PII innecesaria. No truncar ni generar CSV desde páginas visibles. Responsable acepta explícitamente contrato antes de CSV-01/02.
- Verificación: V-DOC + V-CONTRACT; ejemplos de varias páginas, dataset analítico, acentos/comillas/saltos de línea y fórmulas; revisión de privacidad/coste.
- Revisor: backend independiente, coordinación frontend y datos, por confirmar.
- Commit esperado: `docs(dashboard-admin): define E2 CSV export contracts`.
- Estado propio CSV-00: **CERRADA Y CONTRATO ACEPTADO por el responsable el 2026-11-25; sin commit**. Contrato [E2-csv-contract.md](./contracts/E2-csv-contract.md) con cinco exportaciones (ventas + cuatro capacidades analíticas), aceptación de D01–D36, correcciones B-01/B-02 y R-01…R-12 aplicadas, OpenAPI aditivo `x-contract-status: approved-2026-11-25` y 75 ejemplos. La aceptación habilita únicamente CSV-01 y CSV-02 bajo este contrato; no autoriza imágenes/XLSX, histórico global, cambios de negocio ni commit. Verificación V-DOC/V-CONTRACT y resultados reales en [validation.md](./validation.md). E2 no se cierra hasta CSV-03.

### TASK-DA-E2-CSV-01 — Backend de exportación CSV

- Objetivo: exportadores seguros de RF-21–23 con consultas/agregados existentes.
- Precondiciones: CSV-00 y contratos explícitamente aprobados; E2-03/07/11/15 aceptadas; entorno BD autorizado; aprobación de esta tarea. Si contrato exige implementaciones independientes de mayor alcance, dividir esta tarea antes de ejecutar.
- Alcance / exclusiones: rutas, validación, autorización, serialización y pruebas de ventas/datasets acordados; sin UI, colas, persistencia de archivos, proveedores o migraciones implícitas.
- Archivos esperados: módulos backend de ventas/analítica acordados, serializador compartido solo con reutilización efectiva, pruebas HTTP/BD y artefactos contractuales aplicables.
- Criterios de aceptación: todas las ventas filtradas incluidas dentro del límite; analítica idéntica a agregados con igual métrica/top N; fechas/importes exactos; permisos negativos, no-store/Content-Disposition/text-csv, escape y neutralización de fórmulas sin alterar importes válidos; límites/error explícitos sin CSV parcial presentado como completo.
- Verificación: V-DOC + V-BE; fixtures de más de una página, cero, máximos, fórmulas, comillas/saltos/acentos, enteros grandes, roles incorrectos y filtros.
- Revisor: backend independiente con revisión seguridad/datos, por confirmar.
- Commit esperado: `feat(dashboard-admin): implement E2 CSV exports`.
- Estado propio CSV-01: **CERRADA TÉCNICAMENTE el 2026-11-25; sin commit**. Cinco rutas solo ADMINISTRADOR, entrada estricta sin cursor/página, serializador común BOM/CRLF/RFC 4180/antifórmulas, metadatos `#meta`, fechas µs desde PostgreSQL, topes antes de serializar, cabeceras privadas y Problem Details saneados. Evidencia real en [validation.md](./validation.md): 16 unitarias CSV; `npm test` 204 aprobadas/205 omitidas; integración **205/205 en 12 suites** incluida CSV **15/15** (ventas > página, conciliación, método, µs/orden, cero, series DST 23/25 h, 745 y bucket vacío `0,0,0`, ranking 5/10/20 y bottom más rango sin productos con movimiento → metadatos/encabezado/cero filas, sin movimiento 104 filas vs paginación y 2 001 reales → 400, categorías inactiva/reclasificación/base cero/residuo 99.99/borrada 500, precedencia 401/403/400 con `token=` en las cinco rutas, antifórmulas en `saleNumber`/`method`/`orderStatus` sin alterar importe/ID, roles/PIN/Origin, 413/429/500/503, concurrencia); `format:check`, `typecheck`, `lint`, `build`, `api:validate` (75 ejemplos) y `db:validate` correctos; `git diff --check` sin errores. Revisión `dashboard-reviewer` **sin bloqueantes de código**, con residuales R1–R6 y pruebas P1–P5; R1/P1/P2/P4/R6 corregidos y R7 descartado por diff (la línea de `/sales` es preexistente). El verificador independiente nominal quedó bloqueado por `permission.rejected` de shell y no se rodeó: la batería la ejecutó el coordinador (204 unitarias, 205/205 integración, 75 ejemplos) y se registra como evidencia del coordinador. Límites: tope de 20 000 ventas y 1 000 categorías por unitarias + mapeo HTTP, no por fixture masivo; 368 buckets no alcanzable por HTTP bajo el rango de 366 días; `db:verify` no aplica; sin UI/hoja de cálculo. Siguiente: CSV-02; E2 no se cierra hasta CSV-03.

### TASK-DA-E2-CSV-02 — Descarga desde ventas y analítica

- Objetivo: integrar controles de descarga de RF-21/22, preservando sesión y errores.
- Precondiciones: CSV-00 aceptada y CSV-01 disponible para integración; componentes de ventas/analítica implementados y E2-03/07/11/15 aceptadas; aprobación de esta tarea.
- Alcance / exclusiones: botones exportar ventas/datos analíticos y tratamiento seguro de respuesta CSV; sin reconstruir reportes en navegador, PNG/XLSX ni nuevo gestor de autenticación.
- Archivos esperados: adaptador CSV y componentes de `frontend/unified/src/features/terminal/admin/`, cliente HTTP solo si una extensión acotada aprobada es necesaria, tests unitarios/componentes/E2E.
- Criterios de aceptación: envía filtros vigentes y métrica/top N correctos; descarga autenticada sin token en URL; **nombre de archivo seguro obtenido de `Content-Disposition` con extensión acotada del cliente existente (R-04/D33)**; distingue errores de archivo, no descarga Problem Details como CSV (R-12); estado ocupado/error y prevención de duplicados; liberación de recursos temporales; sin persistencia local de CSV. **Accesibilidad (R-08/D36):** botón accesible, operación por teclado con foco visible, anuncio de estado a lector de pantalla, descarga única y cancelación; prueba en Electron.
- Verificación: V-DOC + V-FE; éxito/401/403/429/red/vacío según contrato, parámetros y cambio de filtros durante descarga, **401 con un único refresh sin bucle (R-12)**, Problem Details que no se guarda como CSV, **teclado/foco/axe y Electron (R-08)** y regresión de sesión.
- Revisor: frontend independiente con revisión de integración HTTP, por confirmar.
- Commit esperado: `feat(dashboard-admin): add sales and analytics CSV downloads`.
- Estado propio CSV-02: **CERRADA TÉCNICAMENTE el 2026-11-25 con limitaciones registradas; sin commit**. El verificador independiente nominal quedó bloqueado por `permission.rejected` de shell y la batería la reejecutó el coordinador (lint, typecheck, 749/749 dos veces, 92/92 E2E, build, `git diff --check`); la re-revisión `dashboard-reviewer` cerró B-01/B-03 y R-01…R-07 sin bloqueantes nuevos, con B-02 (Electron/V-VIS/teclado manual) diferido a CSV-03 y B-04 (401 sin refresh+reintento) como limitación aceptada por el responsable, anotada también en el contrato. Correcciones de revisión aplicadas: B-01/R-02 (prueba con promesa diferida y aborto por señal), B-03/D36 (cancelación accesible por teclado con reintento), R-01 (revocación en `finally` con macrotask), R-03 (región `role="status"` persistente), R-04 (`aria-disabled`), R-05 (aviso de exportar todas las ventas filtradas), R-06 (rechazo de `limit`/`cursor`/`top`), R-07 (`jwt=` en E2E) y ajustes posteriores de foco tras cancelar y liberación garantizada. Extensión acotada `apiFetchFile` sobre el cliente y sesión existentes (sin segundo cliente/refresh manager), cinco solicitudes con los filtros visibles (ventas from/to/method; series from/to/granularity/method; ranking metric/direction/top/method; sin movimiento sin limit/cursor/top; categorías metric/from/to/method), nombre desde `Content-Disposition` con fallback ASCII determinista, distinción `text/csv`/Problem Details, aborto al cambiar filtros/desmontar, liberación diferida de object URL, sin storage, botón accesible con `aria-busy`/`aria-disabled` y región `aria-live` persistente, doble clic bloqueado, cancelación accesible durante la descarga y errores 401/403/429 saneados sin reintento automático. Correcciones de revisión aplicadas: B-01/R-02 (prueba de componente con promesa diferida y aborto verificado por señal, sin `delay`/`setTimeout`/`toBeEnabled`), B-03/D36 (acción «Cancelar descarga» por teclado, anuncio de cancelación, sin archivo y reintento), R-01 (revocación del object URL en macrotask posterior), R-03 (región `role="status"` persistente vacía en reposo), R-04 (`aria-disabled`, no `disabled`), R-05 (aviso de exportar todas las ventas filtradas, no las 5 visibles), R-06 (rechazo explícito de `limit`/`cursor`/`top` en la query de exportación sin movimiento), R-07 (`jwt=` en las aserciones E2E). **Decisiones del responsable:** se mantiene el gestor de sesión actual (401 delegado a `SessionManager`, sin refresh+reintento) como limitación aceptada; la prueba Electron real y la V-VIS/teclado manual se difieren a CSV-03. Evidencia en [validation.md](./validation.md): **749/749** unit/componente en **dos corridas**, prueba de componente **4/4 en cinco corridas** consecutivas, **3/3** E2E dirigidas y **92/92** E2E simuladas totales (incluida cancelación por teclado), `lint`, `typecheck`, `test`, `test:e2e`, `build` y `git diff --check` correctos. Límites: E2E con interceptación Playwright (MSW en unit/componente), sin API/Electron/descarga real ni hoja de cálculo; V-VIS/capturas y revisión independiente pendientes. No cierra E2; CSV-03 sigue siendo el cierre.

### TASK-DA-E2-CSV-03 — Aceptación real de exportación y cierre E2

- Objetivo: acreditar RF-21–23 y cierre E2 sobre analítica seleccionada.
- Precondiciones: CSV-00…02 revisadas y E2-03/07/11/15 aceptadas; API/dataset de ensayo autorizados específicamente para esta tarea (E1 no autoriza entornos nuevos); aprobación de esta tarea. Reutilizar escenarios/datasets de las cuatro capacidades para conciliar CSV completo según filtros/métrica/top N, no páginas visibles. CSV-03 sigue siendo la única tarea de aceptación final/cierre E2.
- Alcance / exclusiones: conciliación de archivos reales, seguridad/regresión, evidencia y acta E2; no nuevas capacidades ni correcciones funcionales mayores sin tarea propia.
- Archivos esperados: pruebas necesarias y acta/matriz en `frontend/docs/specs/dashboard-admin/validation.md`; no versionar exportaciones con datos privados.
- Criterios de aceptación: CSV de ventas incluye filas fuera de la página visible y en orden `soldAtUtc ASC, saleId ASC`; series/rankings/sin movimiento/categorías implementadas coinciden con filtros y datos; vacío (ventas/ranking/sin movimiento/categorías con encabezado sin filas; series con ≥1 bucket vacío), límites, precisión y fórmulas verificados; hoja de cálculo abre ejemplo controlado sin confundir CSV con gráfica; **descarga accesible por teclado, anuncio de estado, descarga única/cancelación y prueba en Electron (R-08/D36)**; revisión independiente. No cierre E2 solo con mocks ni imágenes como sustituto del archivo de datos.
- Verificación: V-DOC + V-BE + V-FE + V-REAL; revisión manual de descarga/teclado y ejemplo CSV. Registrar comandos, resultados y bloqueos reales.
- Revisor: backend/frontend independientes y aceptación funcional del responsable, por confirmar.
- Commit esperado: `test(dashboard-admin): validate CSV exports and E2 completion`.
- Estado propio CSV-03: **CERRADA Y ACEPTADA por el responsable el 2026-11-25; E2 CERRADA Y ACEPTADA con limitaciones registradas; sin commit**. Evidencia en [validation.md](./validation.md): 7/7 ejecutadas +1 omitida en dos corridas limpias; cinco descargas reales por botón con cabeceras/BOM/CRLF, ventas 7>5 conciliadas con `/api/v1/sales` paginado y resúmenes, series 24 buckets/17 vacíos, ranking top 5 de 6, sin movimiento 47>20 y categorías con `sharePercent`/inactivas/99.99; parser independiente, negativos 400/401/403 (incluido GERENTE/PIN), teclado/foco, axe 1280/768/390 y Electron real con descarga efectiva. Copias y capturas sanitizadas en `C:\Users\angel\AppData\Local\Temp\opencode\da-csv-03\`. V-FE 750/750, 92/92 E2E y build; V-BE 204/204 unitarias, 205/205 integración, 75 ejemplos y esquema válido; `git diff --check` correcto. Omitidos: topes >20 000/2 000/1 000 no reproducibles, fórmulas/comillas/saltos no materializados en live, caos 413/429/503, DTO inválido live y cancelación live. Sin defecto de producto; el 404 inicial y `AUTH_RATE_LIMITED` fueron entorno. **Cierra E2 tras la aceptación explícita del responsable el 2026-11-25.**

## Registro de ejecución

| Tarea | Estado | Evidencia |
| --- | --- | --- |
| TASK-DA-E1-00 | Terminada | OpenAPI `approved-2026-11-24`, 66 ejemplos conformes, Prettier y `git diff --check` correctos. Revisión y re-revisión independientes; B1 cerrado. Commit `mismo commit`. |
| TASK-DA-E1-01 | Terminada | `format:check`, `typecheck`, `lint`, `test` (120/266), `api:validate`, `db:validate`, `build`, `test:integration` (146/146 en 7 suites) y `db:verify` (PG 17.11, 22 comprobaciones) correctos. Revisión inicial corrigió `changePercent`; re-revisión corrigió fixture CASH; revisión final sin bloqueantes. Detalle en [validation.md](./validation.md). Commit `mismo commit`. |
| TASK-DA-E1-02 | Terminada (shell estructural) | Shell lateral sobre rutas existentes, foco y `aria-current`; revisión independiente sin bloqueantes de código. `typecheck`, `lint`, `test` (285/285), `test:e2e` (59/59, incluida Electron/axe) y `build` correctos. Capturas 1280/768/390 revisadas y shell aceptado; identidad visual/DA-D08 diferida. Commit `mismo commit`. |
| TASK-DA-E1-03 | Terminada | `periods.ts` con zona Tijuana, reloj inyectable, presets, custom, límite 366 días, DST y formatos exactos; 12 pruebas unitarias. `test` (297/297), `typecheck`, `lint`, `build` y `git diff --check` correctos. Revisión y re-revisión sin bloqueantes. Detalle en [validation.md](./validation.md). Commit `mismo commit`. |
| TASK-DA-E1-04 | Terminada | Adaptador `summaryApi.ts` con query builder, parser estricto, aborto, coherencia de comparación/mezcla y errores; 18 pruebas MSW. `test` (315/315), `typecheck`, `lint`, `build` y `git diff --check` correctos. Revisión y re-revisión sin bloqueantes. Detalle en [validation.md](./validation.md). Commit `mismo commit`. |
| TASK-DA-E1-05 | Terminada técnicamente | Tarjetas de Inicio con periodos, método, comparaciones, mezcla, carga/error/vacío, descarte de respuestas antiguas y actualización manual; 7 pruebas de componente. `test` (322/322), `test:e2e` (59/59), `typecheck`, `lint`, `build` y `git diff --check` correctos. Identidad visual final diferida por DA-D08. Commit `mismo commit`. |
| TASK-DA-E1-06 | Terminada técnicamente | Caja actual independiente y últimas 5 ventas reales con `order=desc`, cursor ligado al orden y `AbortSignal`; 10 pruebas de componente. Frontend `test` (327/327), `test:e2e` (59/59), `typecheck`, `lint`, `build`, `git diff --check`; backend `test` (120/120), `test:integration` (146/146), `api:validate` correctos. Identidad visual final diferida por DA-D08. Commit `mismo commit`. |
| TASK-DA-E1-07 | Terminada técnicamente | Acción «Ver ticket» reutiliza `ProtectedTicket`/`reprintSaleTicket`, foco/cierre, ticket en vuelo invalidado y error 404 sin cobro; 14 pruebas de componente. `test` (330/330), `test:e2e` (60/60), `typecheck`, `lint`, `build` y `git diff --check` correctos. Identidad visual final diferida por DA-D08. Commit `mismo commit`. |
| TASK-DA-E1-08 | Terminada técnicamente | Configuración básica con nombre/usuario/rol/entorno/API y logout único en el shell; 1 prueba de componente. `test` (332/332), `test:e2e` (60/60), `typecheck`, `lint`, `build`, backend `test` (120/120), `test:integration` (146/146), `api:validate` y `git diff --check` correctos. Commit `mismo commit`. |
| TASK-DA-E1-09 | Terminada y aceptada | Entorno local real autorizado (Docker/PostgreSQL 17.11, backend y Vite). Backend 120/120, integración 146/146, `db:verify:docker` 22 comprobaciones y contrato 66 ejemplos; frontend 332/332, 60/60 simuladas y suite live 5/5 en cuatro corridas registradas más la revalidación de B1. Conciliación real, caja independiente, últimas ventas, ticket en un clic, roles 401/403, axe y Electron en vivo con backend real. Revisión: B1 cerrado. El responsable aprobó el diseño actual como baseline visual (DA-D08 cerrado con este diseño), aceptó el scroll horizontal de la tabla a 768/390 y reportó usabilidad en 7 s, teclado correcto y caja correcta. Limitaciones registradas: HTTPS/distribución y cobertura live de escritura. Detalle en [validation.md](./validation.md). Commit `mismo commit`. |

E1 queda cerrada y aceptada por el responsable el 2026-11-24. La validación navegador→backend y Electron en vivo están acreditadas en local; el diseño actual se aprobó como baseline visual, el scroll horizontal de la tabla a 768/390 fue aceptado y la prueba guiada reportó 7 s, teclado correcto y caja correcta. Quedan registradas como limitaciones HTTPS/distribución y la cobertura live de escritura. Las pruebas de integración omitidas no se contabilizan como aprobadas. Cualquier commit requiere autorización explícita.

### Registro E2 — backlog aceptado, sin ejecución al commit

| Tareas | Estado real | Puerta pendiente |
| --- | --- | --- |
| TASK-DA-E2-00 | Aceptada por el responsable con dominio desde 2000; lista para commit documental | Autor `dashboard-backend-implementer`; roles independientes `dashboard-verifier` / `dashboard-reviewer` sin nueva aprobación atribuida. from mínimo 2000-01-01T08:00:00.000Z; histórico anterior excluido explícitamente, E1 intacto. format:check/api:validate correctos (67 ejemplos), enlaces backend 286/0 y propios 18/0; chequeo documental de dominio/DST correcto, no HTTP/BD. Sin runtime, E2-01 ni commit; git diff --check no ejecutado por restricción. Detalle en validation.md |
| TASK-DA-E2-01 | Terminada y aceptada | Evidencia en validation.md: cabeceras en 400, S03 exacto, guarda 368, S14, precisión µs, H-01 corregido en middleware privado temprano, R-03 con error explícito. 139 unitarias, 155/155 integración, 67 ejemplos, 22 comprobaciones de BD. Dos benchmarks reales (autor 878.85 ms mediana / coordinador 642.99 ms mediana; EXPLAIN 1.496 s / 1.282 s); 100k no medido. El responsable acepta el rendimiento actual por ahora y deja la optimización pendiente documentada, sin cambiar contrato/índices/migraciones. Commit `mismo commit`; E2-02 no iniciada en este commit |
| TASK-DA-E2-02 | **Cerrada con salvedad registrada; commit `e46905c`/`a766505` asociados a la serie E2** | Adaptador estricto, Hora/Día, tabla accesible y fallo parcial aislado; 410/410 unit/componente y 62/62 E2E simuladas; revisión sin bloqueantes técnicos tras B-01/R-01. **Decisión del responsable (2026-11-26):** no se exige una V-VIS separada de E2-02; la aceptación visual de la capacidad de series es la registrada en E2-03 y sus capturas aprobadas. Se conserva la salvedad de que E2-02 no tuvo capturas propias y que su evidencia de ejecución fue del coordinador por bloqueo de shell del verificador. |
| TASK-DA-E2-03 | Suite live aceptada por el responsable el 2026-11-25; re-revisión final registrada; sin commit; no cierra E2/CSV | 7/7 live sin mocks (autor y verificador), conciliación por método, DST, parciales, precisión µs, máximo 745, mínimo 2000, roles/cabeceras, teclado, axe y cancelación real. Capturas 1280/768/390/Electron aprobadas. B-1 corregido; B-2 aceptado como limitación (429/503/fallo parcial real en simulación/integración; caos real diferido). Detalle en validation.md |
| TASK-DA-E2-04 / 05 / 06 / 07 | E2-04 contrato, E2-05 backend, E2-06 frontend y E2-07 aceptación real cerrados/aceptados; commit de E2-07 pendiente | Turno tras ranking; E2-07 aceptada con prueba guiada de 4 s y limitaciones declaradas. No cierra E2/CSV ni autoriza tareas CSV por extensión |
| TASK-DA-E2-08 / 09 / 10 / 11 | E2-08 contrato, E2-09 backend, E2-10 frontend y E2-11 aceptación real cerrados; E2-11 aceptada con limitaciones; commit pendiente | Turno tras ranking; E2-11 aceptada el 2026-11-25 con capturas sanitizadas y dos bloques omitidos diferidos como no probados. No cierra E2/CSV |
| TASK-DA-E2-12 / 13 / 14 / 15 | E2-12 contrato aceptado; E2-13 y E2-14 cerrados técnicamente con evidencia del coordinador; **E2-15 CERRADA Y ACEPTADA por el responsable el 2026-11-25** con limitaciones registradas (13 correctas / 1 omitida, capturas aprobadas) | E2-15 aceptada como capacidad el 2026-11-25 («Acepto E2-15 y sigo a CSV-00»); no inicia CSV por sí sola ni cierra E2/CSV. La siguiente tarea autorizada es CSV-00 |
| TASK-DA-E2-CSV-00…03 | **CSV-00 a CSV-03 aceptadas; E2 CERRADA Y ACEPTADA por el responsable el 2026-11-25** con las limitaciones registradas | Contrato aceptado `contracts/E2-csv-contract.md`; OpenAPI `approved-2026-11-25`; CSV-01 cinco rutas y serializador con 205/205 integración; CSV-02 descargas con 750 unitarias y 92/92 E2E, B-04 como limitación aceptada; CSV-03 con tres corridas live 7/7 + 1 omitida (autor y coordinador), cinco archivos reales conciliados, Electron con descarga real y revisión independiente sin bloqueantes de producto. Omitidos aceptados como no probados: topes no reproducidos en vivo, fórmulas/comillas/saltos no materializados, 413/429/503/500 reales, DTO inválido live, expiración/refresh, multipestaña y cancelación live. Sin commit hasta autorización expresa. E3/E4/opcionales no iniciados. |

Este registro acredita backlog redactado, investigación y revisión sin bloqueantes reportadas y aceptación del bloque/secuencia por el responsable. `git diff --check` fue reportado correcto por el implementador; el verificador tuvo una denegación de permiso y no se eludió ni se presenta como verificación ejecutada. Commit del backlog autorizado al coordinador: `mismo commit`, aún no creado en este encargo. No acredita contratos aceptados, tareas implementadas ni pruebas runtime. Pendientes comunes: detalle de rutas/DTO/límites/coste/precisión temporal por capacidad, referencia/composición visual E2 y autorizaciones de entorno/dataset para cada aceptación real. E1 y su evidencia histórica permanecen cerradas sin modificaciones.
