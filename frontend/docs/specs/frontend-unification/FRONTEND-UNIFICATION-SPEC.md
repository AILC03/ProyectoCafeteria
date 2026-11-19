# SPEC-FE-001 — Frontend unificado de Coffee's POS

**Estado:** Aprobada por responsable — 2026-11-18
**Fecha:** 2026-11-16  
**Fuentes:** `frontend/clientes/`, `frontend/empleados/`, `backend/docs/api/openapi.yaml`, `backend/docs/frontend-integration.md`, `backend/docs/permissions.md`.

## 1. Problema

El repositorio contiene dos aplicaciones React/Vite independientes para clientes y personal. Duplican configuración, cliente HTTP, gestión de CSRF, dependencias y parte de los datos locales. Además, comparten cookies de la API sin una política explícita para el cambio de actor en el mismo navegador.

La terminal de empleados dispone de Electron, pero su modo de desarrollo apunta al puerto de la API en lugar del servidor Vite y su modo empaquetado basado en `file://` no garantiza un origen válido para las operaciones mutables protegidas por CSRF.

## 2. Objetivo

Crear una sola aplicación frontend que entregue dos experiencias separadas:

- **Cliente:** consulta de menú, pedido, cuenta, favoritos e historial.
- **Terminal:** acceso de personal, POS, caja, cocina y administración según rol.

La aplicación deberá reutilizar una base común de API, autenticación, seguridad, tipos y componentes transversales. Electron se conservará como contenedor de escritorio de la terminal, no como una segunda implementación del POS.

## 3. Alcance

### Incluido

- Un proyecto React 19 + TypeScript + Vite como fuente única de frontend.
- Rutas, layouts y guardas diferenciadas para cliente y terminal.
- Un cliente API único para `/api/v1`, cookies HttpOnly, CSRF, errores Problem Details y coordinación de reintentos de sesión.
- Política de una sola sesión activa por perfil de navegador o perfil de Electron.
- Migración gradual de las capacidades vigentes de ambas aplicaciones, preservando los contratos backend aprobados.
- Adaptación de Electron para abrir directamente la experiencia de terminal desde un origen HTTP(S) configurado.
- Eliminación de credenciales, secretos y permisos locales como fuente de autorización.

### Excluido

- Rediseño de identidad visual, cambios de precios, reglas de negocio, roles o contratos de API sin una aprobación separada.
- Operación offline de autenticación, caja, cobro, emisión de tickets, cocina o administración.
- Cambiar el backend, su contrato o sus cookies durante esta migración sin una tarea backend aprobada.
- Incluir Stripe, correo o Cloudinary como servicios reales; su disponibilidad seguirá la configuración y autorizaciones del backend.
- Retirar las aplicaciones antiguas antes de que la sustitución se valide en una fase posterior.
- Incorporar en esta primera migración flujos backend que no estén hoy expuestos por las dos aplicaciones: recuperación o cambio de NIP, verificación de correo, retorno de Stripe, comprobante digital protegido con `X-Ticket-Token` o restablecimiento presencial. Requerirán una spec propia.

## 4. Usuarios y permisos

| Actor | Área permitida | Acciones principales | Restricciones |
| --- | --- | --- | --- |
| Visitante | Cliente | Consultar menú e iniciar pedido como invitado | No ve perfil, favoritos ni historial de otra persona. |
| CLIENTE | Cliente | Perfil propio, favoritos, historial, pedido y repetición conforme API | No accede a rutas ni datos de terminal. |
| CAJERO | Terminal | Tomar pedidos, caja y cobros autorizados | No accede a administración de menú, usuarios o dashboard administrativo. |
| PREPARACION | Terminal | Consultar cola de cocina y actualizar el estado autorizado | No accede a caja, cobros, menú administrativo ni usuarios. |
| ADMINISTRADOR | Terminal | Capacidades administrativas autorizadas y capacidades de caja heredadas | No obtiene permisos de CLIENTE por ser administrador. |

