# PLAN-FE-VIS-001 — Migración visual fiel, enfoque híbrido

- **Estado:** revisión híbrida solicitada por el responsable; sustituye el procedimiento de referencias y descomposición del plan previamente aprobado.
- **Fuente:** [SPEC-FE-VIS-001](./FRONTEND-VISUAL-MIGRATION-SPEC.md), cuya fidelidad, colores, seguridad y alcance se conservan.
- **Rama:** `feat/frontend-visual-migration`.
- **Autorización:** redactar esta revisión y las tasks; no iniciar implementación ni dar por aprobadas capturas o diferencias.

## 1. Qué cambia y por qué

El objetivo sigue siendo trasladar los diseños originales tal cual o lo más parecido posible sobre la lógica segura de `frontend/unified/`. Para reducir coordinación, no se hace una task de referencia y otra de reproducción para cada pantalla: se trabaja con un **lote visual representativo**, referencias heredables documentadas y aceptación al terminar cada bloque.

Fuente visual principal: componentes, CSS y recursos de `frontend/empleados/` y `frontend/clientes/`. Se trasladan selectivamente markup y presentación; no se importan contextos, API clients, datos demo, credenciales, persistencia ni reglas funcionales antiguas.

El enfoque híbrido ahorra capturas y esperas redundantes. No elimina inspección visual, tests, permisos, accesibilidad o aceptación del responsable. Tampoco garantiza una duración sin comprobar antes la complejidad real.

### Compatibilidad con la spec

El responsable autorizó ajustar también la spec para este enfoque: RV-01, RV-07/08, §11 y CA-01/08/11 distinguen lote, referencia heredada y adaptación previa sensible. Las pantallas estándar se comparan al terminar su bloque; no requieren captura individual aprobada antes del código si heredan patrones pertinentes y fuentes originales trazables.

Las instrucciones de agentes/skills se armonizan con esas puertas. Esta revisión no aprueba capturas ni tareas de ejecución: primero inventario/harness, después lote elegido/aprobado y autorización individual de cada bloque.

## 2. Contrato de referencia híbrida

### 2.1 Lote inicial para aprobar identidad

Capturar originales en ejecución con datos sintéticos y perfiles aislados:

- Terminal: bienvenida, acceso original y POS con cabecera, catálogo y panel de orden.
- Cliente: acceso y menú con cabecera/tarjetas, más una personalización abierta para fijar el lenguaje de overlays.
- Registrar tema, colores, fuentes realmente cargadas, recursos, viewports, commit y estado/rol. El responsable elige los temas; no migrar todos por defecto.
- Presentar una sola revisión del lote con decisiones específicas: aprobar todas o sólo algunas referencias no implica aceptar automáticamente las restantes.

La adaptación de login staff a usuario/contraseña se muestra como wireframe separado del original ID/PIN; nunca se restaura la autenticación demo.

### 2.2 Pantallas estándar: referencia heredada

Para cada entrega, inventariar componentes/CSS/recursos originales exactos y enlazar los patrones aprobados del lote (tema, navegación, tabla, tarjeta, formulario u overlay). Un lote no acredita por sí solo una composición que no contiene.

Si la pantalla original usa patrones ya aprobados y no cambia flujo, se reproduce directamente desde esas fuentes. Al terminar el bloque se muestran capturas original/migrada equivalentes, con diferencias y aceptación final. No se exige una aprobación previa adicional de esa captura original bajo el procedimiento híbrido propuesto.

Si un patrón no está representado, es ambiguo o hay diferencias relevantes, añadir una captura puntual y pedir decisión antes del código afectado. No inventar una referencia ni usar la captura de la nueva UI como si fuera el original.

### 2.3 Revisión previa obligatoria de adaptaciones sensibles

Siempre presentar antes de implementar:

- Login staff: estética original con usuario/contraseña real.
- Caja, cobro, resultado incierto, recuperación/reimpresión de ticket y QR válido/vencido.
- Cuenta cliente: modales originales adaptados a `/cliente/cuenta`.
- Registro por ticket y pantallas sin equivalente original.
- Navegación por roles o diferencias de interacción, persistencia o estado que no sean puramente visuales.

Se pueden aprobar juntas las adaptaciones de un bloque, identificando cada una. Si aparece una diferencia nueva, parar sólo esa parte y pedir aprobación.

### 2.4 Refinamiento

