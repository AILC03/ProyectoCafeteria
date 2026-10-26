# Flujo de desarrollo del backend

Objetivo: que cada contribución, humana o asistida por IA, respete las mismas
decisiones y demuestre los requisitos antes de integrarse. No sustituye revisión
humana ni convierte documentación en una garantía automática de cumplimiento.

## 1. Descubrir y verificar fuentes

Antes de editar, revisar rama y `git status --short`; identificar trabajo existente.
No cambiar de rama ni limpiar el árbol si afecta cambios pendientes. Trabajar en
rama corta desde `dev` cuando el árbol y el responsable permitan hacerlo; `main`
queda estable y recibe promoción revisada. No hacer push/merge automáticamente.

Lecturas mínimas: [AGENTS.md](../../AGENTS.md), [convenciones](../development-guide.md),
[arquitectura](../architecture.md), [reglas](../business-rules.md),
[permisos](../permissions.md), [ADR](../adr/README.md),
[OpenAPI](../api/openapi.yaml) y la delegación/issue del encargo, si existe.
Leer además los módulos y pruebas vecinos antes de proponer una estructura nueva.

Distinguir fuentes:

- Reglas, permisos y ADR **aceptados** establecen las decisiones aprobadas.
- OpenAPI establece el contrato; debe concordar con esas decisiones.
- El encargo delimita alcance, no autoriza incumplir seguridad silenciosamente.
- Código y pruebas muestran lo implementado/verificado, no aprueban decisiones.
- Estado actual: [auth/admin](../auth-admin-implementation.md) y encabezado de
  [contexto](../PROJECT-CONTEXT.md). Las secciones históricas no son pendientes actuales.
- ADR 0012 contiene precisiones implementadas, pero sigue **propuesto** para revisión.

Si las fuentes se contradicen, señalar archivos/secciones, impacto y alternativas;
resolver con Ángel (backend) y coordinar contrato con Enrique. No escoger por
conveniencia ni convertir un supuesto en aprobación.

**Salida:** resumen de entendimiento y dudas relevantes.

## 2. Acordar una tarea verificable

Copiar [task-template.md](task-template.md) en una issue, el encargo o
`docs/tasks/<id>-<nombre>.md`. No crear documentos de tarea vacíos por rutina.
Definir responsable/revisor, alcance, exclusiones, fuentes, criterios numerados,
riesgos y matriz requisito → código → prueba. Incluir restricciones negativas:
qué no debe poder hacer un invitado, rol incorrecto o entrada manipulada.

La IA devuelve un plan breve antes de editar; en tareas claras puede continuar
dentro del encargo, sin pedir aprobación por cada archivo. Bloquea únicamente
decisiones ambiguas o cambios de negocio, seguridad, arquitectura, dependencias
y operaciones destructivas no autorizadas. Registrar aprobación explícita;
no marcar un ADR como aceptado por iniciativa de la IA.

**Salida:** alcance comprobable y decisiones pendientes identificadas.

## 3. Diseñar contrato y pruebas primero

Para HTTP: definir en OpenAPI método/ruta, cookies/CSRF, roles, entrada estricta,
DTO, errores y ejemplos. Coordinar incompatibilidades con frontend antes de implementarlas.
Para BD: revisar esquema y SQL existente, constraints, índices, transacciones,
locks, idempotencia y efectos en históricos. Migración nueva, nunca editar una aplicada.
Planear fallos, carreras, reintentos y recuperación, no solo el caso feliz.
Proponer ADR si cambia una decisión; no implementar su parte incompatible hasta resolución.

**Salida:** contrato y escenarios vinculados a cada criterio.

## 4. Implementar sin desvíos

Seguir los patrones del módulo: rutas/controlador para HTTP, servicio para reglas,
repositorio para persistencia; reutilizar configuración, errores y middleware común.
Validar datos y permisos en backend; DTO explícito sin secretos ni hacks globales.
No crear conexiones al importar módulos ni claves de respaldo. Mantener pruebas
inyectables y efectos externos fuera de transacciones cuando corresponda.