La matriz exacta de acciones, métodos y estados seguirá siendo `backend/docs/permissions.md`; las guardas de interfaz no reemplazan la autorización del backend.

## 5. Rutas objetivo

| Ruta | Actor esperado | Propósito |
| --- | --- | --- |
| `/` | Público | Entrada y redirección al área solicitada; no expone datos de sesión. |
| `/cliente/iniciar-sesion` | Público | Inicio de sesión de cliente, acceso invitado y acceso al registro con ticket. |
| `/cliente/menu` | Visitante o CLIENTE | Catálogo, personalización, carrito y creación de pedido según el contrato. |
| `/cliente/cuenta` | CLIENTE | Perfil, favoritos e historial propio. |
| `/terminal` | Público | Bienvenida e inicio de acceso de personal. |
| `/terminal/pos` | CAJERO o ADMINISTRADOR | Toma de pedidos y cobro autorizado. |
| `/terminal/cocina` | PREPARACION, o rol autorizado por API | Cola y actualización de preparación. |
| `/terminal/caja` | CAJERO o ADMINISTRADOR | Turno, corte y consultas de caja autorizadas. |
| `/terminal/administracion/*` | ADMINISTRADOR | Dashboard, catálogo y personal según permisos backend. |

Una ruta no autorizada mostrará un estado de acceso denegado y redirigirá a la entrada apropiada; nunca mostrará datos almacenados localmente como sustituto de una sesión válida.

## 6. Sesiones, autenticación y cambio de actor

### Decisión confirmada

Sólo habrá una sesión activa a la vez por perfil de navegador o perfil de Electron. Esta regla aplica al cambio entre cliente, invitado y personal en el mismo perfil; no pretende revocar sesiones abiertas en otros dispositivos.

### Comportamiento requerido

1. Al abrir la aplicación, se consultará el estado de sesión mediante los endpoints autorizados, sin leer tokens desde JavaScript.
2. Si el usuario inicia un flujo de otro actor mientras existe una sesión activa, se mostrará una confirmación clara: indicar qué sesión se cerrará y qué área se abrirá.
3. Tras confirmar, el frontend llamará al cierre de sesión correspondiente, invalidará su estado y CSRF en memoria y sólo entonces permitirá el nuevo inicio de sesión.
4. Si el cierre falla, el cambio no continuará y se informará una acción recuperable; no se mezclarán identidades ni se conservarán datos privados en pantalla.
5. Logout, 401 definitivo o sesión revocada limpiarán estado de actor, carrito/datos privados en memoria y redirigirán a la entrada apropiada. Un `403 CSRF_INVALID` renovará CSRF y permitirá repetir la acción; un `403 PIN_CHANGE_REQUIRED` limitará la interfaz a cambio de NIP o logout; un `409 REFRESH_ALREADY_ROTATED` esperará/reintentará refresh una sola vez. Los demás Problem Details se tratarán por `code` conforme a la guía de integración.
6. Las mutaciones usarán `credentials: 'include'`, token CSRF y el comportamiento de reintento definido en la guía de integración. No se persistirán access tokens, refresh tokens, NIP, contraseñas ni tokens QR en `localStorage`, IndexedDB o logs.
7. Un reemplazo de sesión, logout, 401 o 403 se difundirá a todas las pestañas y ventanas del mismo perfil mediante un canal del navegador apropiado. Cada contexto receptor limpiará inmediatamente su estado privado, invalidará la caché de CSRF y volverá a su ruta de entrada. La sincronización de refresh seguirá la guía de integración para evitar rotaciones concurrentes.

## 7. Datos, respaldo local e integridad

### Fuente de verdad

La API es la fuente de verdad de identidad, permisos, catálogo operativo, órdenes, cobros, tickets, cocina, empleados y administración.

### Permitido en local

