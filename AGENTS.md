# Instrucciones para desarrollar este backend con IA

Este archivo es el punto de entrada para cualquier asistente. Antes de editar,
lee y sigue [el flujo obligatorio](docs/workflow/README.md). Si tu herramienta
no descubre AGENTS.md automáticamente, el responsable debe adjuntarlo al encargo.
Estas instrucciones aplican a todo el repositorio; no autorizan trabajar en frontend.

## Antes de escribir código

1. Lee `git status --short` y conserva cambios ajenos o de tareas anteriores.
2. Lee el flujo, `docs/development-guide.md`, `docs/architecture.md`, las reglas
   de negocio, permisos, ADR y contrato relevantes al encargo.
3. Resume alcance, exclusiones y criterios verificables usando la plantilla de tarea.
   Relaciona cada requisito con su fuente, implementación prevista y prueba.
4. Si hay contradicciones, decisiones pendientes o cambios de seguridad/negocio,
   pide resolución al responsable antes de implementar la parte afectada.
   Un ADR propuesto no equivale a una decisión aceptada.

## Límites que no se negocian silenciosamente

- No reemplazar el diseño aprobado por ejemplos genéricos o preferencias de la IA.
- No agregar endpoints, dependencias, roles ni flujos fuera del encargo sin aprobación.
- No abrir registro público ni agregar bcrypt, Bearer legado o secretos por defecto.
  Respetar Argon2id, cookies, sesiones persistentes, CSRF y permisos del contrato.
- No cambiar contraseñas existentes, leer/imprimir secretos ni versionar `.env`.
- No reescribir migraciones aplicadas, resetear bases ni probar contra datos reales.
- No modificar snapshots históricos; dinero en centavos enteros e IDs sin pérdida
  de precisión. Respetar transacciones, idempotencia y locks aprobados.
- No descartar trabajo existente, hacer commit/push/merge o desplegar sin encargo.
- No desactivar pruebas, lint, validadores ni controles de seguridad para hacer pasar CI.

## Para entregar

Implementa contrato, validación, permisos, reglas, persistencia, pruebas y
documentación como una sola unidad. Ejecuta la matriz del flujo y revisa el diff.
No declares terminado con solo compilación, endpoints felices o pruebas simuladas.
`npm test` omite integraciones de BD: no sustituye `npm run test:integration`.
Reporta criterios cumplidos, evidencia ejecutada y pendientes reales; no inventes
resultados ni presentes configuración local como infraestructura remota activa.
La revisión y autorización de integración corresponden a una persona del equipo.
