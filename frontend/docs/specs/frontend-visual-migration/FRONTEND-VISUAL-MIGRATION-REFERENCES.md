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
| REF-T | Lote terminal (HYB-03) | bienvenida, acceso, POS/cabecera/catálogo/panel | Por capturar en HYB-02/03; fuente inicial `c88d01b` | No solicitada | Pendiente |
| REF-C | Lote cliente (HYB-04) | acceso, menú/cabecera/tarjetas, personalización | Por capturar en HYB-02/04; fuente inicial `c88d01b` | No solicitada | Pendiente |
| ADAPT-* | Adaptación previa | login staff, caja/cobro/ticket, reimpresión, cuenta, registro y transversales | Por proponer por bloque; nunca sustituir fuente original por UI nueva | No solicitada | Pendiente |

**Decisiones abiertas:** tema de terminal y cliente; viewports definitivos; disponibilidad/licencia de tipografías, iconos e imágenes; adaptación de login staff. El responsable debe decidir los temas antes de HYB-03/04. HYB-01 no los selecciona ni habilita HYB-02 sin aprobación individual.
