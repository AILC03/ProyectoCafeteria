---
name: Frontend Visual Fidelity
description: Aplica SPEC-FE-VIS-001 para reproducir diseños originales con frontend-design, evidencia comparable y aceptación visual sin alterar lógica segura.
---

# Fidelidad visual — Coffee's POS

Usa esta skill al investigar, planificar, implementar o revisar la recuperación visual de `frontend/unified/` desde `frontend/empleados/` y `frontend/clientes/`.

## Fuentes y precedencia

1. `frontend/docs/specs/frontend-visual-migration/FRONTEND-VISUAL-MIGRATION-SPEC.md` (SPEC-FE-VIS-001, aprobada por el responsable).
2. Plan/task visual aprobados y referencias de cada pantalla; aprobación de la spec no aprueba capturas ni implementación.
3. Spec funcional, decisiones transversales, permisos backend y módulos seguros ya existentes del unificado.
4. `frontend-design`, aplicable con los límites de esta spec: el brief de fidelidad gana sobre sugerencias genéricas de estilo.

## Contrato visual

- Migrar tal cual o lo más parecido posible. Conservar paleta y función de colores, tipografías disponibles, recursos, composición, densidad y ubicación de acciones.
- Identidades cliente/terminal diferenciadas; no homogeneizar sus paletas por conveniencia.
- No rediseñar marca ni flujos. Sólo proponer adaptaciones mínimas por seguridad, funcionalidad existente, accesibilidad o responsive; aprobación explícita antes del código afectado.
- Mantener usuario/contraseña para staff, teléfono/número y NIP para cliente, guardas y confirmación/logout al cambiar actor. No copiar ID/PIN staff ni credenciales demo.
- No cambiar contratos API, cookies, CSRF, refresh, idempotencia, resultados inciertos, almacenamiento ni Electron. No tocar bases de datos ni desplegar para una task visual.

## Dos etapas

**A — Reproducción híbrida:** aprobar primero un lote en ejecución (terminal: bienvenida/acceso/POS; cliente: acceso/menú/personalización), temas y sistema visual con tokens/hex/roles, fuentes, escala y wireframe fiel. Una pantalla estándar hereda patrones pertinentes y sus propias fuentes originales, sin exigir captura previa individual aprobada. Login staff, caja/cobro/ticket/reimpresión, cuenta, registro, pantallas sin equivalente y cualquier diferencia de flujo requieren adaptación aprobada antes del código; un patrón nuevo/ambiguo también. Conservar lógica unificada y portar presentación selectivamente, sin resets inseguros. Al finalizar cada bloque presentar comparativas original/migrada de todas sus superficies y estados para aceptación.

**B — Refinamiento:** `frontend-design` puede mejorar alineación, coherencia, legibilidad, responsive y feedback, siempre dentro de la identidad. Presentar original/reproducción/propuesta y pedir aprobación. Si no hay aprobación, conservar la reproducción accesible. No mezclar una mejora opcional con una corrección obligatoria ni introducir pasos, decoraciones o datos ficticios.

## Puertas de aceptación

- Preparación (inventario/documentación/harness) se valida por su entrega, pruebas y revisión técnica, sin exigir lote previo ni aprobación de una UI no modificada. Las tareas de referencia producen el lote y obtienen su aprobación; la reproducción UI sí lo requiere antes del código.

- Referencia de tipo lote, heredada o adaptación previa con fuentes/commit, tema, viewport, rol/estado y fixture; sin tokens/QR reales ni datos personales. Heredar patrones no permite inventar composición original ni omitir comparativas de salida.
- Evidencia original/unificado comparable en los tamaños y estados acordados. No aceptar sólo código leído ni tests verdes como equivalencia visual.
- Pruebas funcionales, axe (incluido contraste indeterminado), teclado/foco, responsive y Electron según alcance; reportar omisiones/bloqueos.
- Revisión técnica y visual independientes; aceptación explícita del responsable para la pantalla.
- No actualizar baselines sin autorización. Falta de navegador, capturas o revisor implica pendiente, no aprobado.

## Cierre trazable

El plan debe definir registros/evidencia visual en `frontend/docs/specs/frontend-visual-migration/`. Mantener decisiones transversales en el registro existente de unificación, con IDs enlazados. No reescribir cierres de las tasks funcionales para atribuirles capturas nuevas.

No retirar originales, crear plan/tasks nuevos ni hacer commit por el mero hecho de cargar esta skill. Esas acciones requieren encargo y las aprobaciones SDD correspondientes.
