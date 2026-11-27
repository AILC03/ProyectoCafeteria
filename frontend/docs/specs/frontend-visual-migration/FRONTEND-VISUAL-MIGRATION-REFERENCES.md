# Referencias e inventario — SPEC-FE-VIS-001

**Task:** HYB-01 · **Rama base:** `AILC03/ProyectoCafeteria:feat/frontend-visual-migration` · **Commit inventariado:** `c88d01b`.

Este inventario proviene de lectura de código; **no son capturas ni referencias visuales aprobadas**. Los originales siguen intactos. HYB-02 preparará capturas con contenido sintético y HYB-03/04 solicitarán la aprobación del lote y del tema. Una referencia de código no equivale a una referencia visual aceptada.

## Identidad, recursos y riesgos comprobados

| Área | Fuentes en el original | Hechos observados / pendiente |
| --- | --- | --- |
| Terminal | `frontend/empleados/src/styles/index.css`, `frontend/empleados/index.html`, `src/components/MenuModal.jsx` | CSS declara Outfit/Inter mediante Google Fonts; `:root` incluye fondo `#ffffff`, texto `#0f172a`, acento `#2563eb`, radios 8–32 px. `MenuModal.jsx` enumera `theme-nordic`, `theme-dark`, `theme-latte` y `theme-mint`; **tema de referencia no elegido**. Verificar colores/fuentes cargados en ejecución. No copiar resets globales `user-select: none`, `overflow: hidden` u `outline: none`. Iconografía y recursos incrustados deben inspeccionarse por superficie; no se localizaron archivos PNG/SVG/woff propios bajo `empleados/src/`. |
| Cliente | `frontend/clientes/src/index.css`, `tailwind.config.js`, `index.html`, `src/pages/` y `src/components/` | Fondo `#fcf9f6`, texto `#1b1c1a` y paleta ampliada en Tailwind; Plus Jakarta Sans y Material Symbols Outlined se solicitan a Google Fonts. Hay imágenes en `src/assets/hero.png` y `public/{logo.png,coffees-pos-logo.png,favicon.svg,icons.svg,icon-192.png,icon-512.png}`; verificar uso, licencia, variante y disponibilidad antes de migrarlas. **No se autoriza añadir CDN ni copiar recursos todavía**. |
| Destino | `frontend/unified/src/styles/base.css`, `src/layouts/`, `src/features/` | `system-ui`, fondo blanco y estilos genéricos; foco visible ya implementado. La separación visual cliente/terminal y los cambios a componentes compartidos deberán verificarse en ambos consumidores. |

**Licencias/procedencia:** los ficheros originales están dentro del repositorio, pero este inventario no acredita licencia independiente de imágenes, tipografías ni iconos externos. Verificar procedencia y carga efectiva durante HYB-02/03/04 antes de copiar recursos o versionar capturas. No usar credenciales ni datos operativos reales para capturar originales.

**Recursos/temas por superficie (inventario de código, no uso aprobado):** los temas terminal de `MenuModal.jsx` son opciones globales; **no** se presume que todas las superficies tengan cuatro variantes comprobadas. Cada fila de terminal HYB-05…17 usa como referencia candidata `empleados/src/styles/index.css` y la fuente visual específica de su columna «Original»; SVG en JSX y emoji requieren inspección en cada vista al capturar. En especial HYB-14 (`AdminDashboardWorkspace.jsx`) y HYB-07/08 (`OrderingWorkspace.jsx`, `PosHeader.jsx`) incluyen SVG inline; HYB-15/16 (`MenuManagementWorkspace.jsx`) incluyen emoji; no se han identificado recursos gráficos propios en `empleados/src/`. La licencia/carga de Outfit/Inter queda **sin verificar para cada fila**; la variante elegida debe anotarse por superficie en HYB-03 y al cerrar su bloque.

Las filas de cliente HYB-18…24 comparten paleta de `clientes/tailwind.config.js`, Plus Jakarta Sans/Material Symbols de `clientes/index.html` y CSS de `src/index.css`; licencia y carga **sin verificar para cada fila**. Recursos concretos vistos: HYB-18 usa `/logo.png` en `AuthPage.tsx` y `Header.tsx`; HYB-19/20/22 usan imágenes de producto recibidas de datos (origen/licencia variable, sustituir por fixture sintético en capturas) e iconos Material Symbols en `ProductCard.tsx`, `CartDrawer.tsx` y `OrderHistoryModal.tsx`; HYB-21 usa iconos de `OrderConfirmationModal.tsx`; HYB-23/24 heredan sólo patrones del área, **sin recurso original propio confirmado**. `src/assets/hero.png`, favicon e iconos de `public/` existen, pero **no se ha confirmado su uso en esas superficies** ni su licencia. HYB-01 no elige entre variantes ni aprueba copiar archivos.

## Superficies de terminal (vista original → destino)

Las rutas y guardas de destino se contrastaron con `frontend/unified/src/app/router.tsx`; las fuentes originales se verificaron como archivos existentes. Estados y roles son **escenarios a capturar**, no pruebas ya ejecutadas. Por defecto comprobar carga, vacío, error, denegación y foco si aplican.

