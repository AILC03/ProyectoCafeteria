# PLAN-FE-001 — Migración a frontend unificado

**Estado:** Aprobado por responsable — 2026-11-18
**Fecha:** 2026-11-18  
**Spec de referencia:** [SPEC-FE-001](./FRONTEND-UNIFICATION-SPEC.md), aprobada el 2026-11-18.

## 1. Objetivo del plan

Construir el paquete `frontend/unified/` como la única fuente de interfaz para cliente y terminal, conservando las aplicaciones actuales durante una migración validada. El paquete tendrá React 19, TypeScript, Vite, React Router y Electron como contenedor de escritorio exclusivo de `/terminal`.

No se implementará ninguna fase sin descomponer este plan en tasks aprobadas.

## 2. Decisiones aplicadas

- El paquete nuevo coexistirá inicialmente con `frontend/clientes/` y `frontend/empleados/`.
- Se toma `clientes/` como base de toolchain TypeScript/Vite/Router; se incorporan Electron y las capacidades POS desde `empleados/`.
- Las áreas tienen layouts y rutas separados; comparten únicamente infraestructura y componentes transversales.
- El backend mantiene la autoridad de sesión, roles, precios, pagos, tickets y estados de orden.
- Sólo hay una sesión activa por perfil de navegador o Electron. El cambio de actor exige confirmación y logout exitoso.
- El QR de registro impreso de compra pagada de invitado se migra. El comprobante digital `X-Ticket-Token` no se migra en esta fase.
- Electron usará un origen HTTP(S) configurable y permitido por API; no se admiten mutaciones desde `file://`.

## 3. Arquitectura objetivo

```text
frontend/unified/
├── electron/                 # Wrapper seguro de escritorio
├── public/                   # Activos públicos; sin datos privados en caché
├── src/
│   ├── app/                  # arranque, router, providers, guardas y configuración
│   ├── shared/
│   │   ├── api/              # cliente HTTP, CSRF, Problem Details, idempotencia
│   │   ├── auth/             # sesión única, cambio de actor y sincronización
│   │   ├── ui/               # notificaciones, confirmaciones y componentes comunes
│   │   ├── utils/            # dinero y utilidades puras
│   │   └── types/            # contratos de interfaz
│   ├── features/
│   │   ├── clientes/         # login, menú, carrito, perfil, favoritos e historial
│   │   └── terminal/         # staff, POS, caja, cocina y administración
│   ├── layouts/              # ClienteLayout y TerminalLayout
│   └── styles/               # base compartida y estilos aislados por área
├── package.json
├── tsconfig.json
└── vite.config.ts
```

La consolidación visual no es una reescritura global: inicialmente coexistirán estilos aislados de terminal y Tailwind de cliente. Sólo se extraerán tokens o componentes cuando tengan uso transversal comprobado.

## 4. Fases de ejecución

### Fase 0 — Preparación y límites de integración

**Propósito:** fijar las condiciones externas antes de modificar flujos de negocio.

- Confirmar el origen HTTP(S) de cada entorno que Electron cargará en distribución.
- Confirmar que el backend permite ese origen, conserva `credentials` y CSRF, y que el host devuelve la SPA para `/terminal/**`.
- Inventariar rutas y endpoints usados por cada flujo contra OpenAPI 0.11.0.
- Registrar que Stripe real, correo, Cloudinary real y comprobante digital quedan fuera.

**Salida verificable:** matriz de origen/entorno y cobertura de endpoints actualizada; ningún cambio de contrato backend implícito.

**Dependencia:** ninguna.  
**Reversión:** documental; no afecta las aplicaciones vigentes.

### Fase 1 — Fundación coexistente

**Propósito:** crear el paquete unificado compilable sin migrar rutas de producción.

