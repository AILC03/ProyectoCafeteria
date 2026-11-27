# SPEC-FE-VIS-001 — Recuperación visual del frontend unificado

- **Estado:** Aprobada por el responsable en conversación, tras la revisión de fidelidad y uso acotado de `frontend-design`. Autoriza preparar el plan, no implementar UI.
- **Fecha:** 2026-11-23.
- **Responsable de aprobación:** responsable del proyecto.
- **Alcance de este documento:** requisitos de la migración visual. No constituye plan, tasks ni autorización de implementación.
- **Relacionado:** [spec funcional](../frontend-unification/FRONTEND-UNIFICATION-SPEC.md), [plan de unificación](../frontend-unification/FRONTEND-UNIFICATION-PLAN.md), [decisiones](../frontend-unification/FRONTEND-UNIFICATION-DECISIONS.md) y [validación](../frontend-unification/FRONTEND-UNIFICATION-VALIDATION.md).

## 1. Problema

El paquete `frontend/unified/` reúne flujos cliente/terminal e integración con API, pero su presentación no reproduce la identidad y composición de las aplicaciones originales. Electron abre este paquete, por lo que también muestra esa diferencia visual.

La migración funcional y sus pruebas no acreditan equivalencia visual. Recuperar el diseño requiere criterios propios, referencias aprobadas y revisión humana, sin sustituir la lógica nueva por la del prototipo.

## 2. Base factual y límites de la investigación

Inventario inicial por lectura del código, no por comparación de capturas:

| Área | Fuente existente | Hechos observados |
| --- | --- | --- |
| Terminal original | `frontend/empleados/src/styles/index.css` | Variables de color, radios y sombras; fuentes declaradas Outfit/Inter; composición orientada a escritorio/tablet. Incluye resets globales que eliminan outlines y selección, y restringen overflow: no deben trasladarse literalmente. |
| Cliente original | `frontend/clientes/src/index.css`, `App.css` y componentes TSX | Utilidades Tailwind, fuente declarada Plus Jakarta Sans, Material Symbols y fondo cálido. Las declaraciones no garantizan que las fuentes o iconos estén disponibles localmente. |
| Unificado actual | `frontend/unified/src/styles/base.css`, `layouts/`, `features/` | Estilos propios y fuente system-ui; layouts separados, guardas y flujos conectados a API. |
| Rutas actuales | `frontend/unified/src/app/router.tsx` | Áreas `/cliente` y `/terminal`, entrada pública, pantalla de sesión restringida y rutas no encontradas. |

**No se han capturado ni aprobado referencias visuales en esta entrega.** El procedimiento híbrido solicitado usa un lote representativo aprobado, fuentes originales trazables y aceptación posterior por bloque; mantiene revisión previa específica para adaptaciones sensibles según RV-01. No se presume equivalencia a partir de nombres de componentes.

## 3. Objetivos

1. Migrar los diseños de `frontend/empleados/` y `frontend/clientes/` tal cual o lo más parecido posible: identidad, colores, tipografías, jerarquía, distribución y presentación. La fidelidad al original es el objetivo principal, no una inspiración opcional.
2. Mantener el comportamiento funcional, autorización y seguridad del unificado.
3. Conservar identidades diferenciadas de cliente y terminal sin que sus estilos se contaminen.
4. Adaptar las pantallas a sus dispositivos de uso, teclado, tacto y requisitos de accesibilidad.
5. Incorporar evidencia visual verificable además de las pruebas funcionales existentes.

**Dirección solicitada expresamente por el responsable:** restauración fiel del diseño original, no rediseño libre, usando la skill `frontend-design` para refinar la calidad sin sustituir colores ni flujos. La spec fue aprobada posteriormente; las capturas, temas concretos y refinamientos todavía no revisados siguen pendientes de su aprobación específica.

La prioridad es: conservar identidad y composición originales; preservar los flujos soportados y la seguridad del unificado; corregir problemas de accesibilidad; y proponer refinamientos visuales acotados. Si estos objetivos entran en conflicto, se presenta la diferencia al responsable antes de implementar la parte afectada, sin sacrificar seguridad ni accesibilidad para copiar un defecto.

## 4. Alcance y exclusiones

### Incluido