| Superficie / task prevista | Original (código y presentación) | Destino unificado / escenarios | Diferencia o decisión pendiente |
| --- | --- | --- | --- |
| `/terminal` · HYB-05 | `empleados/src/components/WelcomeScreen.jsx`, `src/styles/index.css` | `features/terminal/auth/TerminalWelcomePage.tsx`, `layouts/TerminalLayout.tsx`; anónimo / sesión de personal; 1024×768 y 1280×800 propuestos | Preservar bienvenida y destinos reales; aprobar tema terminal en HYB-03. |
| `/terminal/acceso` · HYB-06 | `EmployeeIdScreen.jsx`, `EmployeePinScreen.jsx`, `AdminAuthModal.jsx`, CSS original | `features/terminal/auth/TerminalAuthPage.tsx`; anónimo, enviando, inválido, logout fallido; mismos viewports | **Adaptación previa obligatoria**: estética original, pero usuario/contraseña API; nunca ID/PIN demo ni selector de rol. |
| `/terminal/pos` catálogo · HYB-07 | `OrderingWorkspace.jsx`, `PosHeader.jsx`, CSS original | `features/terminal/pos/PosPage.tsx`; CAJERO/ADMINISTRADOR, categorías, agotado, sin imagen, carga/vacío/error | POS mantiene precios/disponibilidad de API; patrón de rejilla y tarjetas a aprobar en lote. |
| `/terminal/pos` panel y opciones · HYB-08 | `OrderingWorkspace.jsx`, `MenuModal.jsx`, CSS original | `PosPage.tsx`, `features/clientes/catalog/ProductCustomizationDialog.tsx`; selección, orden pendiente/incierta | Diálogo compartido con cliente: evitar contaminación; asociación de cliente requiere decisión si no tiene patrón aprobado. |
| `/terminal/caja` · HYB-09 | `ShiftWorkspace.jsx`, CSS original | `features/terminal/cash/CashSessionsPage.tsx`; caja propia/ajena, apertura/cierre, error | **Adaptación previa** de importes API, responsable, motivo y resultado incierto; sin apertura local automática. |
| `/terminal/cobro` · HYB-10 | `CheckoutModal.jsx`, CSS original | `features/terminal/payment/CashPaymentPage.tsx`; CASH, pendiente, éxito, timeout, ticket fallido | **Adaptación previa**: no ofrecer medios de pago ficticios ni nuevo cobro tras fallo de ticket. |
| Ticket / impresión · HYB-11 | `ReceiptModal.jsx`, CSS original | `features/terminal/payment/ProtectedTicket.tsx`; CASH/STRIPE, QR sintético válido/vencido/ausente, preview | **Adaptación previa** de ancho, QR e impresión; sin token real ni prueba de impresora física inferida. |
| `/terminal/cocina` y `/terminal/disponibilidad` · HYB-12 | `KitchenWorkspace.jsx`, `MenuManagementWorkspace.jsx`, CSS original | `features/terminal/kitchen/{KitchenPage,AvailabilityPage}.tsx`; PREPARACION/CAJERO/ADMINISTRADOR según guarda, lista/vacío/conflicto | No portar CRUD administrativo al CAJERO ni estados de orden locales. |
| `/terminal/historial` · HYB-13 | `HistoryWorkspace.jsx`, `ReceiptModal.jsx`, CSS original | `features/terminal/history/HistoryPage.tsx` y ticket protegido; filtros/páginas/reimpresión | **Adaptación previa** para reimpresión de lectura y permiso; sin cobro o QR nuevo. |
| `/terminal/administracion/*` shell/dashboard · HYB-14 | `AdminDashboardWorkspace.jsx`, `PosHeader.jsx`, CSS original | `features/terminal/admin/AdminPage.tsx`; ADMINISTRADOR, dashboard/denegación | Datos sólo de API; sin indicadores demo/proveedores simulados. |
| Administración catálogo/productos · HYB-15 | `MenuManagementWorkspace.jsx`, CSS original | `AdminPage.tsx`; listado, edición, sin imagen, error/incierto | Mantener PATCH y bloqueo ante resultado no verificable. |
| Administración opciones/configuración · HYB-16 | `MenuManagementWorkspace.jsx`, CSS original | `AdminPage.tsx`; grupos, valores, configuración | Preservar límites, pricingScope y asociaciones. |
| Administración personal · HYB-17 | `UserManagementWorkspace.jsx`, CSS original | `AdminPage.tsx`; listado/alta/edición/motivo, error | **Pausa si aparece PIN/rol demo**; no registrar credenciales en evidencias. |

## Superficies de cliente y transversales

Para cliente se proponen 390×844 y 1280×800; comprobar además reflow a 320 px y zoom al 200 %. Los tamaños **no están aprobados**. Reutilizar `clientes/src/index.css`, `tailwind.config.js` y componentes concretos como fuentes, sin importar contextos legados.