- Crear `frontend/unified/` con React 19, TypeScript estricto, Vite 8, Router y un único `package-lock.json` para el paquete.
- Configurar desarrollo con proxy `/api` hacia API local, variables de entorno no secretas y build de producción.
- Añadir router con las rutas vacías de cliente y terminal definidas por la spec, layouts diferenciados y guardas todavía sin dominios de negocio.
- Añadir base de pruebas: Vitest, React Testing Library, MSW y configuración de cobertura; preparar Playwright para flujos E2E posteriores.
- Configurar reglas para no cachear `/api`, cookies, tokens ni respuestas privadas si se conserva el PWA de clientes.

**Salida verificable:** typecheck, lint, build y prueba mínima de router en el paquete nuevo; las dos aplicaciones anteriores continúan ejecutables.

**Dependencia:** Fase 0 para fijar configuración de orígenes.  
**Reversión:** eliminar sólo `frontend/unified/`; no cambia los paquetes actuales.

### Fase 2 — Núcleo de API y sesión segura

**Propósito:** sustituir clientes HTTP duplicados por una infraestructura única, sin bypasses locales.

- Implementar `apiFetch` tipado para `/api/v1`, `credentials: 'include'`, CSRF, RFC 7807 y trazabilidad de errores.
- Implementar un único refresh por perfil, no uno por pestaña: elegir un líder mediante Web Locks y documentar un mecanismo alterno para navegadores sin esa API. Los demás contextos esperarán el resultado difundido; un `409 REFRESH_ALREADY_ROTATED` reintentará una sola vez con la cookie actual, sin cerrar sesión de inmediato.
- Implementar resolución de actor y guardas por ruta desde respuestas de API, no desde `localStorage`.
- Implementar reemplazo confirmado de sesión cliente/invitado/personal: logout, limpieza de memoria, invalidación CSRF y posterior login. Logout, 401 definitivo o reemplazo descartarán además el borrador de carrito, nombre de invitado y toda preferencia/estado local asociado al actor; sólo permanecerán preferencias visuales no sensibles.
- Difundir logout, reemplazo, 401 definitivo y revocación mediante canal entre contextos del mismo perfil.
- Implementar almacenamiento permitido: preferencias no sensibles y borrador de carrito. Eliminar lectura/migración de credenciales, empleados, roles, cuentas, ventas, tickets, pedidos e IndexedDB heredados; el almacenamiento manipulado no influirá en autorización ni pagos.
- Implementar gestor de idempotencia en memoria: conserva clave y cuerpo para reintentos de una operación incierta; no confirma éxito local.

**Salida verificable:** pruebas unitarias/MSW para CSRF, Problem Details, 401, `CSRF_INVALID`, `PIN_CHANGE_REQUIRED`, `REFRESH_ALREADY_ROTATED`, reemplazo de actor, sincronización de dos contextos, carrera de refresh entre pestañas/Electron, descarte de estado local de actor e idempotencia.

**Dependencia:** Fase 1.  
**Reversión:** deshabilitar las rutas unificadas; no se reutilizan fallbacks de las apps antiguas.

### Fase 3 — Área de cliente

**Propósito:** migrar el autoservicio móvil al paquete unificado.

- Migrar login de CLIENTE, acceso de invitado y logout al núcleo de sesión.
- Migrar catálogo, categorías, opciones y personalización desde la API; no usar catálogo local como fuente operativa.
- Migrar carrito como borrador no sensible y creación de orden móvil con idempotencia.
- Migrar perfil propio, favoritos, historial y repetición sólo bajo sesión CLIENTE.
- Mantener fuera el QR de registro, el comprobante digital `X-Ticket-Token`, retorno Stripe y recuperación/cambio de NIP hasta el slice de caja/ticket de Fase 4.

**Salida verificable:** E2E de visitante, CLIENTE e invitado; pruebas negativas de permisos; regresión de catálogo, carrito y órdenes; pruebas de teclado, foco visible, contraste y movimiento reducido en las rutas de cliente.

**Dependencia:** Fase 2.  
**Reversión:** conservar `frontend/clientes/` como entrada de contingencia hasta la aceptación funcional.

### Fase 4 — Terminal: acceso, POS y caja

**Propósito:** migrar la operación de caja sin usar datos locales sensibles.