`frontend-design` extrae tokens, jerarquía y composición de las referencias y revisa detalle. No cambia paleta, fuentes disponibles, marca ni flujo. Reproducción fiel y mejoras opcionales se mantienen separadas: cualquier refinamiento opcional necesita propuesta y task posterior; no se introduce durante el portado para justificar desviaciones.

## 3. Arquitectura y decisiones técnicas

| Decisión propuesta para esta revisión | Motivo | Alternativa no elegida | Requisitos |
| --- | --- | --- | --- |
| CSS propio scoped por área, reutilizando valores originales | Preserva identidades sin rehacer toolchain | Añadir Tailwind/UI kit inicialmente: coste y riesgo de resets; reconsiderar sólo con evidencia y aprobación | RV-02, RV-03, CA-10 |
| Mantener features, servicios, hooks y providers | Conserva sesión, pagos y datos reales | Copiar componentes legados enteros: puede traer lógica demo | CA-03, CA-04, CA-12 |
| Portar bloques visuales coherentes | Menos esperas que 69 tasks R/U | Una única tarea de toda la app: demasiado riesgo y difícil revisión | RV-08, CA-08 |
| Playwright/Chromium y `_electron` existentes | Capturas y pruebas sin nueva plataforma | Servicio externo o igualdad porcentual universal: no sustituyen aceptación humana | RV-01, CA-06, CA-08 |
| Recursos originales verificados | Fidelidad y procedencia controlada | Nuevos CDN, fuentes/iconos genéricos: requieren aprobación | RV-03, CA-02 |

Las decisiones aceptadas se registran con nuevos IDs reales en el registro transversal de unificación antes del código correspondiente. No inventar aprobaciones ni sustituir silenciosamente decisiones anteriores.

### 3.1 Módulos y archivos

| Ruta prevista en `frontend/unified/` | Responsabilidad |
| --- | --- |
| `src/styles/terminal/tokens.css`, `src/styles/clientes/tokens.css` | Colores/roles, fuentes, radios y espaciado del tema aprobado |
| `src/styles/terminal/*.css`, `src/styles/clientes/*.css` | Estilos de cada bloque; sin contaminación entre áreas |
| `src/styles/base.css`, `shared.css` sólo si hay reutilización real | Base accesible, foco/skip-link/reduced-motion; retirar reglas globales conflictivas gradualmente |
| `src/assets/terminal/`, `src/assets/clientes/` | Recursos con origen/licencia/carga comprobados; sin dependencia externa nueva implícita |
| `src/layouts/TerminalLayout.tsx`, `ClientLayout.tsx` | Shell por área; mismos roles, navegación y bloqueo de cliente en Electron |
| `src/features/terminal/{auth,pos,cash,payment,kitchen,history,admin}/` | Presentación sobre estado existente; `AdminPage.tsx` se migra por subárea |
| `src/features/clientes/{auth,catalog,cart,account,registration}/` | Presentación existente; carrito/confirmación y cuenta conservan semántica actual |
| `src/app/router.tsx`, `guards.tsx`, `src/shared/auth/ActorChangeDialog.tsx` | Sólo markup de estados transversales, sin cambiar guardas ni manager de sesión |
| `playwright.visual.config.ts`, `e2e/visual/` | Captura aislada y fixtures, separada del descubrimiento E2E funcional |
| Pruebas de componente y `e2e/accessibility.spec.ts` | Asunciones funcionales, roles, estados, accesibilidad de bloques modificados |

No hay modelo de dominio/BD nuevo. No importar CSS legado entero: revisar resets que eliminan foco/selección o restringen overflow. El componente `ProductCustomizationDialog.tsx` es compartido por cliente y POS; preservar aislamiento visual y comprobar ambos consumidores tras cambiarlo.

## 4. Capturas y modelo de evidencia

### Entorno

- Unificado `localhost:5173`; originales en puertos de captura `5183` y `5184`, `--strictPort`, bind localhost, sin cambiar sus fuentes/configuración habitual.
- Simular API y sólo el almacenamiento sintético necesario para originales en perfiles temporales. Prohibido usar `.env`, credenciales o BD del proyecto para capturas.
- Capturar original/migrado con contenido equivalente, mismo navegador/OS/DPR y viewport; esperar estado visible, fuentes e imágenes. Estabilizar reloj/animaciones sólo en tests.
- Cliente: propuesta 390×844 y 1280×800; terminal: 1024×768 y 1280×800. Acordar tamaños definitivos en el lote; revisar además reflow 320 CSS px y zoom 200 %.
- Electron Windows: comprobar surfaces terminal en tamaño mínimo soportado y maximizada, con preload real y mocks. No afirmar evidencia Electron a partir de una captura Chromium.
- Impresión: ticket con fixture sintético y ancho acordado; no afirmar compatibilidad con impresora física sin prueba.