- Preferencias visuales y de accesibilidad no sensibles.
- Estado efímero de navegación y carrito, sin confirmar una orden ni conservar secretos.
- Caché de catálogo sólo para lectura, claramente marcada como no disponible si no puede verificarse su vigencia.

### Prohibido en local

- Aceptar PIN, contraseña, usuario, rol o permiso locales para autenticar o autorizar.
- Crear perfiles de personal, administradores o credenciales de respaldo en el navegador.
- Confirmar un cobro, emitir un ticket o guardar un recibo definitivo después de un fallo, timeout o resultado incierto de la API.
- Migrar claves heredadas que contengan secretos, sesiones, códigos QR, tokens o contraseñas.

Las operaciones de pago conservarán la misma clave de idempotencia y el mismo cuerpo de petición para cualquier reintento autorizado. Ante incertidumbre se mostrará el estado recuperable indicado por la guía de integración, no un éxito local.

### Inventario vinculante de legado

| Comportamiento o dato legado | Destino en frontend unificado |
| --- | --- |
| Sesiones, tokens CSRF, NIP, contraseñas, códigos QR y secretos en almacenamiento local | Eliminar; nunca migrar ni leer para autorizar. |
| Empleados, roles y administradores locales o de respaldo | Eliminar como fuente de verdad; identidad y permisos sólo desde API. |
| Reautenticación automática con credenciales de respaldo | Eliminar. Un 401 inicia el flujo de sesión definido, nunca un login implícito. |
| Catálogo local | Puede conservarse únicamente como caché de lectura no operativa, con expiración/indicación de estado a definir en el plan. |
| Preferencias de tema, audio y accesibilidad | Migrar si no contienen datos sensibles. |
| Carrito local | Puede conservarse como borrador no sensible; no confirma ni reintenta pagos sin la misma clave de idempotencia autorizada. |
| Órdenes, ventas, cobros, recibos o tickets locales | Eliminar como evidencia operativa. Sólo se muestran como definitivos tras respuesta confirmada de API. |

Las siguientes claves detectadas quedan sujetas a esta disposición; ninguna clave no listada se migrará sin una actualización aprobada de esta spec:

| Claves actuales | Disposición |
| --- | --- |
| `coffees_current_employee`, `taffy_current_employee`, `coffees_employees_local`, `taffy_employees_local`, `coffees_employees_v1`, `taffy_employees_v1`, `coffees_employees_${tenant}`, `taffy_employees_${tenant}` | Eliminar y no leer en producción. |
| `coffees_pos_account`, `taffy_account`, `taffy_business_account`, `coffees_accounts_registry`, `taffy_accounts_registry`, `coffees_unlinked_manual`, `taffy_unlinked_manual` | Eliminar y no leer como identidad, tenant o autorización. |
| `coffees_orders_local`, `taffy_orders_local`, `coffees_orders_backup`, `taffy_orders_backup`, `coffees_orders_backup_${tenant}`, `taffy_orders_backup_${tenant}`, `taffy_cart`, `taffy_past_orders` | Eliminar órdenes/historial locales. `taffy_cart` podrá migrar sólo como borrador no sensible; no se migrarán órdenes pasadas. |
| `coffees_menu_products_local`, `taffy_menu_products_local`, `coffees_menu_products_v1`, `taffy_menu_products_v1`, `coffees_menu_categories_local`, `taffy_menu_categories_local` y variantes por tenant | No migrar como catálogo operativo; posible caché de sólo lectura según la regla anterior. |
| `coffees_theme`, `taffy_theme`, `coffees_audio`, `taffy_audio`, `coffees_ticket_width`, `taffy_ticket_width`, `coffees_pos_ticket_width`, `coffees_auto_print`, `taffy_auto_print`, `coffees_ticket_footer`, `taffy_ticket_footer`, `coffees_pos_ticket_footer` | Migrar sólo como preferencia no sensible y sin contenido de comprobante/orden. |
| `taffy_is_guest`, `taffy_guest_name` | No usar como sesión o identidad. Se podrá conservar únicamente el nombre de invitado como borrador y se limpiará al cambiar de actor. |