| Superficie / task prevista | Original (código y presentación) | Destino unificado / escenarios | Diferencia o decisión pendiente |
| --- | --- | --- | --- |
| `/cliente/iniciar-sesion` y shell · HYB-18 | `clientes/src/pages/AuthPage.tsx`, `src/components/{PinInput,Header}.tsx`, CSS/Tailwind | `features/clientes/auth/{ClientAuthPage,PinInput}.tsx`, `layouts/ClientLayout.tsx`; anónimo/CLIENTE/invitado, login inválido/logout | Mantener login real y sustitución de actor; sin selección de rol. |
| `/cliente/menu` catálogo · HYB-19 | `MenuPage.tsx`, `components/{Header,ProductCard}.tsx`, CSS/Tailwind | `features/clientes/catalog/ClientCatalogPage.tsx`; categorías, agotado, sin imagen, nombre largo, carga/vacío/error | No usar catálogo local operativo. |
| Personalización y carrito · HYB-20 | `components/{ProductModal,CartDrawer}.tsx`, CSS/Tailwind | `features/clientes/catalog/ProductCustomizationDialog.tsx`, `features/clientes/cart/ClientCart.tsx`; diálogo abierto, teclado/foco, vacío/errores | Componente compartido con POS; comprobar ambos consumidores. |
| Envío/confirmación pedido · HYB-21 | `components/OrderConfirmationModal.tsx`, `CartDrawer.tsx`, CSS/Tailwind | `ClientCart.tsx`; pendiente/éxito autorizado/red incierta | **Adaptación previa**: crear orden no implica pago ni checkout Stripe. |
| `/cliente/cuenta` · HYB-22 | `components/{ProfileModal,OrderHistoryModal}.tsx` y favoritos en `pages/MenuPage.tsx`/componentes, CSS/Tailwind | `features/clientes/account/ClientAccountPage.tsx`; perfil/favoritos/historial/repetición, error/rollback | **Adaptación previa**: cuenta es ruta, no convertirla implícitamente en modal; repetir no cobra. |
| `/cliente/registro-ticket` · HYB-23 | Patrones de `pages/AuthPage.tsx`; **sin pantalla original directa** | `features/clientes/registration/TicketRegistrationPage.tsx`; anónimo/sesión activa, usado/vencido/éxito | **Adaptación previa** específica; token sólo en memoria, login explícito. No inventar captura original. |
| `/`, `/cambiar-nip`, 404, acceso denegado, cambio de actor · HYB-24 | Sin equivalente original confirmado; patrones de `AuthPage.tsx`, `WelcomeScreen.jsx`, avisos y modales según área | `app/{router,guards}.tsx`, `shared/auth/ActorChangeDialog.tsx`; público/denegado/restringido, confirmación/logout fallido | **Adaptación previa** por área; no añadir funcionalidad de cambio NIP ni acceso cliente en Electron. |

## Registro de referencias / aprobaciones

| ID | Tipo | Superficies | Tema, commit, viewport, rol/estado y fixture | Aprobación del responsable | Estado |
| --- | --- | --- | --- | --- | --- |
| REF-T | Lote terminal (HYB-03) | `bienvenida`, `acceso`, `pos` (`PosHeader` + `OrderingWorkspace`) | Tema elegido: `theme-nordic` (*Nordic Mint*); viewports: `1024×768`, `1280×800`; fuente `c88d01b` / captura `5595892` en `evidence/HYB-03/`; actores sintéticos `visitante` y `CAJERO` | Aprobado explícitamente por el responsable (2026-11-25) | Aprobado |
| ADAPT-LOGIN-STAFF | Adaptación previa (HYB-03 / HYB-06) | `/terminal/acceso` (`TerminalAuthPage.tsx`) | Tema `theme-nordic`; viewports `1024×768`, `1280×800`; formulario único usuario (hasta 24 chars, `isValidStaffUsername`) y contraseña (`8–24` chars, `isValidStaffPassword`) en `.kiosk-chassis`, estados `loading`, `recoverable-error`, `authenticated` y `role="alert"` | Aprobado explícitamente por el responsable (2026-11-25) | Aprobado |
| REF-C | Lote cliente (HYB-04) | `acceso` (`AuthPage.tsx`), `menu` (`Header.tsx` + `MenuPage.tsx` + `ProductCard.tsx`), `personalizacion` (`ProductModal.tsx`) | Paleta única café/crema (`#fcf9f6`, `#0f0301`, `#974818`); viewports `390×844`, `1280×800`; fuente `c88d01b` / captura `6f7ce51` en `evidence/HYB-04/`; actores sintéticos `visitante` y `CLIENTE` | Aprobado explícitamente por el responsable (2026-11-26) | Aprobado |
| ADAPT-CASH-SESSION | Adaptación previa (HYB-09) | `/terminal/caja` | Ver diseño bajo esta tabla; `theme-nordic`, viewports `1024×768`, `1280×800`; API única autoridad, estados propia/ajena e incierto | Aprobado explícitamente por el responsable (2026-11-26) antes de implementar HYB-09 | Aprobado como entrada, no resultado |
| ADAPT-CASH-PAYMENT | Adaptación previa (HYB-10) | `/terminal/cobro` | Ver diseño bajo esta tabla; `CheckoutModal.jsx` como fuente visual; sólo CASH, orden y caja confirmadas por API | Aprobado explícitamente por el responsable (2026-11-26) antes de implementar HYB-10 | Aprobado como entrada, no resultado |
| ADAPT-PROTECTED-TICKET | Adaptación previa (HYB-11) | `ProtectedTicket.tsx` en cobro e historial | Ver diseño bajo esta tabla; `ReceiptModal.jsx` como fuente visual; datos de ticket API, QR condicionado por vencimiento | Aprobado explícitamente por el responsable (2026-11-26) antes de implementar HYB-11 | Aprobado como entrada, no resultado |
| ADAPT-HISTORY-REPRINT | Adaptación previa (HYB-13) | `/terminal/historial` | Ver diseño bajo esta tabla; historial sólo de ventas de API, reimpresión GET del ticket protegido existente | Aprobado explícitamente por el responsable (2026-11-26) antes de implementar HYB-13 | Aprobado como entrada, no resultado |
| ADAPT-STAFF-ADMIN | Adaptación previa (HYB-17) | `/terminal/administracion/personal` | Ver diseño bajo esta tabla; tabla/formulario Nordic, roles de contrato y contraseña nueva sólo en alta API | Aprobado explícitamente por el responsable (2026-11-26) antes de implementar HYB-17 | Aprobado como entrada, no resultado |
| ADAPT-* | Adaptación previa (resto de bloques) | caja/cobro/ticket, reimpresión, cuenta, registro y transversales | Por proponer por bloque; nunca sustituir fuente original por UI nueva | No solicitada | Pendiente |

