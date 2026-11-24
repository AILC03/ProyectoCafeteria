# Tareas — DA-001

Actualizado: 2026-11-24. Fuentes: [spec.md](./spec.md) y [plan.md](./plan.md), **aprobados por el responsable en esta conversación el 2026-11-24**.

Estado de este backlog: **aceptado explícitamente por el responsable en esta conversación el 2026-11-24**, junto con spec y plan. Todas las tareas siguen pendientes; ninguna se ha iniciado. Se requiere selección explícita de la tarea que se ejecutará, respetando sus precondiciones y las aprobaciones de contrato pendientes.

Ampliación aceptada dentro del backlog: exportación **solo CSV obligatoria al cierre de E2**, incluyendo ventas filtradas y datos de analítica implementada. Las tareas CSV están aceptadas en su alcance; no se aprueban automáticamente contratos ni se inicia su ejecución. PNG/XLSX e histórico global no se incluyen.

## Reglas de ejecución y sustitución del backlog anterior

- Orden SDD: spec aprobada → plan aprobado → backlog revisado → tarea concreta aprobada → ejecución → verificación y revisión independiente. Una tarea a la vez; el paralelismo entre responsables requiere encargo explícito, no implica delegación automática a agentes.
- Cada tarea termina como unidad revisable con pruebas/documentación propias. No dejar seguridad o evidencia obligatoria para la tarea final. Si surge una decisión nueva o cambia alcance aprobado, detener únicamente la parte afectada y solicitar resolución.
- El contrato E1 se redacta en la primera tarea. Su aprobación explícita es una puerta separada antes del backend o del adaptador frontend; aprobar este backlog no aprueba un DTO todavía inexistente.
- Asignaciones propuestas: Ángel backend/contrato, Enrique frontend, Leonel datos; confirmar ejecutor y revisor nominal antes de iniciar cada tarea. El revisor debe ser independiente del autor. Ningún nombre propuesto equivale a asignación aceptada.
- Las decisiones de detalle pendientes de la spec conservan ese estado hasta aceptación explícita registrada. No reabrir el alcance aprobado por rutina ni marcar propuestas como aceptadas.
- Los commits indicados son mensajes esperados, **no autorización de commit/push/despliegue**.

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

## E2–E4 — Épicas pendientes de descomposición

Estos elementos **no son tareas atómicas ejecutables**. Antes de abordarlos, dividir cada capacidad en contrato aprobado (si cambia API), backend probado, frontend probado y aceptación real, con alcance, RF, archivos, comandos, decisiones, revisor y aprobación propios. Endpoints candidatos de la spec no son contratos aceptados. No aprobar toda una épica como un commit masivo.

| ID | Capacidad / requisitos | Dependencias y archivos previstos | Aceptación y revisión propuestas |
| --- | --- | --- | --- |
| EP-DA-E2-01 | Series hora/día; RF-12, RNF-02/04/06 | Contrato/límites/buckets y DST; OpenAPI, agregación backend, `admin/analytics/` | Conciliar buckets, cero y periodos DST; alternativa textual; V-CONTRACT/V-BE/V-FE/V-VIS/V-REAL; revisión datos/backend/frontend |
| EP-DA-E2-02 | Ranking y sin movimiento; RF-13 | Contrato y DA-D04/06 por capacidad; consultas/parsers/UI | ProductId, pagadas, métrica explícita, top 5/10/20, empates estables/inactivos/snapshots; ceros activos aparte; mismas verificaciones y revisores E2-01 |
| EP-DA-E2-03 | Categorías, ampliación explícita; RF-12/14 | Semántica vigente/denominadores/filtros completos acordados; OpenAPI/backend/analytics | Advertencia de reclasificación, totales conciliados, sin enviar filtro a rutas antiguas; V-BE/V-FE/V-REAL; revisión datos/backend/frontend |
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

Cada entrega E2/E3/E4 seleccionada termina con su propia tarea de aceptación y matriz RF/RNF, revisión independiente, pruebas reales/visuales aplicables y pendientes explícitamente aceptados. No se usa el cierre E1 como evidencia de funcionalidades posteriores.

## Cierre E2 — Tareas CSV propuestas

Ejecutar después de verificar la analítica E2 seleccionada. E2 no se declara completa sin estas tareas aceptadas. No incluyen exportación de imágenes ni XLSX; los CSV analíticos contienen los datos de las gráficas implementadas.