- Colores, tipografías, recursos gráficos, iconografía, espaciado, bordes, sombras y jerarquía visual.
- Layouts, navegación, tablas, tarjetas, formularios, avisos, diálogos y presentación del ticket.
- Estados reales de carga, vacío, error, denegación, sesión restringida, éxito confirmado y operación incierta.
- Adaptación visual de flujos originales que ya existen en el unificado.
- Evidencia de fidelidad en navegador y Electron Windows.
- Uso de `frontend-design` para revisar coherencia, alineación, legibilidad y detalle visual dentro de la identidad existente, con los límites de §7.

### Excluido

- Cambiar endpoints, contratos backend, modelos, roles, permisos o reglas de negocio.
- Modificar cookies, CSRF, refresh, idempotencia, estrategia de resultado incierto o persistencia permitida.
- Restaurar credenciales demo, PIN de empleados, administración local, datos de respaldo o simulación de ventas.
- Añadir QR CASH, cobro Stripe, cámara, PWA, modo offline, recuperación de credenciales o integraciones de impresora no aprobadas.
- Añadir selección de rol al login o registro abierto de usuarios.
- Cambiar el wrapper de seguridad Electron, resolver el despliegue HTTPS o empaquetar macOS.
- Eliminar las aplicaciones originales, modificar sus snapshots históricos o promover el unificado a producción.
- Reinterpretar la marca, sustituir su paleta o sus fuentes disponibles por preferencias del implementador, añadir estilos genéricos o reorganizar flujos por iniciativa de la skill de diseño.

Una dependencia visual nueva, un tema adicional o una modificación de interacción no incluidos necesitan propuesta y aprobación explícitas; esta spec no selecciona Tailwind, una biblioteca de componentes ni una herramienta nueva de capturas.

## 5. Actores, accesos y autenticación que deben preservarse

| Actor | Experiencia visual permitida | Restricciones que no cambia el diseño |
| --- | --- | --- |
| Visitante | Entrada, menú y pedido de invitado; registro por ticket elegible | Sin perfil privado ni terminal operativa. |
| CLIENTE | Menú, cuenta propia, favoritos, historial y repetición | Sin acceso a datos o rutas operativas de personal. |
| CAJERO | POS, caja, cobro, ticket, historial y disponibilidad autorizados; cocina | Sin CRUD administrativo ni gestión de personal. |
| PREPARACION | Cola y acciones de cocina autorizadas | Sin caja, cobros ni administración. |
| ADMINISTRADOR | Capacidades de caja y administración autorizada | No hereda identidad ni datos personales de CLIENTE. |

La autoridad exacta continúa siendo `backend/docs/permissions.md` y las guardas existentes.

- Personal: usuario y contraseña de API; el rol proviene de la sesión, nunca de un selector local.
- Cliente: teléfono o número de cliente y NIP de cuatro dígitos.
- Invitado: acceso sin credenciales y sin actor persistente nuevo.
- Las pantallas originales de ID/PIN de empleado sirven, como máximo, de referencia estética: no se recupera su flujo de autenticación.

## 6. Inventario de pantallas y referencias propuestas

Las rutas de destino existen actualmente. El mapeo siguiente es inicial y debe verificarse en ejecución; no autoriza duplicar rutas ni cambiar su estructura.