La base IndexedDB heredada `CoffeesPosDatabase`, incluidas sus órdenes y respaldos, se eliminará y no se leerá en producción. Cualquier otra base IndexedDB que aparezca durante la migración quedará bloqueada hasta inventariarla y aprobarla. Las pruebas negativas demostrarán que datos locales manipulados no otorgan acceso, permisos ni éxito de cobro.

## 8. Experiencia y diseño

La unificación compartirá fundamentos técnicos y componentes transversales, sin convertir las áreas de cliente y terminal en una misma pantalla genérica.

- **Cliente:** experiencia móvil, orientada a descubrir productos, personalizar y pedir con lenguaje claro.
- **Terminal:** interfaz densa, táctil, de lectura rápida y adecuada a operación de caja o cocina.
- Los estados de carga, vacío, error y confirmación describirán la acción siguiente con lenguaje directo.
- Toda ruta será navegable por teclado, tendrá foco visible, contraste suficiente y respetará reducción de movimiento.
- Un cambio estético amplio requerirá una task de diseño separada con tokens de color, tipografía, layout y revisión visual; no es requisito de esta migración.

## 9. Electron

Electron seguirá siendo el canal de distribución de escritorio de la terminal.

- Compartirá la misma compilación, router, cliente API y componentes de la aplicación web unificada.
- Abrirá directamente `/terminal`, nunca la ruta de cliente.
- Mantendrá `contextIsolation`, `sandbox`, `webSecurity` y `nodeIntegration: false`.
- En desarrollo cargará el servidor Vite correcto. En distribución cargará una URL HTTP(S) configurable de la aplicación desplegada; no se considerará soportado operar mutaciones protegidas desde `file://`.
- Electron requerirá conectividad con la aplicación/API. No habilita un modo POS offline ni un bypass de seguridad.
- El empaquetado para Windows y macOS se conservará y se verificará tras la migración.
- La URL configurada será un origen permitido por la API; usará HTTPS fuera de desarrollo y el host deberá resolver directamente `/terminal` y sus subrutas a la SPA.
- La navegación de la ventana se restringirá al origen configurado y a rutas de terminal. Los enlaces externos aprobados se abrirán en el navegador del sistema mediante una allowlist, no dentro de la ventana POS.

## 10. Arquitectura objetivo

```text
frontend/unified/
├── src/
│   ├── app/          # router, providers, configuración y guardas
│   ├── shared/       # cliente API, sesión, tipos comunes, utilidades y UI transversal
│   ├── features/
│   │   ├── clientes/ # autenticación cliente, menú, cuenta, favoritos y pedidos
│   │   └── terminal/ # acceso staff, POS, cocina, caja y administración
│   └── layouts/      # ClienteLayout y TerminalLayout
├── electron/         # proceso principal y configuración de escritorio
└── package.json
```

La ubicación definitiva y la estrategia de consolidación de dependencias se decidirán en el plan. La arquitectura no autoriza eliminar ni mover las aplicaciones existentes durante la primera fase.

## 11. Migración y compatibilidad

1. El proyecto unificado coexistirá temporalmente con `clientes/` y `empleados/`.
2. Se migrará primero la infraestructura compartida y las rutas de cliente; después las capacidades de terminal por dominio.
3. Se validará cada flujo contra la API antes de declarar sustituida una aplicación previa.
4. Sólo se migrarán preferencias no sensibles previamente aprobadas. Las claves `taffy_*` y `coffees_*` que contengan sesiones, credenciales o información operativa se descartarán de forma segura.
5. La retirada de directorios antiguos, proxies y builds será una task posterior, con reversión documentada y aprobación explícita.

## 12. Riesgos y dependencias