### Archivos y campos

En `frontend/docs/specs/frontend-visual-migration/`:

```text
FRONTEND-VISUAL-MIGRATION-REFERENCES.md
FRONTEND-VISUAL-MIGRATION-STATUS.md
FRONTEND-VISUAL-MIGRATION-VALIDATION.md
evidence/<task>/<surface>/<viewport>/
  original.png
  reproduction.png
  evidence.md
```

`evidence.md` registra: task, requisitos RV/CA, superficie, rutas de código original/destino, hashes y diff pendiente si aplica, tema, rol/estado, fixture, navegador/OS/DPR, viewport, comando y capturas.

Cada referencia indica `tipo: lote | heredada | adaptacion-previa`, patrones heredados y fuentes originales. Cada diferencia contiene región, motivo (funcional/seguridad, accesibilidad/responsive u opcional), antes/después y aprobación pendiente/recibida identificable. Aprobación del lote, adaptación previa y aceptación del resultado son eventos separados.

Versionar sólo PNG seleccionados y revisados, sin secretos; reports/traces/vídeos temporales quedan ignorados. No sobrescribir originales aprobados ni ejecutar `--update-snapshots` para ocultar regresiones. Si fuentes o herramientas faltan, marcar el bloqueo; no deducir apariencia desde CSS solamente.

## 5. Secuencia de entrega y dependencias

1. **Preparación:** comprobar coherencia de reglas híbridas ya ajustadas, crear registros, inventario conjunto y herramienta aislada.
2. **Lote representativo:** originales terminal/cliente, temas y adaptaciones iniciales; aprobación del responsable.
3. **Terminal:** base/shell y bienvenida → login → POS → personalización/resumen → caja/cobro/ticket → cocina/disponibilidad → historial → administración por subárea.
4. **Cliente:** base/shell y acceso → catálogo → personalización/carrito → confirmación → cuenta → registro.
5. **Transversal:** entrada, 404, denegaciones, sesión restringida y reemplazo de actor.
6. **Auditoría:** recorrer todos los requisitos y superficies con pruebas/capturas/aceptación, distinguiendo omitido y bloqueado.

Los bloques sensibles incluyen una pausa previa de aprobación de adaptación. Las tareas no sensibles heredan referencias aprobadas; se aceptan al terminar. La aprobación de una task no aprueba la siguiente.

## 6. Procedimiento de una task

```text
Leer task aprobada, fuentes originales y requisitos asociados.
Verificar lote/tema y patrones heredados.
Si hay flujo sensible, patrón nuevo o diferencia relevante:
    presentar adaptación y esperar aprobación antes del código afectado.
Preparar tests/expectativas, fixture y recorrido visual.
Portar presentación selectivamente, sin reemplazar lógica unificada.
Ejecutar pruebas y comparar original/migrado en estados aplicables.
Solicitar revisión técnica y visual independientes.
Corregir diferencias no aprobadas y repetir verificaciones.
Obtener aceptación del resultado del bloque por el responsable.
Registrar cierre/commit de esa task y detenerse.
```

«Tests primero» no significa aceptar una captura del resultado como expectativa. Para documentación no se exige fabricar un test fallido. Una task demasiado grande se subdivide antes del código con criterios y aprobación propios.

## 7. Pruebas y trazabilidad