| Ruta / superficie del unificado | Referencia original propuesta | Adaptación necesaria |
| --- | --- | --- |
| `/terminal` | `empleados/src/components/WelcomeScreen.jsx` | Preservar entrada y destino por sesión/rol; no restaurar configuración local de negocio. |
| `/terminal/acceso` | `EmployeeIdScreen.jsx`, `EmployeePinScreen.jsx`, `AdminAuthModal.jsx` | Referencia estética solamente; formulario único de usuario/contraseña y estados de sesión actuales. |
| `/terminal/pos`, personalización y resumen de orden | `OrderingWorkspace.jsx`, `PosHeader.jsx` | Conservar precios/opciones de API, estimados e identidad de la orden. |
| `/terminal/caja` | `ShiftWorkspace.jsx` | Importes de API, responsable real y restricciones de cierre. |
| `/terminal/cobro`, ticket y QR de registro | `CheckoutModal.jsx`, `ReceiptModal.jsx` | Sólo operaciones implementadas; estados inciertos y vencimiento del QR siguen visibles. |
| `/terminal/historial` | `HistoryWorkspace.jsx` | Listado/reimpresión sin nuevo cobro y sin ampliar permisos. |
| `/terminal/cocina` | `KitchenWorkspace.jsx` | Estados y transiciones permitidas por API. |
| `/terminal/disponibilidad` | Controles pertinentes de `MenuManagementWorkspace.jsx` | Pantalla propia de disponibilidad; no presentar CRUD al CAJERO. |
| `/terminal/administracion/*` | `AdminDashboardWorkspace.jsx`, `MenuManagementWorkspace.jsx`, `UserManagementWorkspace.jsx` | Adaptar dashboard, catálogo/opciones y personal existentes; no incorporar proveedores simulados. |
| `/cliente/iniciar-sesion` | `clientes/src/pages/AuthPage.tsx`, `components/PinInput.tsx` | Login, invitado y reemplazo de actor actuales. |
| `/cliente/menu`, personalización, carrito y confirmación | `MenuPage.tsx`, `Header.tsx`, `ProductCard.tsx`, `ProductModal.tsx`, `CartDrawer.tsx`, `OrderConfirmationModal.tsx` | Mantener orden pendiente sin representar pago confirmado. |
| `/cliente/cuenta` | `ProfileModal.tsx`, `OrderHistoryModal.tsx` y superficies de cuenta originales | La cuenta ya tiene ruta propia: conservarla y adaptar la composición sin convertirla silenciosamente en modal. |
| `/cliente/registro-ticket` | Patrones visuales de `AuthPage.tsx`; referencia específica por aprobar | No copiar un flujo inexistente; conservar token sólo en memoria y login explícito posterior. |
| `/`, `/cambiar-nip`, 404, acceso denegado y reemplazo de sesión | Sin equivalente visual directo confirmado | Usar lenguaje del área, sin añadir cambio de NIP funcional ni ocultar el bloqueo existente. |

Los componentes de configuración/temas y menús originales sólo aportan referencias a funciones ya soportadas. No se habilitan temas o preferencias adicionales por copiar su apariencia.

## 7. Requisitos visuales y responsive

### RV-01 — Referencia visual aprobada

Para cada pantalla se registra versión/commit origen, ruta o estado de navegación original, rol, datos sintéticos, viewport y fuentes/recursos. Se aplica el enfoque híbrido solicitado por el responsable:

- **Lote inicial:** capturar y aprobar bienvenida/acceso/POS de terminal y acceso/menú/personalización de cliente para fijar identidad, temas y patrones. Cada aprobación identifica qué referencias acepta, aunque se revisen juntas.
- **Referencia heredada:** una pantalla estándar puede migrarse desde sus componentes/CSS/recursos originales enlazando los patrones aprobados del lote, sin aprobación previa individual de una captura. La composición se reproduce desde la fuente original, no se inventa por compartir colores. Al terminar el bloque se presentan capturas original/migrada equivalentes y se solicita aceptación de sus superficies y estados.
- **Adaptación previa:** login staff, caja/cobro/ticket, reimpresión, cuenta cliente, registro por ticket, pantallas sin equivalente y diferencias de flujo necesitan propuesta visual y aprobación antes del código afectado. Se pueden revisar juntas las adaptaciones de un bloque, identificando cada una.
- **Patrón no cubierto o ambiguo:** obtener referencia puntual y decisión antes de reproducir esa parte. Una referencia heredada no acredita un patrón que no muestra ni permite omitir evidencia final.

Cualquier dato demo usado para capturar queda restringido al entorno de prueba, no al runtime del unificado. El lote reduce esperas repetidas; no reemplaza la comparación y aceptación de cada superficie al cerrar su bloque.

### RV-02 — Fidelidad y diferencias

Se comparan referencia y resultado con el mismo viewport y contenido equivalente: composición, densidad, tipografía, color, espaciado, iconos y estados interactivos. No basta recuperar la paleta ni ofrecer una pantalla funcional con otro aspecto. Se conserva también la posición relativa de navegación, contenido y acciones principales, salvo adaptación aprobada.

Los colores se extraen de las fuentes originales y del tema seleccionado, con su valor y función (fondo, superficie, texto, acción, estado). No se reemplazan por una paleta nueva ni se mezclan las identidades de ambas áreas. Si el contraste exige ajustar un tono, se propone el cambio mínimo, se registra el antes/después y se solicita aprobación de la diferencia.

Cada desviación intencional queda identificada, justificada y aprobada; no se exige reproducir defectos de accesibilidad ni controles ficticios. Cuando no sea posible copiar una superficie por diferencias de funcionalidad, se conserva el máximo de su lenguaje visual y se documenta exactamente qué se adapta y por qué.

### RV-03 — Base visual y aislamiento

