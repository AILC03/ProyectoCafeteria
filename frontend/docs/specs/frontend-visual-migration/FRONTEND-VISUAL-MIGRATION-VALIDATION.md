# FRONTEND-VISUAL-MIGRATION-VALIDATION — Auditoría integral SPEC-FE-VIS-001

- **Task:** HYB-25 (D, H) · **Rama:** `feat/frontend-visual-migration` · **Fecha de auditoría:** 2026-11-26.
- **Estado:** auditoría ejecutada; **aceptación integral del responsable pendiente**.
- **Fuentes:** [spec](./FRONTEND-VISUAL-MIGRATION-SPEC.md), [plan](./FRONTEND-VISUAL-MIGRATION-PLAN.md), [tasks](./FRONTEND-VISUAL-MIGRATION-TASKS.md), [referencias](./FRONTEND-VISUAL-MIGRATION-REFERENCES.md), [cierres](./FRONTEND-VISUAL-MIGRATION-STATUS.md) y [decisiones](../../frontend-unification/FRONTEND-UNIFICATION-DECISIONS.md) D-27…D-33.
- **Alcance auditado:** HYB-01…HYB-24 en `frontend/unified/`. Los originales `frontend/empleados/` y `frontend/clientes/` y el backend no se modificaron.

## 1. Ejecución verificada

Comandos ejecutados en `frontend/unified/` sobre el estado commiteado de esta auditoría:

| Comprobación | Resultado |
| --- | --- |
| `npm run lint` | 0 errores, 0 warnings |
| `npm run typecheck` (tsconfig app/node) | 0 diagnósticos |
| `npm run test` | **295/295** pruebas, 33 archivos |
| `npm run test:e2e` | **59/59** |
| `npx playwright test -c playwright.visual.config.ts` | **108/108** |
| `npm run build` | Correcto (aviso conocido de tamaño de chunk, sin error) |
| `git diff --check` (raíz) | Sin errores |
| `git diff c88d01b -- frontend/empleados frontend/clientes backend` | Sin cambios |

Capturas de verificación: `frontend/unified/test-results/visual/` (ignoradas por Git, **no aprobadas como baseline**). Referencias aprobadas: `evidence/HYB-03`, `evidence/HYB-04` y `evidence/HYB-05`.

## 2. Matriz de criterios de aceptación

| ID | Estado | Evidencia y notas |
| --- | --- | --- |
| CA-01 | Cumplido | Inventario completo en REFERENCES (superficies §6 → destino) y lotes REF-T/REF-C aprobados; adaptaciones sensibles con decisión previa (ADAPT-* y D-28…D-33). |
| CA-02 | Cumplido con diferencias aprobadas | Composición e identidad por área; diferencias registradas y aceptadas en D-28…D-32. Donde no existe captura original (HYB-11…17, 21, 22) la evidencia acredita identidad/estados, no equivalencia píxel a píxel (D-31). |
| CA-03 | Cumplido | Login staff usuario/contraseña y cliente teléfono/número+NIP desde API; sin ID/PIN demo ni selector de rol. Guardas y destinos sin cambios (`app/guards.tsx`, `app/router.tsx`). |
| CA-04 | Cumplido | 59 E2E funcionales y 295 unitarias/componentes; idempotencia, D-13/D-19/D-20 y CSRF cubiertos. Suites ejecutadas tras las correcciones finales. |
| CA-05 | Cumplido parcial documentado | axe en todas las superficies y diálogos capturados; foco/teclado y retorno en diálogos; reflow cliente 320 px y terminal en 1024/1280; `prefers-reduced-motion` forzado en capturas. **Zoom 200 % no medido**: no hay control fiable en Chromium headless/Electron; se cubre con reflow. Contraste valorado por axe y revisión visual, sin medición numérica adicional. |
| CA-06 | Cumplido | Electron carga `/terminal`, bloquea `/cliente/**` y conserva preload/sandbox; capturas Electron en HYB-05…10 y HYB-24; `e2e/electron.spec.ts` 4/4. |
| CA-07 | Cumplido | Ticket imprimible con navegación, filtros y botones ocultos; PDF simulado generado; QR sólo válido y sin exponer token. Impresora física no probada (fuera de alcance declarado). |
| CA-08 | Cumplido | Revisiones técnicas y visuales independientes por bloque (10 agentes/evaluaciones registradas) y aceptación del responsable de las diferencias D-28…D-33 (2026-11-26). |
| CA-09 | Cumplido | Originales y backend intactos; sin despliegue, sin retirada de paquetes y sin cambios en `release/`. |
| CA-10 | Cumplido con límite | Tokens y roles de REF-T/REF-C en `styles/terminal/tokens.css` y `styles/client/*.css`; sin sustitución general de paleta. Ajustes de contraste sólo por axe/revisión, sin medición numérica. |
| CA-11 | Cumplido | Tokens, tipografías, composición y wireframes por lote en REFERENCES; `frontend-design` sin rediseño; refinamientos opcionales no implementados ni aprobados. |
| CA-12 | Cumplido | Sin cambios de flujo, pasos, navegación ni contratos; adaptaciones explícitas para login, caja/cobro/ticket, cuenta, registro, carrito y superficies transversales. |