- Migrar inicio de sesión staff para CAJERO, PREPARACION y ADMINISTRADOR; eliminar ID/PIN, autologin y roles de respaldo locales.
- Migrar bienvenida, guardas y navegación de terminal con rutas reales.
- Migrar toma de orden de caja, asociación mínima de cliente, apertura/cierre de caja y cobro efectivo usando API, CSRF e idempotencia.
- Migrar impresión/renderizado de ticket confirmado por API y QR de registro cuando corresponda: obtener el ticket protegido mediante `GET /sales/{id}/ticket` bajo sesión CAJERO/ADMINISTRADOR, usar su QR sólo para alta de invitado y mantenerlo en memoria. Mantener QR CASH como flujo independiente de caja. Nunca usar `ticket-access`/`X-Ticket-Token` como QR de registro ni emitir recibo definitivo tras timeout/error.
- Migrar el alta con QR desde el área cliente como parte del slice de ticket: resolver el actor activo mediante `GET /auth/me`; si hay sesión CLIENTE o personal, confirmar el reemplazo y completar `POST /auth/logout` con CSRF antes de obtener CSRF prelogin. El token se conserva sólo en memoria y el alta no inicia sesión automáticamente.
- Migrar historial y ventas operativas autorizadas.

**Salida verificable:** pruebas por rol para rutas, caja y cobro; E2E de apertura, cobro exitoso, conflicto/timeout y QR de registro; pruebas negativas de QR CASH frente a QR de alta y de `X-Ticket-Token`; no hay acceso desde claves locales manipuladas; pruebas de teclado, foco visible, contraste y movimiento reducido en POS/caja.

**Dependencia:** Fase 2 y cobertura de endpoint/caja confirmada en Fase 0.  
**Reversión:** mantener `frontend/empleados/` como contingencia hasta validar caja en un entorno autorizado.

### Fase 5 — Terminal: cocina y administración

**Propósito:** completar los dominios restantes de personal.

- Migrar cocina con la cola `EN_PREPARACION` y transición `LISTO` autorizada.
- Migrar cambio de disponibilidad de cajero donde el contrato lo permite.
- Migrar administración de catálogo, opciones, usuarios, dashboard y corte según rol ADMINISTRADOR.
- Integrar estados vacíos, carga, error y accesibilidad para pantallas táctiles/teclado.

**Salida verificable:** pruebas de guardas por CAJERO/PREPARACION/ADMINISTRADOR y respuestas API denegadas; flujos E2E de cocina y administración.

**Dependencia:** Fase 4.  
**Reversión:** habilitar sólo los dominios unificados validados; el POS previo permanece disponible durante la coexistencia.

### Fase 6 — Electron y despliegue de terminal

**Propósito:** usar el mismo frontend desplegado como aplicación de escritorio segura.

- Convertir el proceso principal a configuración de origen HTTP(S) por entorno y ruta inicial `/terminal`.
- Corregir desarrollo para cargar el servidor Vite unificado, no la API.
- Restringir navegación de ventana al origen aprobado y rutas de terminal; abrir sólo URLs externas permitidas en el navegador del sistema.
- Conservar `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` y `webSecurity: true`.
- Verificar empaquetado Windows y macOS contra host con fallback History API y origen permitido por backend.

**Salida verificable:** build web y empaquetado de escritorio; prueba manual/autorizada de login staff y mutación CSRF desde Electron. No se habilita `file://` ni modo offline.

**Dependencia:** Fases 1, 2 y 4; host HTTPS y configuración backend de Fase 0.  
**Reversión:** no publicar el nuevo instalador; conservar el artefacto anterior sólo como contingencia temporal, sin convertir `file://` en alternativa soportada.

### Fase 7 — Validación de reemplazo y retiro posterior

**Propósito:** demostrar equivalencia funcional antes de retirar duplicación.