### Adaptación HYB-09 — `ADAPT-CASH-SESSION` (aprobada como entrada, 2026-11-26)

Fuente visual: `frontend/empleados/src/components/ShiftWorkspace.jsx` y `frontend/empleados/src/styles/index.css`; destino: `frontend/unified/src/features/terminal/cash/CashSessionsPage.tsx`. El responsable autorizó la adaptación de presentación descrita a continuación, **no cambios de lógica ni la aceptación anticipada del resultado**.

- Retener identidad `theme-nordic`: superficie gris claro, tarjetas blancas/borde pizarra claro, monto destacado, secciones de apertura/cierre y resumen. Mostrar sólo valores de `getCurrentCashSession` y sus respuestas verificadas; no portar métricas demo de IndexedDB, total local, exportación JSON ni medios de pago simulados.
- Caja cerrada: fondo inicial escrito por el cajero, sin valor prellenado de `500` ni apertura automática. Caja abierta: resumen API, responsable real, efectivo contado editable sólo por rol permitido; administrador que cierra caja ajena ve campo de motivo obligatorio ya existente. No añadir controles para CAJERO sobre caja ajena.
- Estado incierto: mantener el bloqueo tras respuesta no verificable y reintento únicamente de la misma operación idempotente donde ya está permitido; error de consulta no significa caja cerrada; no declarar apertura/cierre confirmado antes de respuesta API.
- Evidencia pendiente: capturas original/adaptación a `1024×768` y `1280×800`, estados propia/ajena, abierta/cerrada, error e incertidumbre; pruebas de permisos, teclado, axe, Electron y aceptación separada del resultado.

### Adaptación HYB-10 — `ADAPT-CASH-PAYMENT` (aprobada como entrada, 2026-11-26)

Fuente visual: `frontend/empleados/src/components/CheckoutModal.jsx`; destino: `frontend/unified/src/features/terminal/payment/CashPaymentPage.tsx`. El responsable autorizó la presentación bajo estos límites, no el resultado anticipadamente:

- Portar la jerarquía Nordic de total prominente, campo de efectivo recibido y acción principal; no ofrecer tarjeta/transferencia simuladas, billetes rápidos ni prellenado automático. Conservar la página/ruta protegida en lugar de convertirla en modal que se cierre perdiendo estado.
- Mostrar cambio sólo si lo confirma la respuesta API de pago (si el contrato lo proporciona); cualquier estimación previa debe etiquetarse como estimación, nunca como pago confirmado. El importe total y la elegibilidad de caja provienen exclusivamente de la API y las reglas existentes.
- Mantener idempotencia y reintento de la misma operación ante fallo incierto permitido, bloqueo por resultado no verificable, y conciliación manual D-20 tras recarga. Tras pago confirmado y ticket fallido, permitir únicamente reintento GET de ticket, nunca otro POST de cobro.
- Evidencia prevista: estados dueño/ajeno, pendiente/timeout/no verificable, éxito con ticket y éxito con ticket fallido a `1024×768`/`1280×800`; pruebas de accesibilidad, teclado y Electron. La aprobación de esta adaptación no equivale a aceptación del resultado.

### Adaptación HYB-11 — `ADAPT-PROTECTED-TICKET` (aprobada como entrada, 2026-11-26)

Fuente: `frontend/empleados/src/components/ReceiptModal.jsx`; destino compartido: `frontend/unified/src/features/terminal/payment/ProtectedTicket.tsx` y estilos de impresión. El responsable autorizó esta adaptación, no la aceptación anticipada del resultado:

- Portar chasis térmico, tipografía, separadores y jerarquía de total como presentación del ticket verificado de API; conservar tabla semántica y botón de impresión. No inventar comercio, RFC, IVA, descuentos, propinas, medio de pago o pie configurado en `localStorage` que el contrato de ticket no provea.
- Evitar imprimir navegación o acciones; elegir ancho térmico estable como estilo, sin leer preferencias locales ni afirmar compatibilidad con impresora física. Vista previa no navega ni reabre cobro.
- QR únicamente si `registration` API es válida y no vencida; no mostrar ni hacer copiable texto del token o `qrPayload`. CASH muestra recibido/cambio sólo cuando existen; STRIPE los omite. Conservar estados vencido/ausente y alternativa accesible.
- Evidencia y pruebas antes de darlo por terminado: capturas a 1024×768/1280×800, efectivo/STRIPE, QR sintético válido/vencido/ausente, impresión a PDF simulada, teclado, axe y Electron; revisión independiente por separado.

### Adaptación HYB-13 — `ADAPT-HISTORY-REPRINT` (aprobada como entrada, 2026-11-26)

Fuente: `frontend/empleados/src/components/HistoryWorkspace.jsx`; destino: `frontend/unified/src/features/terminal/history/HistoryPage.tsx`, con `ProtectedTicket.tsx` HYB-11. El responsable autorizó la presentación bajo estos límites, no el resultado anticipadamente:

- Portar jerarquía Nordic de filtros disponibles (fecha, método, cantidad), resumen y tabla, más acción claramente nombrada «Ver ticket»; no copiar búsqueda local por mesa/nombre, tipos «comer aquí/para llevar», cajero ficticio, fallback IndexedDB, ni contador de todas las ventas calculado desde la página.
- Mantener consulta de ventas y resumen API con paginación por cursor; la reimpresión consulta únicamente GET del ticket protegido ya emitido para venta autorizada. No crear cobro, emitir acceso/QR nuevo ni inferir QR vigente desde la lista; mantener estados de denegación, ausente, carga y foco que vuelve al botón.
- Capturas 1024×768 y 1280×800 de lista, vacía/error, filtros, lectura CASH/STRIPE; comprobar teclado, axe, Electron y que ningún POST sale al reimprimir. Aprobación de esta adaptación no equivale a aceptación del resultado.

### Adaptación HYB-17 — `ADAPT-STAFF-ADMIN` (aprobada como entrada, 2026-11-26)

Fuente: `frontend/empleados/src/components/UserManagementWorkspace.jsx`; destino: `frontend/unified/src/features/terminal/admin/AdminPage.tsx` sólo colección `employees`. La fuente original mezcla cuenta API con respaldo local que guarda `pin: formPassword` y ofrece rol `GERENTE`; **no copiar esas operaciones**. El responsable autorizó la adaptación visual limitada, no la aceptación anticipada:

- Portar tarjetas/listado/encabezado y formulario Nordic con nombre, usuario, rol, estado, alta y motivo de edición, usando sólo la API protegida para ADMINISTRADOR. Mostrar únicamente roles asignables reales `CAJERO`, `PREPARACION`, `ADMINISTRADOR`; si llega un `GERENTE` legado, sólo lectura/deshabilitado como ya exige la lógica actual.
- Contraseña nueva exclusivamente en alta conforme al contrato; nunca mostrar ni precargar secreto en edición ni ponerlo en capturas o almacenamiento local. Sin restablecer NIP/contraseña, alta/reactivación automática, baja local o autoasignación de permisos.
- Mantener validación, reconsulta/bloqueo tras respuesta incierta, motivo obligatorio para modificaciones y ausencia de acceso CAJERO/PREPARACION. Capturas con actor/datos sintéticos a 1024×768 y 1280×800, estados de alta/edición/denegación/error; axe, teclado y Electron. Aprobar adaptación no acepta resultado final.

## Lote visual de terminal — `REF-T` (HYB-03, Aprobado 2026-11-25)