Los estilos de cliente no alteran terminal ni viceversa. Recursos compartidos mantienen consistencia; la carga de fuentes e iconos debe ser comprobable, sin solicitudes externas nuevas no aprobadas ni glifos faltantes. No importar hojas globales legadas sin revisar sus efectos.

### RV-04 — Dispositivos

Matriz mínima propuesta: cliente 390×844 y 1280×800; terminal 1024×768 y 1280×800; comprobación adicional a 320 CSS px y zoom de 200 %. Se admite adaptación específica de tablas y paneles, no controles recortados ni desplazamiento horizontal de toda la página. Validar ventanas Electron desde su tamaño mínimo soportado y maximizada. Los tamaños definitivos se confirman con el responsable antes de fijar baselines.

### RV-05 — Estados y contenido real

Diseñar cargas, vacíos, errores, textos largos, productos sin imagen, importes grandes y acciones deshabilitadas. No ocultar avisos de seguridad o conciliación para mejorar la captura. Nombres, precios, cantidades y acciones operativas provienen de API, sin cambiar su significado.

### RV-06 — Impresión

La vista impresa mantiene detalle, importes, caracteres legibles y QR válido, sin imprimir navegación, controles ni secretos en texto. Comprobar vista previa de impresión con el ancho soportado; no afirmar compatibilidad con impresora física sin prueba específica.

### RV-07 — Aplicación acotada de `frontend-design`

La skill se utiliza como herramienta de calidad, no como autorización de rediseño. El brief del responsable y las referencias originales prevalecen sobre recomendaciones genéricas de paleta, tipografía, layout o movimiento.

Su uso debe seguir estas dos pasadas antes de escribir código:

1. **Extraer y proponer:** registrar para el lote un sistema compacto derivado del original: 4–6 colores base con hex/roles (más colores semánticos necesarios), fuentes, escala, espaciado y composición. Añadir un wireframe fiel para el lote y para adaptaciones sensibles. Las pantallas estándar pueden enlazar ese sistema y sus fuentes específicas, sin repetir la propuesta completa.
2. **Contrastar y aprobar:** comparar con el lote/capturas y el flujo soportado. Eliminar cambios de preferencia estética genérica. Aprobar previamente las adaptaciones sensibles y cualquier refinamiento; las reproducciones estándar se revisan y aceptan al finalizar su bloque conforme a RV-01.

Se admiten propuestas de mejora en alineación, consistencia de espaciado, legibilidad, jerarquía, adaptación responsive y feedback de interacción. No se permite introducir sin aprobación colores nuevos, cambiar familias tipográficas disponibles, reorganizar navegación, añadir pasos, sustituir modales por páginas o inventar textos, métricas y decoraciones para llenar el diseño.

### RV-08 — Primero reproducción; después refinamiento

Se trabaja por bloques pequeños de entrega, sin separar obligatoriamente captura y portado en tasks distintas para cada pantalla. Dentro de cada bloque se conservan dos etapas de alcance diferentes:

- **A. Reproducción fiel:** portar la apariencia original sobre la lógica unificada y presentar capturas comparativas. No mezclar mejoras opcionales que impidan evaluar la fidelidad.
- **B. Refinamiento aprobado:** aplicar únicamente mejoras de `frontend-design` aceptadas expresamente, comparando referencia original, reproducción y resultado refinado. Si no se aprueba un refinamiento, se conserva la reproducción accesible de la etapa A.

La etapa B es opcional y requiere encargo separado posterior a la reproducción aceptada; no hay que esperar un refinamiento para cerrar A. Cada bloque entrega evidencia de todas sus superficies/estados y aceptación identificable; aprobar un bloque no aprueba el siguiente.

Las adaptaciones obligatorias por seguridad, autenticación real o accesibilidad se identifican desde la etapa A y se revisan como diferencias necesarias, no como mejoras opcionales. No se posponen controles de seguridad ni se implementa primero un defecto conocido.

El flujo visual original se conserva donde corresponda a una capacidad ya soportada. El flujo funcional del unificado permanece como autoridad: orden de acciones, confirmaciones, datos requeridos, guardas y estados. Si ambos difieren (por ejemplo, ID/PIN legado frente a usuario/contraseña), la spec exige una adaptación explícita, no restaurar la lógica antigua.

## 8. Accesibilidad