## 3. Matriz de requisitos visuales

| ID | Estado | Evidencia / límite |
| --- | --- | --- |
| RV-01 | Cumplido | Lote REF-T/REF-C aprobado; referencias heredadas y adaptaciones previas trazadas; capturas finales por bloque. |
| RV-02 | Cumplido con D-28…D-32 | Identidad, densidad y jerarquía por área; desviaciones identificadas y aprobadas. |
| RV-03 | Cumplido | Estilos aislados por `.terminal-layout`/`.client-layout`; sin resets globales lesivos; CSS global nuevo limitado a `.landing-page`/`.status-page`. |
| RV-04 | Cumplido parcial documentado | Cliente 390×844 y 1280×800; terminal 1024×768 y 1280×800; reflow 320 px en catálogo; Electron mínimo/maximizado en HYB-05. Zoom 200 % no medido. |
| RV-05 | Cumplido | Estados de carga, vacío, error, deshabilitado, denegación, incertidumbre y confirmación capturados en las tareas correspondientes. |
| RV-06 | Cumplido | Impresión aislada y PDF simulado; sin afirmar compatibilidad física. |
| RV-07 | Cumplido | Tokens/wireframes documentados; sin colores, fuentes ni pasos nuevos por preferencia estética; iconos Material no empaquetados (D-28). |
| RV-08 | Cumplido | Reproducción y aceptación por bloques; refinamientos opcionales separados y no ejecutados. |

## 4. Matriz de superficies

