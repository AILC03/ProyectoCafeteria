# TASKS-FE-VIS-001 — Entregas híbridas de migración visual

- **Estado:** listado revisado a petición del responsable; HYB-01 terminada, HYB-02…HYB-25 pendientes de autorización individual.
- **Fuente:** [plan híbrido](./FRONTEND-VISUAL-MIGRATION-PLAN.md) y [spec vigente](./FRONTEND-VISUAL-MIGRATION-SPEC.md).
- **Sustituye:** listado anterior de 69 tasks R/U, todavía no ejecutadas. Los IDs pasan a `HYB-XX` para no confundir las dos descomposiciones.
- **Reglas armonizadas:** el responsable autorizó ajustar spec/plan y proceso al enfoque híbrido. Esa edición documental no inicia ninguna task ni aprueba lote, tema, adaptación o resultado visual.

## 1. Contratos comunes

`SRC` = `frontend/unified/src/`; `DOC` = `frontend/docs/specs/frontend-visual-migration/`. Los archivos nuevos son previstos. Cada task incluye estos contratos según su tipo.

### D — Documentación/investigación

Revisión de Git, fuentes con commit/ruta y `git diff --check`; no modificar fuentes originales ni backend. Revisor técnico independiente; evidencia en registros DOC. Commit esperado `docs(frontend): <entrega>` cuando cumpla criterios y aprobación aplicable. No inventar capturas o decisiones.

### H — Tooling/referencias

Usar Playwright/Chromium y `_electron` existentes, fixtures sintéticos, perfiles efímeros y servidores localhost. No BD/API reales, `.env`, credenciales, nuevas dependencias o cambios a originales. Suites funcionales sin doble descubrimiento de tests visuales. Revisor técnico/verificador y revisor visual cuando se entreguen referencias; aprobación del responsable para lote/adaptaciones. Commit esperado `test(frontend): <capacidad>` o `docs(frontend): <referencias>`.

### U — Reproducción por bloque