- WCAG 2.1 AA como objetivo: contraste mínimo 4.5:1 en texto normal, 3:1 en texto grande y elementos gráficos/controles aplicables.
- Teclado completo, foco visible y orden coherente; diálogos con foco inicial, contención y retorno cuando corresponda, sin trampas.
- Etiquetas y nombres accesibles incluyen el texto visible; los iconos no sustituyen el nombre de acciones.
- Color no es la única señal; mantener errores, estados y avisos perceptibles.
- Respetar `prefers-reduced-motion`, zoom y escalado; no copiar `outline:none`, `user-select:none` u `overflow:hidden` globales que impidan uso accesible.
- Auditorías axe de las superficies migradas, incluidos diálogos abiertos y estados relevantes, sin desactivar reglas para aprobar. Hallazgos de contraste indeterminado requieren revisión y evidencia, no se consideran aprobación automática.
- Pruebas automáticas no sustituyen revisión manual de teclado, foco y legibilidad.

## 9. Invariantes funcionales y de seguridad

1. Una sola sesión activa por perfil de navegador; cambio de actor exige confirmación y logout exitoso, con limpieza y sincronización existentes.
2. Cookies y CSRF no se trasladan a almacenamiento local, URLs, logs ni atributos de presentación. No se cambia `credentials: include` ni refresh coordinado.
3. Tokens de registro sólo en memoria; no crear enlaces copiables que expongan el token ni persistir capturas de QR/tickets reales como baselines.
4. La incertidumbre de pagos nunca se representa como éxito; las acciones idempotentes conservan sus claves, cuerpos y reintentos autorizados.
5. Persistencia limitada a preferencias y borrador ya permitidos; ni roles ni precios locales conceden permisos o confirman operaciones.
6. Cambiar jerarquía visual o desmontar componentes no puede perder una operación incierta, duplicar efectos, cobros o peticiones mutables.
7. Mantener semántica y selectores accesibles; no debilitar pruebas existentes para acomodar el nuevo diseño.

## 10. Electron y coexistencia

- Electron Windows sigue cargando `/terminal` desde URL HTTP(S) configurada, HTTPS obligatorio en distribución; sin `file://` ni respaldo offline.
- Se conservan preload, aislamiento, sandbox, restricciones de navegación y bloqueo de `/cliente/**`; no se vuelve a mostrar el enlace Cliente en escritorio.
- La migración visual no acredita el despliegue HTTPS/fallback pendiente ni amplía el alcance a macOS.
- Las aplicaciones originales permanecen intactas y ejecutables como referencia; no se importan a runtime sus contextos, API clients, datos locales o credenciales.
- Se migra de forma incremental en el unificado. La secuencia técnica y la reversión se definirán en el plan posterior, sin modificar contratos ni retirar paquetes originales.

## 11. Verificación y evidencia requerida

Cada futura task debe producir:

1. Lote aprobado y referencia por superficie (heredada o adaptación previa según RV-01), con fuentes originales trazables y capturas original/unificado al entregar el bloque en viewports equivalentes, fixture sintético y versiones identificadas. Una task de documentación/tooling acredita su propio alcance, no exige capturas de UI que no modifica.
2. Comparación visual revisada por una persona; cualquier diferencia aprobada queda registrada. No actualizar baselines automáticamente para ocultar regresiones.
3. `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run test`, `npm.cmd run test:e2e`, `npm.cmd run build` en `frontend/unified/`, y `git diff --check` desde raíz.
4. Pruebas específicas de accesibilidad, responsive, estados y permisos afectados, más prueba Electron cuando cambie una superficie de terminal.
5. Resultado distinguido entre ejecutado, omitido y bloqueado; cambios revisados de manera independiente antes de commit.

Las capturas deben estabilizar reloj, animaciones y datos cuando sea necesario, sin desactivar el comportamiento funcional en producción. Tooling, ubicación de evidencia y tolerancias de comparación se decidirán en el plan; una diferencia porcentual baja no reemplaza la aprobación visual humana.

La evidencia visual distingue **original**, **reproducción fiel** y, cuando aplique, **refinamiento aprobado**. El registro de diferencias incluye superficie, motivo, impacto en colores/flujo, referencia antes/después y aprobación; sin este registro no puede declararse equivalente una pantalla reinterpretada.

## 12. Riesgos y tratamiento