- Ejecutar matriz completa de rutas, roles, CSRF, sesión única, almacenamiento manipulado, pagos inciertos, QR de registro, accesibilidad y Electron.
- Comparar cada flujo migrado con la aplicación origen y documentar diferencias aprobadas.
- Obtener aceptación funcional del responsable.
- Crear un plan separado para retirar `clientes/`, `empleados/`, sus proxies, builds y dependencias sólo después de la aceptación.

**Salida verificable:** evidencia de aceptación y plan de retiro aprobado. La eliminación no forma parte de este plan.

**Dependencia:** Fases 3 a 6.  
**Reversión:** mantener coexistencia; no borrar paquetes anteriores.

## 5. Mapa de migración de código

| Origen | Destino previsto | Tratamiento |
| --- | --- | --- |
| `clientes/src/api/client.ts` y `empleados/src/api/client.js` | `unified/src/shared/api/` | Unificar; eliminar autologin local staff. |
| `clientes/src/context/*` | `unified/src/features/clientes/` y `shared/auth/` | Separar sesión común, borrador de carrito y toasts. |
| `clientes/src/pages`, `components`, `utils`, `types` | `unified/src/features/clientes/` | Migrar a TypeScript conservando contratos. |
| `empleados/src/App.jsx` | Router, layouts y features de terminal | Descomponer por dominio; no trasladar estado/roles locales. |
| `empleados/src/components/*` | `unified/src/features/terminal/` | Convertir JSX a TSX gradualmente por fase. |
| `empleados/src/api/*` | `unified/src/shared/api/` y `features/terminal/api/` | Tipar y preservar endpoints aprobados. |
| `empleados/src/data/*`, `utils/tenant.js`, `utils/crypto.js`, `js/`, `respaldo/` | No migrar | Eliminar como fuente funcional conforme SPEC-FE-001. |
| `empleados/electron/main.cjs` | `unified/electron/` | Adaptar a URL configurada, allowlist y ruta terminal. |

## 6. Estrategia de calidad

| Capa | Herramientas/alcance |
| --- | --- |
| Estática | TypeScript estricto, lint, formato y `git diff --check`. |
| Unitaria | Vitest para dinero, idempotencia, mapeos de errores y guardas puras. |
| Componentes | React Testing Library + MSW para sesión, rutas, formularios, cart y estados de error. |
| Integración/E2E | Playwright contra API local autorizada para cliente, terminal, cambio de actor, caja y QR de registro. |
| Seguridad | Casos 401/403/409/429/503, CSRF, roles, datos locales manipulados y no persistencia de secretos. |
| Electron | Empaquetado y prueba de ruta/origen, aislamiento y mutación CSRF autorizada. |

Cada task indicará los comandos exactos aplicables. Una verificación bloqueada detiene su commit salvo excepción explícitamente autorizada.

## 7. Riesgos y puntos de control

| Riesgo | Punto de control |
| --- | --- |
| Origen Electron incompatible con CORS/CSRF | No iniciar Fase 6 sin origen HTTPS, `FRONTEND_ORIGIN` y fallback SPA validados. |
| Pago duplicado o éxito falso | Idempotencia y estado incierto se prueban antes de migrar caja. |
| Persistencia de secretos/roles | Auditoría de almacenamiento y pruebas negativas antes de cada dominio terminal. |
| Regresión visual por estilos mixtos | Mantener estilos por área aislados; revisión visual y accesible por ruta. |
| APIs/servicios no habilitados | Mantenerlos fuera del alcance y no simular disponibilidad. |
| Retiro temprano de apps previas | La Fase 7 requiere evidencia y aprobación separada. |

## 8. Criterio para pasar a tasks

Este plan quedará listo para descomponerse cuando el responsable apruebe explícitamente:

1. Las ocho fases y su orden.
2. `frontend/unified/` como ubicación del paquete.
3. TypeScript/Vite/React Router como base y migración gradual de estilos.
4. La dependencia bloqueante de origen HTTPS/configuración backend para Electron.
5. La estrategia de coexistencia y retiro posterior.

La aprobación del plan no autoriza implementar todas las fases de una vez: habilita la creación del conjunto de tasks atómicas para aprobación posterior.