### TASK-DA-E2-CSV-00 — Contratos de exportación

- Objetivo: cerrar RF-21–23 y detalle pendiente DA-D07.
- Precondiciones: analítica seleccionada y contratos conocidos; aprobación explícita de esta tarea y revisor confirmado.
- Alcance / exclusiones: propuesta OpenAPI para ventas y datasets analíticos implementados, ejemplos y matriz de escenarios; sin runtime, UI, histórico global, imágenes ni dependencias nuevas.
- Archivos esperados: `backend/docs/api/openapi.yaml`, documentación de contrato requerida por flujo backend y decisiones/matriz de escenarios del dashboard.
- Criterios de aceptación: fuentes/columnas/orden/metadatos, UTF-8/delimitador, fechas/zona/importes/unidades y precisión definidos; filtro completo de ventas versus top N analítico distinguido; ADMINISTRADOR/no-store, cabeceras/nombre seguro, vacío/errores/rangos/filas máximas/consistencia; escape y antifórmulas; sin PII innecesaria. No truncar ni generar CSV desde páginas visibles. Responsable acepta explícitamente contrato antes de CSV-01/02.
- Verificación: V-DOC + V-CONTRACT; ejemplos de varias páginas, dataset analítico, acentos/comillas/saltos de línea y fórmulas; revisión de privacidad/coste.
- Revisor: backend independiente, coordinación frontend y datos, por confirmar.
- Commit esperado: `docs(dashboard-admin): define E2 CSV export contracts`.

### TASK-DA-E2-CSV-01 — Backend de exportación CSV

- Objetivo: exportadores seguros de RF-21–23 con consultas/agregados existentes.
- Precondiciones: CSV-00 y contratos explícitamente aprobados; E2 analítica aplicable verificada; entorno BD autorizado; aprobación de esta tarea. Si contrato exige implementaciones independientes de mayor alcance, dividir esta tarea antes de ejecutar.
- Alcance / exclusiones: rutas, validación, autorización, serialización y pruebas de ventas/datasets acordados; sin UI, colas, persistencia de archivos, proveedores o migraciones implícitas.
- Archivos esperados: módulos backend de ventas/analítica acordados, serializador compartido solo con reutilización efectiva, pruebas HTTP/BD y artefactos contractuales aplicables.
- Criterios de aceptación: todas las ventas filtradas incluidas dentro del límite; analítica idéntica a agregados con igual métrica/top N; fechas/importes exactos; permisos negativos, no-store/Content-Disposition/text-csv, escape y neutralización de fórmulas sin alterar importes válidos; límites/error explícitos sin CSV parcial presentado como completo.
- Verificación: V-DOC + V-BE; fixtures de más de una página, cero, máximos, fórmulas, comillas/saltos/acentos, enteros grandes, roles incorrectos y filtros.
- Revisor: backend independiente con revisión seguridad/datos, por confirmar.
- Commit esperado: `feat(dashboard-admin): implement E2 CSV exports`.

### TASK-DA-E2-CSV-02 — Descarga desde ventas y analítica

- Objetivo: integrar controles de descarga de RF-21/22, preservando sesión y errores.
- Precondiciones: CSV-00 aceptada y CSV-01 disponible para integración; componentes de ventas/analítica implementados; aprobación de esta tarea.
- Alcance / exclusiones: botones exportar ventas/datos analíticos y tratamiento seguro de respuesta CSV; sin reconstruir reportes en navegador, PNG/XLSX ni nuevo gestor de autenticación.
- Archivos esperados: adaptador CSV y componentes de `frontend/unified/src/features/terminal/admin/`, cliente HTTP solo si una extensión acotada aprobada es necesaria, tests unitarios/componentes/E2E.
- Criterios de aceptación: envía filtros vigentes y métrica/top N correctos; descarga autenticada sin token en URL; distingue errores de archivo, no descarga Problem Details como CSV; estado ocupado/error y prevención de duplicados; nombre seguro y liberación de recursos temporales; sin persistencia local de CSV.
- Verificación: V-DOC + V-FE; éxito/401/403/429/red/vacío según contrato, parámetros y cambio de filtros durante descarga, navegación teclado y regresión de sesión.
- Revisor: frontend independiente con revisión de integración HTTP, por confirmar.
- Commit esperado: `feat(dashboard-admin): add sales and analytics CSV downloads`.