| Riesgo | Requisito de control |
| --- | --- |
| Copiar apariencia y lógica insegura juntas | Reutilizar presentación de forma selectiva; conservar servicios y estados unificados. |
| Confundir ID/PIN antiguo con login real | Adaptación visual explícita del formulario usuario/contraseña; no restaurar autenticación demo. |
| Colisión de resets y utilidades CSS | Aislamiento por área y revisión de estilos globales antes de trasladarlos. |
| Fuentes/iconos remotos o no disponibles | Inventariar origen, licencia y carga; aprobar alternativa si no puede conservarse el recurso. |
| Reordenar componentes pierde estado de pago | Pruebas de operación incierta e idempotencia tras cambios de composición. |
| Reintroducir contrastes bajos o foco invisible | axe más revisión manual; diferencias accesibles aprobadas sobre la referencia. |
| Capturas inestables o con datos sensibles | Fixtures deterministas y revisión de secretos/QR antes de guardar evidencia. |
| Declarar equivalencia sólo por pruebas verdes | Aceptación visual al cerrar cada bloque, identificando sus pantallas/estados, obligatoria. |

## 13. Criterios de aceptación

- **CA-01:** inventario completo de rutas, superficies y estados, con lote aprobado y referencia heredada trazable o adaptación previa aprobada para cada caso según RV-01.
- **CA-02:** cada pantalla incluida reproduce el diseño aprobado en composición e identidad, con evidencia comparable y sin desviaciones sin registrar.
- **CA-03:** los logins conservan credenciales y permisos reales; no aparecen cuentas demo ni selección local de rol.
- **CA-04:** no hay regresión de sesiones, API, pagos, almacenamiento, QR ni guardas; pruebas funcionales existentes y nuevas aprobadas.
- **CA-05:** responsive, zoom, teclado, foco, contraste y movimiento reducido verificados en la matriz acordada.
- **CA-06:** navegador conserva ambas áreas; Electron Windows muestra sólo terminal y mantiene sus aislamientos.
- **CA-07:** impresión legible y QR de registro válido sin exposición textual de secretos ni promesas de compatibilidad física no comprobadas.
- **CA-08:** revisión independiente y aceptación visual del responsable al cerrar cada bloque, con sus superficies/estados identificados; ninguna pantalla se considera terminada sólo por heredar el lote.
- **CA-09:** aplicaciones originales intactas; ningún despliegue ni retiro implícito.
- **CA-10:** paleta y funciones de color corresponden al tema original aprobado; cualquier ajuste de contraste tiene evidencia y aprobación, sin sustitución general de colores.
- **CA-11:** el uso de `frontend-design` queda documentado por lote/bloque con tokens, fuentes y composición originales y su relación con cada superficie; refinamientos opcionales separados y aprobados antes del código.
- **CA-12:** no se cambian flujos, pasos, navegación o contratos por motivos estéticos; las incompatibilidades con el prototipo tienen una adaptación explícita que conserva el comportamiento seguro del unificado.

## 14. Pendientes de aprobación y siguiente paso SDD

| ID | Propuesta / pregunta | Estado |
| --- | --- | --- |
| PV-01 | Migrar los diseños originales tal cual o lo más parecido posible, respetando colores y flujos soportados | Directriz solicitada por el responsable; referencias concretas pendientes |
| PV-02 | Priorizar terminal y después cliente, sin excluir ninguna superficie del inventario | Propuesta para el plan |
| PV-03 | Confirmar tema de referencia de cada área; no asumir que todos los temas legados deben migrarse | Pendiente de selección |
| PV-04 | Aprobar capturas y tamaños de referencia; la lectura del código no sustituye su revisión visual | Pendiente de captura y aprobación |
| PV-05 | Elegir estrategia de estilos, recursos y pruebas visuales durante el plan, sin imponer dependencias desde esta spec | Pendiente del plan |
| PV-06 | Usar `frontend-design` con prioridad de fidelidad al original y refinamientos separados; sin rediseño libre | Uso solicitado por el responsable; cada refinamiento requiere aprobación |
| PV-07 | Enfoque híbrido: lote representativo aprobado, portado por bloques desde fuentes originales, comparación final y revisión previa de adaptaciones sensibles | Ajuste solicitado por el responsable; no aprueba temas, capturas ni ejecución de tasks |

La aprobación recibida de esta spec autoriza preparar el **plan**, no implementar interfaz. Después se elaboran tasks atómicas y se solicita aprobación de cada task antes de iniciarla. Las decisiones que afecten al proyecto se registran conforme al proceso de unificación. Las propuestas, referencias concretas y refinamientos identificados como pendientes no se consideran aceptados por la aprobación general del documento.