- Entrada: task aprobada, lote/tema aprobado, fuentes originales exactas y patrones heredados registrados. Registrar recursos, rol/estados, viewports y fixture; ninguna mejora estética opcional autorizada.
- Si sensible: presentar adaptación antes de código, esperar aprobación de sus diferencias. Si aparece un patrón nuevo o ambigüedad, pedir decisión puntual, no inventar referencia.
- Archivos comunes además de los listados: `SRC/styles/<area>/<bloque>.css`, prueba de componente correspondiente, `e2e/visual/<bloque>.visual.spec.ts`, escenarios axe y `DOC/evidence/<task>/<surface>/<viewport>/{original.png,reproduction.png,evidence.md}`.
- Tests primero: escenarios funcionales/accesibles y expectativas del bloque; no modificar contratos/servicios/providers para ajustarlos al diseño. `frontend-design` refina detalle dentro del original, no altera identidad ni flujos.
- Al terminar: comparativas de cada superficie del bloque, revisiones independientes técnica/visual y aceptación del responsable. Aprobación del lote no equivale a aceptación de resultados posteriores.
- Verificación individual en `frontend/unified/`: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run test`, `npm.cmd run test:e2e`, `npm.cmd run build`; desde raíz `git diff --check`. Ejecutar captura visual del bloque con configuración creada en HYB-02, axe de estados/overlays, teclado/foco, reflow/zoom y reduced-motion aplicables. Registrar conteos reales, omitido y bloqueado.
- Terminal: evidencia real Electron de las superficies modificadas con preload, mínimo/maximizada; no basta navegador. Todo cambio shared exige regresión visual/funcional de ambas áreas.
- Estados: normal, carga, vacío, error, deshabilitado y denegación cuando existan; mutaciones pendiente/éxito/incierto; overlays teclado/foco/cancelación. La task concreta los aplicables, sin inventar estados nuevos.
- Requisitos comunes: RV-02…RV-05, CA-02, CA-04, CA-05, CA-08…CA-12. Los requisitos específicos se añaden en cada task.
- Hecho cuando común: fuentes/patrones trazables, fidelidad aceptada, diferencias justificadas/aprobadas, suites y revisiones sin bloqueantes y aceptación visual explícita del bloque. Sin esa aceptación queda pendiente, no hecha.
- Commit esperado `refactor(terminal): reproducir <bloque>` o `refactor(clientes): reproducir <bloque>`.

Cada task cerrada incluye fila STATUS con evidencia real, decisiones, revisores, aceptación y `mismo commit`. Un checkbox no representa «código listo»: sólo terminación. Aprobar una task no autoriza otra. Si el bloque excede una unidad revisable, dividirlo con aprobación antes del código sin omitir tests/capturas.

## 2. Habilitación y lote de referencia

- [x] **HYB-01 — Crear registros e inventario conjunto** (D).
  - Requisitos: RV-01, RV-03, CA-01, CA-09, CA-10; plan §3–4.
  - Dependencias: aprobación individual; comprobar coherencia de spec/plan/listado revisados. Sin dependencias de tasks de ejecución anteriores.
  - Archivos: DOC/REFERENCES y DOC/STATUS con nombres completos `FRONTEND-VISUAL-MIGRATION-*.md`; lectura de originales y rutas/features actuales.
  - Hecho cuando: todas las superficies de spec §6 están inventariadas, con código original/destino, recursos/temas/licencias y diferencias; registros distinguen aprobación de referencia y resultado. El responsable elige temas o quedan como bloqueo para HYB-03/04.

- [ ] **HYB-02 — Preparar harness aislado original/unificado/Electron** (H).
  - Requisitos: RV-01, CA-01, CA-04, CA-06, CA-09; plan §4.
  - Dependencia: HYB-01.
  - Archivos: `playwright.visual.config.ts`, `playwright.config.ts` (exclusión de visual), `e2e/visual/{capture.helpers,fixtures}.ts`, `harness.visual.spec.ts`, `.gitignore` sólo artefactos temporales.
  - Tests primero: fallo por estado inesperado/recurso ausente, aislamiento de cookies/storage y API no simulada; captura smoke sin baseline aprobado.
  - Hecho cuando: originales se sirven en 5183/5184 y unificado en 5173 sin modificar originales, tests funcionales no duplican visuales y Electron usa perfil/bridge reales con mocks; capturas identifican contexto y no se promocionan solas a referencia.

- [ ] **HYB-03 — Aprobar lote visual de terminal y adaptación de login** (H).
  - Requisitos: RV-01, RV-02, RV-07, CA-01, CA-03, CA-08, CA-10, CA-12.
  - Dependencias: HYB-01, HYB-02; tema elegido expresamente.
  - Archivos: REFERENCES, escenarios/fixtures de captura y evidence/HYB-03.
  - Alcance: bienvenida, acceso original, POS/cabecera/catálogo/panel; hex/roles, fuentes, espaciado y wireframes fieles. Adaptar login a usuario/contraseña mediante propuesta, no restaurar ID/PIN staff.
  - Hecho cuando: responsable aprueba referencias y adaptación identificadas con rol/estado/viewports y recursos verificables; revisión visual confirma que el lote es comparable. No aprueba caja/cobro ni pantallas no mostradas.

- [ ] **HYB-04 — Aprobar lote visual de cliente** (H).
  - Requisitos: RV-01, RV-02, RV-07, CA-01, CA-03, CA-08, CA-10.
  - Dependencias: HYB-01, HYB-02; tema elegido expresamente.
  - Archivos: REFERENCES, escenarios/fixtures y evidence/HYB-04.
  - Alcance: acceso, menú/cabecera/tarjetas y personalización abierta en móvil/escritorio; tokens y recursos sin cambiar flujo.
  - Hecho cuando: lote aprobado con paleta/roles/fuentes reales y patrón de overlay; datos sintéticos, sin selección de rol/registro público. No aprueba automáticamente la adaptación de cuenta o registro por ticket.

## 3. Terminal

- [ ] **HYB-05 — Portar base, shell y bienvenida de terminal** (U).
  - Requisitos adicionales: RV-07, CA-03, CA-06. Dependencia: HYB-03.
  - Archivos: `SRC/styles/terminal/tokens.css`, assets verificados, `SRC/layouts/TerminalLayout.tsx`, `SRC/features/terminal/auth/TerminalWelcomePage.tsx`, `base.css` sólo globales transferidas.
  - Referencia: lote terminal; shell por CAJERO/PREPARACION/ADMINISTRADOR y bienvenida anónima/sesión activa.
  - Hecho cuando adicional: shell/bienvenida fieles, rutas por rol intactas, cliente oculto en Electron y CSS no contamina cliente; interiores no se declaran migrados por aplicar tokens.

- [ ] **HYB-06 — Portar login staff adaptado** (U, sensible).
  - Requisitos adicionales: CA-03, CA-06. Dependencia: HYB-05 y adaptación login aprobada en HYB-03.
  - Archivo: `SRC/features/terminal/auth/TerminalAuthPage.tsx`.
  - Estados: formulario/enviando, credenciales inválidas, sesión activa y logout fallido.
  - Hecho cuando adicional: apariencia original adaptada fielmente sin ID/PIN demo, selector de rol, cambios de contraseña o alteración de sesión.

- [ ] **HYB-07 — Portar catálogo/categorías del POS** (U).
  - Requisitos adicionales: CA-03. Dependencia: HYB-06.
  - Archivo: `SRC/features/terminal/pos/PosPage.tsx`, sólo catálogo/categorías; referencia heredada del lote y fuentes `OrderingWorkspace.jsx`.
  - Estados: normal, agotado, sin imagen/nombre largo, carga/error/vacío.
  - Hecho cuando adicional: rejilla/categorías/tarjetas fieles y precios/disponibilidad siguen API; se conserva nombre accesible con precio.

- [ ] **HYB-08 — Portar personalización y panel de orden POS** (U).
  - Dependencia: HYB-07. Archivos: `PosPage.tsx` sólo panel/feedback y `SRC/features/clientes/catalog/ProductCustomizationDialog.tsx` compartido.
  - Referencia: patrones del lote y fuentes originales; asociación/confirmación de cliente requieren propuesta previa si difieren de lo ya aprobado.
  - Tests primero: selección mínima/máxima, teclado/foco, cantidades, asociación y orden pendiente/incierta; regresión del consumidor cliente.
  - Hecho cuando adicional: panel y personalización fieles con estado/idempotencia intactos; no se declara pago confirmado ni cambia la apariencia cliente accidentalmente.

- [ ] **HYB-09 — Portar pantalla de caja** (U, sensible).
  - Requisitos adicionales: CA-03. Dependencia: HYB-08.
  - Archivo: `SRC/features/terminal/cash/CashSessionsPage.tsx`; fuente `ShiftWorkspace.jsx`.
  - Pausa previa: aprobar adaptación propia/ajena, apertura/cierre, motivo excepcional e incertidumbre; capturar sólo lo necesario para resolver diferencias.
  - Hecho cuando adicional: importes/acciones fieles con autoridad API, sin cálculo/cierre local ni apertura por montaje; adaptación y resultado aceptados separadamente.

- [ ] **HYB-10 — Portar cobro y recuperación de ticket** (U, sensible).
  - Dependencia: HYB-09. Archivo: `SRC/features/terminal/payment/CashPaymentPage.tsx`; fuente `CheckoutModal.jsx`.
  - Pausa previa: efectivo únicamente, recibido/cambio, timeout, confirmado/ticket fallido y reintento sólo de ticket.
  - Hecho cuando adicional: controles originales adaptados sin medios de pago simulados, idempotencia/conciliación conservadas y ningún fallo de ticket produce nuevo cobro.

- [ ] **HYB-11 — Portar ticket e impresión** (U, sensible).
  - Requisitos adicionales: RV-06, CA-07. Dependencia: HYB-10.
  - Archivo: `SRC/features/terminal/payment/ProtectedTicket.tsx`, estilos de impresión; fuente `ReceiptModal.jsx`.
  - Pausa previa: ancho/formato y QR sintético válido/vencido/ausente; CASH y STRIPE con efectivo nulo.
  - Hecho cuando adicional: preview legible sin navegación, importes/QR y vencimiento intactos; sin secretos reales ni texto copiable del token; no afirmar prueba de impresora física.

- [ ] **HYB-12 — Portar cocina y disponibilidad** (U).
  - Requisitos adicionales: CA-03. Dependencia: HYB-11.
  - Archivos: `SRC/features/terminal/kitchen/KitchenPage.tsx`, `AvailabilityPage.tsx`; fuentes `KitchenWorkspace.jsx` y disponibilidad de `MenuManagementWorkspace.jsx`.
  - Referencias heredadas del shell/patrones y fuentes específicas; revisión previa si cambian controles/transiciones.
  - Hecho cuando adicional: cola/detalle/feedback y disponibilidad fieles, sólo estados y roles existentes, sin conceder CRUD al CAJERO.

- [ ] **HYB-13 — Portar historial y reimpresión** (U, sensible en reimpresión).
  - Requisitos adicionales: CA-03, CA-07. Dependencia: HYB-12.
  - Archivo: `SRC/features/terminal/history/HistoryPage.tsx`; fuente `HistoryWorkspace.jsx`; reutiliza ticket HYB-11.
  - Pausa previa para aprobar específicamente la adaptación de recuperación/reimpresión y sus estados/comportamiento. Se puede enlazar una aprobación anterior sólo si los cubre explícitamente; historial estándar hereda tabla/filtros y fuentes originales.
  - Hecho cuando adicional: filtros/paginación/resumen/foco fieles, reimpresión de lectura sin cobro ni emisión de token nuevo.

- [ ] **HYB-14 — Portar shell/dashboard administrativo** (U).
  - Requisitos adicionales: CA-03. Dependencia: HYB-13.
  - Archivo: `SRC/features/terminal/admin/AdminPage.tsx` sólo shell/dashboard; fuente `AdminDashboardWorkspace.jsx`.
  - Hecho cuando adicional: navegación/indicadores reales fieles, sin estadísticas/proveedores demo y sólo ADMINISTRADOR accede.

- [ ] **HYB-15 — Portar categorías y productos administrativos** (U).
  - Requisitos adicionales: CA-03. Dependencia: HYB-14.
  - Archivo: `AdminPage.tsx` sólo categorías/productos; fuente `MenuManagementWorkspace.jsx`.
  - Tests primero: listado/formulario, validación/error/pendiente incierto, producto sin imagen y campos modificados.
  - Hecho cuando adicional: listado/edición fieles sin cambiar PATCH, validación ni bloqueo tras éxito no verificable; no añadir proveedor de imágenes.

- [ ] **HYB-16 — Portar opciones y configuración de producto** (U).
  - Requisitos adicionales: CA-03. Dependencia: HYB-15.
  - Archivo: `AdminPage.tsx` sólo grupos/valores/asociación; fuentes específicas de `MenuManagementWorkspace.jsx`.
  - Hecho cuando adicional: subformularios fieles, límites/pricingScope/respuestas inciertas y asociaciones conservados; dividir grupos/valores si el bloque deja de ser revisable.

- [ ] **HYB-17 — Portar gestión de personal** (U).
  - Requisitos adicionales: CA-03. Dependencia: HYB-16.
  - Archivo: `AdminPage.tsx` sólo personal; fuente `UserManagementWorkspace.jsx`.
  - Pausa previa si el original presenta roles/PIN o acciones no soportadas; no restaurarlas.
  - Hecho cuando adicional: listado/alta/edición/motivo fieles y autorizados, sin PIN/reset nuevo ni credenciales expuestas en evidencia.

## 4. Cliente

- [ ] **HYB-18 — Portar base, shell y acceso cliente** (U).
  - Requisitos adicionales: RV-07, CA-03, CA-06. Dependencias: HYB-04, HYB-17.
  - Archivos: tokens/assets cliente, `SRC/layouts/ClientLayout.tsx`, `SRC/features/clientes/auth/{ClientAuthPage,PinInput}.tsx`; fuentes `Header.tsx`, `AuthPage.tsx` y `PinInput.tsx` originales.
  - Hecho cuando adicional: identidad/entrada fieles, teléfono/número/NIP/invitado y logout al sustituir actor intactos; estilos cliente no alteran terminal.

- [ ] **HYB-19 — Portar catálogo y tarjetas cliente** (U).
  - Dependencia: HYB-18. Archivo: `SRC/features/clientes/catalog/ClientCatalogPage.tsx`; fuentes `MenuPage.tsx`, `ProductCard.tsx`.
  - Estados: categorías/paginación, sin imagen/agotado, carga/error/vacío y nombre largo.
  - Hecho cuando adicional: menú fiel en móvil/escritorio, API sigue única fuente sin respaldo local operativo.

- [ ] **HYB-20 — Portar personalización y carrito cliente** (U).
  - Dependencia: HYB-19. Archivos: `ProductCustomizationDialog.tsx` compartido y `SRC/features/clientes/cart/ClientCart.tsx` sólo líneas/controles/contenedor; fuentes `ProductModal.tsx`, `CartDrawer.tsx`.
  - Hecho cuando adicional: overlays/panel fieles y accesibles, opciones/importes/borrador permitido intactos; consumidor POS comparado sin regresión. No cambiar creación/confirmación aún.

- [ ] **HYB-21 — Portar envío y confirmación de pedido** (U, sensible).
  - Dependencia: HYB-20. Archivo: `ClientCart.tsx` sólo acción/feedback de envío; fuente `OrderConfirmationModal.tsx`.
  - Pausa previa: orden pendiente vs pago, red incierta y reintento explícito; no checkout Stripe ni QR CASH.
  - Hecho cuando adicional: confirmación fiel sin éxito falso ni reintento automático/regeneración de clave tras incertidumbre.

- [ ] **HYB-22 — Portar cuenta, favoritos e historial** (U, sensible).
  - Requisitos adicionales: CA-03. Dependencia: HYB-21.
  - Archivo: `SRC/features/clientes/account/ClientAccountPage.tsx`; fuentes `ProfileModal.tsx`, `OrderHistoryModal.tsx` y favoritos originales.
  - Pausa previa: composición en `/cliente/cuenta`, preview de repetir sin cobro y patrones de formularios/listas. Si es demasiado amplio, dividir perfil/favoritos e historial antes del código.
  - Hecho cuando adicional: cuenta fiel a adaptación aceptada, propiedad/rollback/limpieza intactos, sin convertir la ruta en modal ni cobrar al repetir.

- [ ] **HYB-23 — Portar registro por ticket** (U, sensible).
  - Requisitos adicionales: CA-03. Dependencia: HYB-22.
  - Archivo: `SRC/features/clientes/registration/TicketRegistrationPage.tsx`; patrones de AuthPage, sin original directo.
  - Pausa previa: formulario, sesión activa/logout, usado/vencido, cuenta creada y login explícito.
  - Hecho cuando adicional: adaptación fiel al lenguaje cliente, token sólo en memoria y sin sesión automática; no inventar una captura original de este flujo.

## 5. Transversal y aceptación

- [ ] **HYB-24 — Portar estados públicos, denegaciones y cambio de actor** (U, sensible).
  - Requisitos adicionales: CA-03, CA-06. Dependencia: HYB-23.
  - Archivos: `SRC/app/router.tsx` sólo markup de entrada/404/sesión restringida; `SRC/app/guards.tsx` sólo presentación de denegaciones; `SRC/shared/auth/ActorChangeDialog.tsx`.
  - Pausa previa: adaptaciones sin original directo y diálogo por área; separar por superficie si es necesario para revisión segura.
  - Hecho cuando adicional: error/denegación legibles y fieles a patrones acordados, mismos roles/guardas/destinos/confirmación/logout y foco; no añadir cambio de NIP funcional ni acceso cliente en Electron.

- [ ] **HYB-25 — Auditar reproducción integral y aceptar resultados** (D, H).
  - Requisitos: RV-01…RV-08, CA-01…CA-12. Dependencias: HYB-05…HYB-24 cerradas.
  - Archivos: DOC/VALIDATION con nombre completo, REFERENCES y STATUS; no cambios UI en esta task.
  - Verificación: suites completas, matriz por pantalla/estado/rol, recursos/colores, reflow/zoom, teclado/foco, contraste/reduced-motion, Electron e impresión. Distinguir pruebas ejecutadas/omitidas/bloqueadas y capturas realmente vistas.
  - Hecho cuando: cada requisito/superficie enlaza una implementación y evidencia revisada/aceptada, sin huecos ocultos bajo un lote genérico; aceptación integral explícita del responsable y ningún bloqueo del alcance visual. Despliegue HTTPS/fallback y retiro de apps siguen fuera de alcance.

## 6. Refinamientos y cobertura

No implementar una task genérica de «mejorar todo». Tras la reproducción, cada refinamiento opcional de `frontend-design` requiere propuesta concreta, antes/después, archivos, requisitos, criterio verificable y aprobación independiente. Si no se solicita, no bloquea una reproducción fiel aceptada.

| Requisitos | Entregas |
| --- | --- |
| RV-01, CA-01 | HYB-01…HYB-04, registro por bloque y HYB-25 |
| RV-02, CA-02 | Lotes y comparativas de HYB-05…HYB-24 |
| RV-03, CA-10 | Inventario, bases HYB-05/18 y regresión compartida |
| RV-04, CA-05 | Contrato U por bloque y auditoría HYB-25 |
| RV-05, CA-04 | Estados de cada bloque, tests y diff de lógica |
| RV-06, CA-07 | HYB-11, reimpresión HYB-13, HYB-25 |
| RV-07, RV-08, CA-11 | Lotes/tokens y separación de refinamientos conforme a la spec revisada |
| CA-03, CA-12 | Login, operaciones sensibles, cuenta y transversales con aprobación previa |
| CA-06 | Harness Electron, terminal y checks de ambos shells |
| CA-08 | Revisiones/aceptación al final de cada bloque y HYB-25 |
| CA-09 | Todos los contratos, revisión final de diff/originales |

**Próxima task a autorizar:** HYB-02 (harness aislado), una vez cerrado HYB-01. Hay 25 tasks en total; completar el inventario no aprueba herramientas, capturas, temas ni los bloques siguientes. El ajuste documental del enfoque no es una task de implementación ni una aprobación de capturas.