Desde `frontend/unified/`, comandos individuales:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run test:e2e
npm.cmd run build
```

Desde raíz: `git diff --check`. Harness visual y comandos específicos se añadirán en su task; no se presentan como existentes. Verificar descubrimiento/conteo de pruebas: exit 0 con `--pass-with-no-tests` no acredita escenarios ejecutados.

| Requisitos | Solución | Evidencia requerida |
| --- | --- | --- |
| RV-01, CA-01 | Inventario, lote y referencia heredada/adaptación por superficie | Registro completo y uso conforme a RV-01 híbrida de la spec |
| RV-02, CA-02 | CSS/markup original portado selectivamente | Comparativas por bloque, sin diferencias no aprobadas |
| RV-03, CA-10 | Tokens por área y recursos verificados | Hex/roles/font/iconos trazables; regresión de la otra área |
| RV-04, CA-05 | Responsive y base accesible | Reflow/zoom, teclado/foco, reduced-motion, axe y contraste indeterminado revisados |
| RV-05, CA-04 | Estados y servicios actuales conservados | Carga/vacío/error/deshabilitado/denegación; pendiente/éxito/incierto de acciones existentes |
| RV-06, CA-07 | Vista imprimible y ticket existente | Preview legible, QR sintético válido/vencido y sin UI no imprimible |
| RV-07, RV-08, CA-11 | frontend-design acotada y refinamientos separados | Tokens/wireframe del lote y adaptaciones; ninguna mejora opcional implícita |
| CA-03, CA-12 | Guardas/logins/confirmaciones sin cambios funcionales | Regresión de roles, sesión, permisos e idempotencia; diff de lógica inspeccionado |
| CA-06 | Mismo wrapper/bridge de Electron | Capturas Electron y pruebas de navegación/aislamiento; navegador conserva ambas áreas |
| CA-08 | Revisores independientes y aceptación por bloque | Revisión técnica, visual y aceptación explícita enlazadas al resultado |
| CA-09 | Originales de sólo lectura y sin despliegue | Diff/status sin cambios o bajas en originales/backend; sin publicación |

Una auditoría por bloque no acredita todas las pantallas: la validación final enumera superficie/estado, task, prueba/captura, resultado y aceptación. No afirmar accesibilidad total por axe ni fidelidad por pruebas verdes.

## 8. Agentes, registro y cierre

- Investigador: inventario factual, patrones y recursos; no elige tema.
- Implementador: una task aprobada, frontend-design acotada, portado selectivo; no commit ni aprobación visual propia.
- Verificador: suites y capturas con tooling aprobado, sin editar baselines ni BD.
- Revisor técnico: seguridad, flujo, alcance, regresiones y accesibilidad.
- Revisor visual: comparar imágenes y fuentes, identificar diferencias; sin sustituir aceptación humana.
- Coordinador: conservar cambios ajenos, registrar decisiones y cierre tras aprobación del responsable.

STATUS usa pendiente/en curso/bloqueada/pendiente de aceptación/terminada. Cada cierre incluye comandos y resultados reales, capturas, revisiones, aceptación y decisiones; referencia `mismo commit` en la fila incluida en el commit. Un commit por task cerrada con rutas explícitas, sin `git add -A`, push, merge, rebase o resets por iniciativa propia.

## 9. Riesgos y reversión

- Referencia heredada insuficiente: pedir captura/decisión puntual antes de continuar esa parte.
- Copia visual arrastra lógica demo: preservar servicios/providers y revisar diff, no portar componente completo a ciegas.
- Estilos shared afectan ambas áreas: aislar imports y comparar ambos consumidores.
- Estado de pago se pierde al recomponer: no desmontar providers ni regenerar claves; probar resultados inciertos.
- CSS propio no logra fidelidad: presentar evidencia y alternativa antes de añadir tooling.
- Falta aceptación/capturas: mantener task pendiente, no cerrar por presión de velocidad.

Reversión: detener bloque afectado y proponer corrección o reversión explícita autorizada de su commit; no descartar trabajo ajeno ni volver al prototipo inseguro. Mantener originales como referencia. Despliegue HTTPS/fallback y retiro de apps continúan fuera de alcance.

## 10. Formato de tasks y próximo paso

Las tasks agrupan entregas coherentes, no pares R/U para cada pantalla. Cada una enlaza requisitos, dependencias, archivos, fuentes visuales, revisión previa si corresponde, tests primero y «Hecho cuando» verificable. No se impone 20–30 minutos a un bloque completo: si es demasiado amplio para revisión segura se subdivide antes de implementarlo, no se reduce su verificación.

La armonización de spec/agentes/skills fue autorizada y se incorpora a esta revisión documental; no es una task de UI pendiente. HYB-01 (registros e inventario) fue autorizada individualmente y se documentó sin cambiar pantallas; el siguiente paso será solicitar aprobación individual para HYB-02 (harness aislado). No se inicia ninguna migración de UI por modificar estos documentos.