Hacer cambios pequeños dentro del alcance; no refactorizar áreas ajenas ni corregir
dependencias indiscriminadamente. Si surge un requisito nuevo, registrarlo y
consultar antes de ampliar el encargo. Mocks no demuestran que un proveedor real funcione.

## 5. Verificar y revisar

Node 22 (>=22.13 y <23), `npm ci` y variables locales según `.env.example`.
Nunca copiar/imprimir `.env` ni sustituir secretos para ejecutar verificaciones.

| Cuándo                                    | Comprobaciones obligatorias                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| Todo PR                                   | `npm run format:check`, revisar diff y enlaces/documentos afectados              |
| Código, configuración o dependencias      | `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`                 |
| HTTP/contrato                             | `npm run api:validate`; pruebas HTTP de entradas, DTO, errores y permisos        |
| Persistencia, auth, catálogo o integridad | `npm run db:validate`, `npm run test:integration`, `npm run db:verify`           |
| Dependencias                              | Revisar lockfile, justificar cambios y ejecutar `npm audit`; no usar fix --force |
| Proveedor externo                         | Pruebas simuladas de fallo y prueba real autorizada; separar ambas evidencias    |

CI ejecuta todos los checks de código/contrato/BD en cada PR, incluso documental.
Las pruebas de BD requieren PostgreSQL 17 local, `TEST_DATABASE_URL` con base
`cafeteria_test` y permiso CREATEDB. Los runners crean y eliminan solo sus propias
bases temporales; no apuntar a desarrollo/producción ni ejecutar reset.
`npm test` por sí solo omite integraciones: anotar los omitidos, no sumarlos como aprobados.

Cubrir según impacto: éxito, datos inválidos/campos extra, 401/403 por rol, CSRF,
estado inactivo/revocado, rollback, límites, concurrencia, idempotencia e históricos.
No alterar una prueba para validar una desviación del requisito aprobado.

Revisar `git diff`, `git diff --check` y archivos nuevos: alcance, secretos,
migraciones previas intactas y evidencia por criterio. Actualizar estado y guías
sin borrar evidencia histórica ni presentar tareas pendientes como resueltas.
Si no hay entorno o credenciales, informar **no ejecutado/bloqueado**, causa e impacto.

## 6. Entregar y obtener revisión

Usar la [plantilla de PR](../../.github/pull_request_template.md). Entregar:
resumen, criterios con evidencia, comandos realmente ejecutados, fallos/omitidos,
impacto en API/BD, instrucciones operativas y pendientes. Diferenciar siempre:
**propuesto**, **aprobado**, **implementado**, **verificado** y **pendiente**.
No declarar listo para producción por pasar mocks ni por existir un archivo CI.

El revisor compara el diff y pruebas contra la tarea y las fuentes, no solo el
resumen de la IA. No integrar si falta un criterio obligatorio, se cambió seguridad
sin aprobación o una verificación necesaria está bloqueada. Documentar aceptación
explícita del responsable para pendientes realmente fuera del alcance.

### Configuración manual de GitHub

Se incluye `.github/workflows/backend-ci.yml`, sin usar secretos reales. Solo se
ejecutará al publicarse y habilitar Actions. Después de una primera ejecución:

1. Proteger `dev` y `main` con rulesets/branch protection según el plan de GitHub.
2. Exigir PR, al menos una aprobación ajena al autor y resolución de conversaciones.
3. Invalidar aprobaciones si hay cambios nuevos y exigir el check `Backend checks`.
4. Restringir push directo, force push y borrado; evitar bypass habitual.

Estas protecciones **no están activadas** por crear este documento. CI detecta
fallos automatizables, pero no decide por sí sola si el negocio o alcance son correctos.

## Encargo reutilizable para cualquier IA

> Lee AGENTS.md y docs/workflow/README.md antes de modificar este backend.
> La tarea es: [objetivo y criterios]. Respeta las decisiones aceptadas y cambios
> existentes. Presenta alcance, fuentes y plan; pregunta por contradicciones.
> Implementa únicamente lo autorizado y entrega matriz de cumplimiento con
> pruebas realmente ejecutadas, omitidos y pendientes. No hagas push ni merge.