### TASK-DA-E2-CSV-03 — Aceptación real de exportación y cierre E2

- Objetivo: acreditar RF-21–23 y cierre E2 sobre analítica seleccionada.
- Precondiciones: CSV-00…02 y analítica E2 aplicable revisadas; API/dataset de ensayo autorizados; aprobación de esta tarea.
- Alcance / exclusiones: conciliación de archivos reales, seguridad/regresión, evidencia y acta E2; no nuevas capacidades ni correcciones funcionales mayores sin tarea propia.
- Archivos esperados: pruebas necesarias y acta/matriz en `frontend/docs/specs/dashboard-admin/validation.md`; no versionar exportaciones con datos privados.
- Criterios de aceptación: CSV de ventas incluye filas fuera de la página visible; series/rankings/sin movimiento/categorías implementadas coinciden con filtros y datos; vacío/límites, precisión y fórmulas verificados; hoja de cálculo abre ejemplo controlado sin confundir CSV con gráfica; revisión independiente. No cierre E2 solo con mocks ni imágenes como sustituto del archivo de datos.
- Verificación: V-DOC + V-BE + V-FE + V-REAL; revisión manual de descarga/teclado y ejemplo CSV. Registrar comandos, resultados y bloqueos reales.
- Revisor: backend/frontend independientes y aceptación funcional del responsable, por confirmar.
- Commit esperado: `test(dashboard-admin): validate CSV exports and E2 completion`.

## Registro de ejecución

| Tarea | Estado | Evidencia |
| --- | --- | --- |
| TASK-DA-E1-00 | Terminada | OpenAPI `approved-2026-11-24`, 66 ejemplos conformes, Prettier y `git diff --check` correctos. Revisión y re-revisión independientes; B1 cerrado. Commit `mismo commit`. |
| TASK-DA-E1-01 | Terminada | `format:check`, `typecheck`, `lint`, `test` (120/266), `api:validate`, `db:validate`, `build`, `test:integration` (146/146 en 7 suites) y `db:verify` (PG 17.11, 22 comprobaciones) correctos. Revisión inicial corrigió `changePercent`; re-revisión corrigió fixture CASH; revisión final sin bloqueantes. Detalle en [validation.md](./validation.md). Commit `mismo commit`. |
| TASK-DA-E1-02 | Terminada (shell estructural) | Shell lateral sobre rutas existentes, foco y `aria-current`; revisión independiente sin bloqueantes de código. `typecheck`, `lint`, `test` (285/285), `test:e2e` (59/59, incluida Electron/axe) y `build` correctos. Capturas 1280/768/390 revisadas y shell aceptado; identidad visual/DA-D08 diferida. Commit `mismo commit`. |
| TASK-DA-E1-03 | Terminada | `periods.ts` con zona Tijuana, reloj inyectable, presets, custom, límite 366 días, DST y formatos exactos; 12 pruebas unitarias. `test` (297/297), `typecheck`, `lint`, `build` y `git diff --check` correctos. Revisión y re-revisión sin bloqueantes. Detalle en [validation.md](./validation.md). Commit `mismo commit`. |
| TASK-DA-E1-04 | Terminada | Adaptador `summaryApi.ts` con query builder, parser estricto, aborto, coherencia de comparación/mezcla y errores; 18 pruebas MSW. `test` (315/315), `typecheck`, `lint`, `build` y `git diff --check` correctos. Revisión y re-revisión sin bloqueantes. Detalle en [validation.md](./validation.md). Commit `mismo commit`. |
| TASK-DA-E1-05 | Terminada técnicamente | Tarjetas de Inicio con periodos, método, comparaciones, mezcla, carga/error/vacío, descarte de respuestas antiguas y actualización manual; 7 pruebas de componente. `test` (322/322), `test:e2e` (59/59), `typecheck`, `lint`, `build` y `git diff --check` correctos. Identidad visual final diferida por DA-D08. Commit `mismo commit`. |

E1-02 quedó terminada como shell estructural con identidad visual diferida. E1-05 está implementada y pendiente de revisión final. Las pruebas de integración omitidas no se contabilizan como aprobadas. Cualquier commit requiere autorización explícita.