| Riesgo o dependencia | Tratamiento requerido |
| --- | --- |
| Las sesiones actuales comparten cookies de host. | Implementar confirmación y logout antes del cambio de actor; no inferir permisos desde almacenamiento local. |
| El contrato backend requiere cookies, CSRF, roles e idempotencia. | Reutilizarlo sin cambios no aprobados; coordinar cualquier incompatibilidad antes de implementar. |
| Electron actual usa `file://` en producción. | Cambiar a origen HTTP(S) configurado y probar mutaciones reales autorizadas en el entorno correspondiente. |
| La terminal conserva credenciales y fallbacks locales. | Eliminar esos bypasses al migrar el dominio afectado. |
| Fallos de red en cobro. | Nunca producir éxito o recibo definitivo local; usar el flujo de recuperación de la guía backend. |
| Diferencias JavaScript/TypeScript y CSS/Tailwind. | Decidir la estrategia de migración en el plan, sin reescritura global no justificada. |

## 13. QR de registro incluido

La primera migración incluye el QR de registro impreso en el ticket de una compra pagada de invitado:

- El registro usa sólo el token original en memoria, sin URL, logs, analítica o almacenamiento local; exige flujo de invitado sin cookie de acceso/refresh, CSRF prelogin y, tras éxito, muestra confirmación y ofrece login normal sin iniciar sesión automáticamente.
- El ticket/QR de registro emitido tras una venta se trata únicamente como QR de alta; no es QR de pago ni permiso de lectura de compras.
- El QR se muestra o imprime únicamente tras la confirmación de pago de la API y conforme a su elegibilidad. No se almacena ni se reutiliza localmente.

## 14. Flujos excluidos de la primera migración

La primera migración unifica lo que está expuesto por las aplicaciones actuales. Los siguientes flujos de la API quedan explícitamente fuera hasta contar con una spec aprobada: retorno de Stripe, verificación de correo, recuperación/confirmación/cambio de NIP, reset presencial, comprobante digital protegido con `X-Ticket-Token` y cualquier token recibido en fragmentos de URL. `PIN_CHANGE_REQUIRED` no implementa el cambio de NIP en esta fase, pero debe restringir el acceso a una pantalla informativa de cambio obligatorio o logout, conforme al contrato.

Cuando se especifiquen, deberán prohibir la persistencia de tokens, eliminar fragmentos de URL tras leerlos y no interpretar un retorno de pago como confirmación de venta.

## 15. Matriz de acciones sensibles

Esta matriz complementa, pero no reemplaza, `backend/docs/permissions.md`. Las pruebas deberán cubrir la guarda de interfaz y la respuesta denegada de API para cada prohibición.

| Acción | Roles permitidos | Prohibidos explícitos |
| --- | --- | --- |
| Consultar/editar su perfil, favoritos e historial propio | CLIENTE | Visitante, CAJERO, PREPARACION, ADMINISTRADOR como sustituto de CLIENTE |
| Tomar orden, abrir turno y cobrar dentro de caja autorizada | CAJERO, ADMINISTRADOR | CLIENTE, Visitante, PREPARACION |
| Cerrar caja excepcional o administrar personal | ADMINISTRADOR conforme contrato | CLIENTE, Visitante, CAJERO, PREPARACION |
| Administrar catálogo y cambiar disponibilidad permitida | ADMINISTRADOR; CAJERO sólo donde el contrato lo autorice | CLIENTE, Visitante, PREPARACION |
| Consultar cocina y marcar estado autorizado, incluido `LISTO` | PREPARACION, CAJERO, ADMINISTRADOR conforme contrato | CLIENTE, Visitante |
| Buscar/asociar cliente antes de pago | CAJERO, ADMINISTRADOR; asociación con confirmación mínima de identidad | CLIENTE, Visitante, PREPARACION; cualquier actor después de pago/vencimiento |
| Emitir/reemitir QR CASH pendiente y escanearlo para cobro | CAJERO, ADMINISTRADOR con sesión, CSRF y caja/responsable cuando corresponda | CLIENTE, Visitante, PREPARACION; QR no confirma pago |
| Obtener e imprimir ticket CASH protegido | CAJERO, ADMINISTRADOR con sesión | CLIENTE, Visitante, PREPARACION |
| Registrar cuenta con QR de ticket | Invitado sin cookies de sesión, token válido y no usado | Personal, cliente autenticado, segundo uso del token |