- **Elección expresa del responsable:** tema `theme-nordic` (*Nordic Mint*) y viewports confirmados `1024×768` y `1280×800`.
- **Especificación de captura:** [`hyb03-terminal-batch.visual.spec.ts`](file:///c:/Trabajo/Antigravity/ProyectoCafeteria/frontend/unified/e2e/visual/hyb03-terminal-batch.visual.spec.ts) → evidencias en `frontend/docs/specs/frontend-visual-migration/evidence/HYB-03/<surface>/<viewport>/` (`bienvenida`, `acceso`, `pos`).

### Tokens de diseño (`theme-nordic`, extraídos de `frontend/empleados/src/styles/index.css`)

| Rol | Token / Selector | Valor exacto |
| --- | --- | --- |
| Fondo principal | `--bg-primary`, `--bg-display`, `--bg-card` | `#ffffff` |
| Fondo secundario / panel kiosco | `--bg-secondary`, `--bg-kiosk-panel` | `#f8fafc`, `#f1f5f9` |
| Botón primario (`EMPEZAR`) | `--bg-btn-primary` / `:hover` | `#c2cacf` / `#b0bac0` |
| Panel derecho bienvenida (`theme-nordic`) | `--welcome-panel-bg` | `linear-gradient(145deg, #f8fafc 0%, #edf2f7 50%, #e2e8f0 100%)` |
| Tarjeta reloj (`theme-nordic`) | `--welcome-clock-card-bg`, `--welcome-clock-card-border` | `rgba(255, 255, 255, 0.82)`, `rgba(255, 255, 255, 0.95)` |
| Texto reloj (`theme-nordic`) | `--welcome-date-color`, `--welcome-time-color` | `#64748b`, `#0f172a` |
| Textos base | `--text-main`, `--text-muted`, `--text-subtle`, `--text-light` | `#0f172a`, `#64748b`, `#94a3b8`, `#ffffff` |
| Bordes y foco | `--border-light`, `--border-focus` | `#e2e8f0`, `#3b82f6` |
| Semánticos | `--color-success`, `--color-danger`, `--color-warning`, `--color-accent` | `#10b981`, `#ef4444`, `#f59e0b`, `#2563eb` |
| Radios | `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, píldora | `8px`, `14px`, `20px`, `32px`, `9999px` |
| Espaciado y contenedores clave | `.welcome-left`/`.welcome-right`, `.welcome-clock-box`, `.kiosk-chassis` | `padding: 3rem`; `padding: 3rem 4rem`; `max-width: 440px`, `padding: 1.75rem`, `border-radius: 32px` |

### Tipografía y resets excluidos

- **Fuentes:** `'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` (declaradas vía Google Fonts en `frontend/empleados/index.html`). **Licencia y carga efectiva pendientes de verificación** en la ejecución de captura HYB-03 antes de copiar o empaquetar fuentes locales.
- **Superficies del lote:**
  1. `bienvenida` (`WelcomeScreen.jsx` → `/terminal`): layout dividido horizontalmente (`.welcome-left` blanca con marca, subtítulo y botón píldora `EMPEZAR`; `.welcome-right.theme-nordic` con tarjeta translúcida de fecha y reloj tabular).
  2. `acceso` (`EmployeeIdScreen.jsx` + `EmployeePinScreen.jsx` → `/terminal/acceso`): contenedor centrado `.kiosk-chassis` (`440px`, radio `32px`, borde `#e2e8f0`); sujeto a la adaptación `ADAPT-LOGIN-STAFF`.
  3. `pos` (`PosHeader.jsx` + `OrderingWorkspace.jsx` → `/terminal/pos`): cabecera superior fija `.pos-top-nav` con marca, pestañas por rol y reloj/menú de usuario; rejilla `.pos-workspace-grid` con barra de categorías/búsqueda, tarjetas de producto y panel lateral de orden.
- **Resets heredados excluidos del destino unificado:** `user-select: none` global, `overflow: hidden` en `html, body` y `#app-viewport`, y `outline: none` en `button` (se conserva foco visible accesible en `unified`).

## Propuesta de adaptación — `ADAPT-LOGIN-STAFF` (Aprobada 2026-11-25)

- **Superficie:** `/terminal/acceso` (`frontend/unified/src/features/terminal/auth/TerminalAuthPage.tsx`).
- **Motivo:** el original (`EmployeeIdScreen.jsx` + `EmployeePinScreen.jsx`) divide el acceso en dos pasos con lista rápida de empleados (`.quick-employees-list`), selección por avatar/rol y fallback local (`verifyEmployeeCredentials`), lo cual incumple la seguridad del unificado (ADR 0005 / cookies `HttpOnly` de API).
- **Diseño aprobado:**
  - Mantener la estética de `theme-nordic` y el contenedor `.kiosk-chassis` (`max-width: 440px`, fondo `#ffffff`, borde `#e2e8f0`, `border-radius: 32px`, `padding: 1.75rem`).
  - **Formulario único** de usuario (`isValidStaffUsername`, hasta 24 caracteres) y contraseña (`isValidStaffPassword`, `8–24` caracteres) sin dividir en dos pantallas.
  - **Exclusiones obligatorias:** sin `.quick-employees-list`, sin chips demo, sin selector de rol y sin fallback local ni credenciales en cliente.
  - **Estados y accesibilidad:**
    - `loading`: mensaje de comprobación de sesión con `aria-live="polite"`.
    - `recoverable-error` / error de envío: alerta accesible con `role="alert"` y foco preservado sin perder el contexto del formulario.
    - `authenticated`: tarjeta resumen dentro de `.kiosk-chassis` con destino real según rol y acción segura de cambio de actor (`replaceActor`).
- **Estado:** **Aprobado explícitamente por el responsable (2026-11-25)** como entrada para HYB-06 (no aprueba el resultado implementado hasta cerrar HYB-06).

## Lote visual de cliente — `REF-C` (HYB-04, Aprobado 2026-11-26)

- **Paleta única confirmada (sin selector de tema):** esquema café/crema original extraído de [`frontend/clientes/tailwind.config.js`](file:///c:/Trabajo/Antigravity/ProyectoCafeteria/frontend/clientes/tailwind.config.js) y [`frontend/clientes/src/index.css`](file:///c:/Trabajo/Antigravity/ProyectoCafeteria/frontend/clientes/src/index.css); viewports confirmados **`390×844`** (móvil) y **`1280×800`** (escritorio).
- **Especificación de captura:** [`hyb04-client-batch.visual.spec.ts`](file:///c:/Trabajo/Antigravity/ProyectoCafeteria/frontend/unified/e2e/visual/hyb04-client-batch.visual.spec.ts) → evidencias en `frontend/docs/specs/frontend-visual-migration/evidence/HYB-04/<surface>/<viewport>/` (`acceso`, `menu`, `personalizacion`).
- **Estado:** **Aprobado explícitamente por el responsable (2026-11-26)** como lote de referencia comparable para `HYB-18…HYB-20` (no aprueba automáticamente cuenta, registro por ticket ni copia de fuentes/activos externos sin verificar licencia y empaquetado local).

### Tokens de diseño (`REF-C`, extraídos de `frontend/clientes/tailwind.config.js` y `src/index.css`)

| Rol | Token / Selector | Valor exacto |
| --- | --- | --- |
| Fondo principal / superficie | `surface`, `background`, `surface-bright` (`body`) | `#fcf9f6` |
| Superficies elevadas / tarjetas | `surface-container-lowest`, `surface-container-low`, `surface-container`, `surface-container-high`, `surface-container-highest` | `#ffffff`, `#f6f3f0`, `#f0edea`, `#eae8e5`, `#e5e2df` |
| Primario y contenedores oscuros | `primary`, `primary-container`, `on-primary`, `on-primary-container` | `#0f0301`, `#2d1a12`, `#ffffff`, `#9e8074` |
| Secundario / acento cálido | `secondary`, `secondary-container`, `on-secondary`, `on-secondary-container` | `#974818`, `#fc9761`, `#ffffff`, `#742e00` |
| Terciario | `tertiary`, `tertiary-container`, `on-tertiary` | `#080503`, `#221e1a`, `#ffffff` |
| Textos base | `on-surface` / `on-background`, `on-surface-variant` | `#1b1c1a`, `#4f4440` |
| Bordes y divisores | `outline`, `outline-variant` | `#817470`, `#d3c3be` |
| Semánticos de error | `error`, `error-container`, `on-error`, `on-error-container` | `#ba1a1a`, `#ffdad6`, `#ffffff`, `#93000a` |
| Radios (`tailwind.config.js`) | `DEFAULT`, `lg`, `xl`, `full` | `1rem` (`16px`), `2rem` (`32px`), `3rem` (`48px`), `9999px` |
| Espaciados clave | `gutter`, `space-xs`, `space-sm`, `space-md`, `space-lg`, `space-xl` | `1.5rem`, `0.5rem`, `0.75rem`, `1.25rem`, `2rem`, `3rem` |

### Tipografía, comportamiento responsive y resets excluidos (`REF-C`)

- **Tipografía e iconos:** `'Plus Jakarta Sans', sans-serif` (pesos `300..800`) y `'Material Symbols Outlined'` (declarados vía Google Fonts en [`frontend/clientes/index.html`](file:///c:/Trabajo/Antigravity/ProyectoCafeteria/frontend/clientes/index.html)). **Licencia y carga efectiva pendientes de verificación** durante la ejecución de captura HYB-04 antes de empaquetar fuentes o iconos locales.
- **Superficies y mapeo del lote (`sin selección de rol ni registro público inline`):**
  1. `acceso` (`AuthPage.tsx` → `/cliente/iniciar-sesion`): mantiene estética café/crema para el acceso por identificador (teléfono/número de cliente) + PIN de 4 dígitos y entrada como invitado; **excluye** cualquier selección de rol y **no** incluye pestaña inline de registro público con ticket (el registro con ticket en `unified` vive en `/cliente/registro-ticket` bajo su propia adaptación previa HYB-23).
  2. `menu` (`Header.tsx` + `MenuPage.tsx` + `ProductCard.tsx` → `/cliente/menu`): cabecera superior fija (`h-16`, `max-w-[1280px]`) y columna de catálogo centrada con `max-w-md` (`mx-auto`), barra horizontal de categorías, rejilla de 2 columnas (`grid-cols-2`) y tarjetas con estados disponible, sin imagen + nombre largo y agotado (`Agotado` / `No disponible`).
  3. `personalizacion` (`ProductModal.tsx` → `ProductCustomizationDialog.tsx`): patrón de **overlay bottom-sheet en móvil** (`items-end`, `rounded-t-3xl`, pull-tab visible en `< sm`) y **modal centrado en escritorio** (`sm:items-center`, `sm:rounded-3xl`, `max-w-lg`), con grupos de opciones obligatorios (`minSelections: 1, maxSelections: 1`) y opcionales (`minSelections: 0, maxSelections: 2`).
- **Resets y restricciones heredadas excluidas del destino unificado:** `select-none` global en `body` / contenedores (`index.html`, `MenuPage.tsx`), `maximum-scale=1.0, user-scalable=no` en `<meta name="viewport">` (`index.html`), y `focus:outline-none` sin anillo de foco accesible en inputs (`AuthPage.tsx`, reemplazado por foco visible `:focus-visible` en `unified`).

**Decisiones abiertas:** verificación de licencia/empaquetado local de `Outfit`/`Inter` antes de cerrar `HYB-05…HYB-08` y de `Plus Jakarta Sans`/`Material Symbols Outlined` (o SVG locales equivalentes) antes de cerrar `HYB-18…HYB-20`.

## Propuesta de adaptación — `ADAPT-CLIENT-ORDER-SEND` (HYB-21, aprobada como entrada, 2026-11-26)

Fuente: `frontend/clientes/src/components/OrderConfirmationModal.tsx`; destino: `frontend/unified/src/features/terminal/cart/ClientCart.tsx` solo la acción de envío/confirmación y su feedback de estado. **Bloque sensible: requiere tu aprobación explícita antes de cambiar el envío de orden.** El responsable autorizaría la presentación bajo estos límites, no el resultado anticipadamente:

- Portar la acción de crear orden pendiente y su feedback (envío, éxito con folio, fallo, reintento explícito del usuario) sobre `ClientCart.tsx`, manteniendo el borrador de carrito y la validación de catálogo ya existentes. No crear cobro, no iniciar checkout Stripe, no solicitar QR ni token de pago.
- Distinguir claramente «orden pendiente creada» (esperando pago en caja/terminal) de «pago confirmado». Nunca mostrar éxito falso ni afirmar pago antes de la respuesta verificable del servidor.
- Red incierta: si la respuesta no es verificable o hay conflicto (409), mantener el borrador y exigir reintento explícito del usuario; no reintentar automáticamente, no regenerar clave de idempotencia, no reclamar éxito.
- Revalidación de carrito antes del envío (ya existente en `ClientCart`): mantener bloqueo si el catálogo cambió o hay líneas con problemas.
- No duplicar la orden: si ya hay un intento pendiente/enviado, ofrecer reintento del mismo intento en lugar de crear uno nuevo.
- Capturas 390×844 y 1280×800 de carrito con ítems, envío en curso, éxito con folio, fallo y reintento explícito; comprobar teclado, axe y que ningún POST de pago/checkout se ejecute. Aprobar adaptación no acepta resultado final.

**Estado:** Aprobado explícitamente por el responsable (2026-11-26) como entrada para HYB-21 (no aprueba el resultado implementado hasta cerrar HYB-21).

## Propuesta de adaptación — `ADAPT-CLIENT-ACCOUNT` (HYB-22, aprobada como entrada, 2026-11-26)

Fuente: `frontend/clientes/src/components/ProfileModal.tsx` y `frontend/clientes/src/components/OrderHistoryModal.tsx`; destino: `frontend/unified/src/features/clientes/account/ClientAccountPage.tsx`. **Bloque sensible: requiere tu aprobación explícita antes de cambiar la composición de cuenta.** El responsable autorizaría la presentación bajo estos límites, no el resultado anticipadamente:

- Portar la composición de cuenta cliente en `/cliente/cuenta`: perfil (teléfono/número de cliente, nombre), favoritos y historial de pedidos como vistas separadas dentro de la página (no convertir la ruta en modal), usando solo la API cliente protegida. No mostrar datos de otros clientes ni credenciales.
- Historial: lista de pedidos propios con folio, fecha, total y estado; acción "repetir" solo como preview de artículos en el carrito borrador, **sin cobro** y sin crear orden automáticamente. No mostrar QR, token de pago ni importes de otros usuarios.
- Favoritos: lista de productos favoritos con acción de añadir al carrito borrador (personalizar), sin modificar catálogo ni precios.
- No inventar sesiones, cuentas demo ni datos locales operativos; la cuenta requiere sesión de cliente autenticada activa.
- Capturas 390×844 y 1280×800 de perfil vacío/llenado, favoritos vacío/llenado y historial vacío/con pedidos; comprobar teclado, axe y que ningún POST de cobro se ejecute desde la cuenta. Aprobar adaptación no acepta resultado final.

**Estado:** Aprobado explícitamente por el responsable (2026-11-26) como entrada para HYB-22 (no aprueba el resultado implementado hasta cerrar HYB-22).

## Diferencias aceptadas — revisiones HYB-06…23 (2026-11-26)

| Decisión | Superficies | Diferencia aceptada |
| --- | --- | --- |
| D-28 | HYB-18 | Acceso cliente sin fotografía de héroe, sin tarjetas promocionales ni iconos Material; logo local, PIN tipo píldora y navegación textual con «Terminal» (cláusula de navegación sustituida por D-34). Sin cambios de login, invitado, actor o guardas. |
| D-29 | HYB-19 | Tarjetas con chips «Disponible»/«Agotado», acción «Personalizar» y sin corazón/favorito en la tarjeta; columna centrada a dos columnas y placeholder sin inventar imágenes. |
| D-30 | HYB-20 | Carrito inline (no drawer) y diálogo bottom-sheet/modal centrado sin cabecera fotográfica; mismas opciones, estimado, borrador y foco. |
| D-31 | HYB-11…17, 21, 22 | Evidencia de identidad/estados/contratos aceptada donde no existe captura original aprobada; sin declarar equivalencia píxel a píxel. HYB-16 derivada. |
| D-32 | HYB-06…10 | Composición terminal aceptada: H1 accesible y panel de catálogo en POS, dos columnas a 1024 px, metadatos sin SKU, panel de cliente por búsqueda, caja alineada arriba con fechas localizadas y login sin emoji. Guardas, permisos e idempotencia intactos. |
| D-34 | HYB-18-FIX | Retirado el enlace «Terminal» del shell de cliente solicitado por el responsable para evitar ofrecer el login de personal en teléfonos de clientes. La landing mantiene sus dos tarjetas; `/terminal` sigue accesible por URL y Electron. Sin cambios de guardas, roles, sesión ni credenciales. |

## Propuesta de adaptación — `ADAPT-CROSS-SURFACES` (HYB-24, aprobada como entrada, 2026-11-26)

Fuente: patrones de `WelcomeScreen.jsx`, `AuthPage.tsx`, `AdminDashboardWorkspace.jsx` (denegación) y diálogos ya migrados; **no existe pantalla original directa** de estas superficies. Destino: `src/app/router.tsx` (solo markup), `src/app/guards.tsx`, `src/shared/auth/ActorChangeDialog.tsx` y estilos de estado por área. Requiere aprobación explícita antes de escribir código.

- **Landing `/`:** composición neutra con identidad Coffee's POS y dos tarjetas de área (Cliente / Terminal) con descripción y acción; sin datos de sesión, roles ni accesos operativos.
- **404:** página con lenguaje del área que la contiene; enlace al inicio del área (menú de cliente o terminal) y `Volver al inicio` en la global. Sin exponer rutas internas.
- **Denegación terminal:** distinguir visitante («Inicia sesión en la terminal» → `/terminal/acceso`) de personal autenticado sin rol («Tu perfil {rol} no tiene acceso a esta sección») con enlace a su inicio autorizado mediante `staffDestination`. Mismas guardas y destinos; sin ampliar permisos.
- **Denegación cliente:** tarjeta café/crema para visitante con enlace a login; sesión de personal activa conserva «Cambiar a área de cliente» y abre el diálogo existente.
- **Sesión restringida (`/cambiar-nip`):** tarjeta neutra que explica la restricción y ofrece cierre de sesión; **no** se añade funcionalidad de cambio de NIP.
- **Diálogo de cambio de actor:** mismo foco atrapado, Escape, cancelar y confirmar; presentación según destino (café/crema para cliente, Nordic para terminal), error de cierre visible y sin pasos nuevos.
- **Límites:** sin roles nuevos, sin cambio de contraseña/NIP, sin acceso cliente en Electron, sin datos ficticios, sin tocar cookies/CSRF/refresh ni destinos de guarda.
- **Evidencia prevista:** cliente 390×844 y 1280×800; terminal 1024×768 y 1280×800 más Electron; estados visitante/autenticado denegado/restringido, diálogo abierto/cancelado/error; axe, teclado y foco devuelto. Adaptación derivada de REF-T/REF-C, sin inventar captura original.

**Estado:** Aprobada explícitamente por el responsable (2026-11-26) como entrada para HYB-24; decisión D-33. No aprueba el resultado hasta su cierre.