| Task | Superficie / estados | Evidencia principal | Resultado |
| --- | --- | --- | --- |
| HYB-01 | Registros e inventario | REFERENCES del 2026-11-25 | Documental; sin UI |
| HYB-02 | Harness aislado + guarda de evidencia | `harness.visual.spec.ts` (5 pruebas) | Verificado |
| HYB-03 | Lote terminal REF-T | `evidence/HYB-03/**` | Aprobado |
| HYB-04 | Lote cliente REF-C | `evidence/HYB-04/**` | Aprobado |
| HYB-05 | Shell y bienvenida terminal | capturas 1024/1280 + Electron | Aceptado |
| HYB-06 | Login staff: anónimo, inválido, activo, enviando, logout fallido, recuperable, Electron | 5 pruebas + 9 capturas | Aceptado con D-32 |
| HYB-07 | POS: normal, agotado, error, vacío, Electron | 5 pruebas + 7 capturas | Aceptado con D-32 |
| HYB-08 | Panel de orden, diálogo POS, Electron | 3 pruebas + 5 capturas | Aceptado con D-32 |
| HYB-09 | Caja: abierta/cerrada/resultado/ajena/incierta/error/Electron | 11 pruebas + 15 capturas | Aceptado con D-32 |
| HYB-10 | Cobro: pendiente, ticket fallido, impresión, Electron | 3 pruebas + 5 capturas | Aceptado |
| HYB-11 | Ticket CASH/STRIPE, QR válido/vencido, impresión | 6 pruebas + 12 capturas | Aceptado con D-31 |
| HYB-12 | Cocina y disponibilidad | 4 pruebas + 4 grupos | Aceptado con D-31 |
| HYB-13 | Historial: lista, vacío, reimpresión | 4 pruebas + 6 capturas | Aceptado con D-31 |
| HYB-14 | Dashboard y denegación CAJERO | 4 pruebas + 4 capturas | Aceptado con D-31 |
| HYB-15 | Categorías/productos admin | 4 pruebas + 4 capturas | Aceptado con D-31 |
| HYB-16 | Grupos/valores/configuración (derivada) | 6 pruebas + 8 capturas | Aceptado con D-31 |
| HYB-17 | Personal: alta/edición/denegación | 4 pruebas + 6 capturas | Aceptado con D-31 |
| HYB-18 | Shell/acceso cliente, invitado, sesión activa | 4 pruebas + 8 capturas | Aceptado con D-28 |
| HYB-19 | Catálogo cliente: disponible/agotado/vacío/320 | 4 pruebas + 4 capturas | Aceptado con D-29 |
| HYB-20 | Diálogo y carrito cliente | 4 pruebas + 4 capturas | Aceptado con D-30 |
| HYB-21 | Envío, incierto, confirmación CASH/STRIPE | 8 pruebas + 8 capturas | Aceptado con D-31 |
| HYB-22 | Cuenta: perfil, favoritos, historial, detalle | 4 pruebas + 6 capturas | Aceptado con D-31 |
| HYB-23 | Registro por ticket (derivada) | 2 pruebas + 2 capturas | Aceptado con D-31 |
| HYB-24 | Landing, 404 global/área, denegaciones, sesión restringida, diálogo actor, Electron | 8 pruebas + 16 capturas | Aceptado con D-33 |

## 5. Diferencias y decisiones aplicadas

D-28 (acceso cliente), D-29 (tarjetas de catálogo), D-30 (carrito inline y diálogo), D-31 (evidencia sin original y HYB-16 derivada), D-32 (composición terminal), D-33 (superficies transversales). Todas vigentes y enlazadas en los cierres de STATUS.

## 6. Omitidos, límites y bloqueos declarados

1. **Fidelidad píxel a píxel**: sólo evaluable con originales aprobados (REF-T para terminal y REF-C para cliente). En HYB-11…17, 21 y 22 la evidencia es de identidad, estados y contratos (D-31).
2. **Zoom 200 %**: no verificado; reflow 320 px y viewports acordados sí. Requiere decisión si se considera imprescindible.
3. **Contraste**: axe sin violaciones; sin medición numérica independiente.
4. **Tipografías** (`Outfit`, `Inter`, `Plus Jakarta Sans`) y **Material Symbols**: no empaquetadas; el runtime usa respaldo del sistema. Los iconos se omiten por D-28.
5. **Carrito cliente**: tarjeta inline en lugar de drawer (D-30).
6. **Impresora física**: no probada; sólo PDF y vista previa.
7. **Cobro Electron**: capturado el estado de guarda D-20; el cobro real está ligado al estado en memoria y no se captura en Electron.
8. **HYB-16 y HYB-23**: derivadas sin pantalla original directa.
9. **Despliegue HTTPS/fallback y macOS**: fuera de alcance (D-26).

## 7. Aceptación integral

| Campo | Valor |
| --- | --- |
| Alcance aceptado | HYB-01…HYB-24, diferencias D-28…D-33 y límites de §6 |
| Responsable | Responsable del proyecto (conversación) |
| Fecha | 2026-11-26 |
| Resultado | **Aceptado integralmente** («Aceptar auditoría completa») |

Aceptación registrada. HYB-25 puede cerrarse con esta constancia, siempre que no cambien superficies, diferencias o límites de §6; cualquier cambio posterior requiere nueva verificación y aceptación.