## 16. Escenarios de verificación obligatorios

- Cambio cliente ↔ personal con dos pestañas o ventanas del mismo perfil: confirmación, logout, limpieza y redirección en ambos contextos.
- 401, 403, `CSRF_INVALID`, `PIN_CHANGE_REQUIRED`, `REFRESH_ALREADY_ROTATED`/409, 429, 503 y pérdida de red: estado recuperable sin filtración ni éxito falso.
- Manipulación de almacenamiento local: no concede sesión, rol, permisos, orden, cobro, ticket ni recibo.
- Cobro con timeout: conserva la estrategia de recuperación/idempotencia y no confirma localmente una venta.
- Navegación de teclado, foco visible, contraste y `prefers-reduced-motion` en ambos layouts.
- Electron de distribución Windows/macOS: carga la ruta terminal, conserva aisladores de seguridad, resuelve History API y completa una mutación CSRF autorizada contra un origen configurado.

## 17. Criterios de aceptación

1. Existe una sola aplicación compilable que contiene las áreas de cliente y terminal con rutas independientes.
2. Un visitante puede navegar el menú y un CLIENTE puede usar únicamente su perfil, favoritos e historial autorizados por la API.
3. CAJERO, PREPARACION y ADMINISTRADOR sólo ven y ejecutan las rutas y acciones permitidas por `permissions.md`; la API continúa siendo la autoridad final.
4. Al cambiar de cliente/invitado a personal, o a la inversa, se solicita confirmación, se cierra la sesión activa y no quedan datos privados o tokens en el navegador.
5. El cambio o cierre de sesión se refleja en todas las pestañas/ventanas del mismo perfil y limpia su estado privado en memoria.
6. Ningún flujo de personal acepta credenciales, roles o permisos desde datos locales ni incluye contraseñas/NIP de respaldo; datos locales manipulados no afectan la autorización.
7. Un fallo o incertidumbre en un cobro no genera confirmación de venta, ticket ni recibo definitivo local.
8. El cliente API unificado adjunta cookies y CSRF correctamente, trata errores RFC 7807 y sigue la guía aprobada para 401, 403, 409 y reintentos.
9. El QR de registro impreso para una compra pagada de invitado no persiste su token ni inicia sesión automáticamente; sus guardas respetan el flujo de invitado y las reglas de elegibilidad de la API.
10. Electron abre el área `/terminal` desde un origen HTTPS configurado fuera de desarrollo, permitido por la API y con fallback History API; conserva sus aislamientos de seguridad y no depende de `file://` para mutaciones.
11. Las aplicaciones actuales no se eliminan hasta que las rutas migradas hayan sido verificadas y aprobadas.
12. La interfaz mantiene accesibilidad básica: foco visible, navegación por teclado, contraste suficiente y respeto de movimiento reducido.

## 18. Decisiones que requiere el plan

- Nombre y ubicación del nuevo paquete unificado.
- Estrategia técnica para estilos: consolidación gradual de CSS y Tailwind, o una alternativa aprobada.
- URL y configuración de despliegue que Electron cargará en producción, incluido el origen permitido por la API.
- Orden de migración detallado y criterios para retirar las aplicaciones antiguas.
- Cobertura de pruebas automatizadas para rutas, sesión, permisos, pagos y Electron.

## 19. Aprobación

La aprobación de esta spec autoriza elaborar el plan, no implementar tareas ni modificar los contratos backend. Cualquier cambio posterior a las decisiones confirmadas debe actualizar esta spec y volver a aprobarse.
