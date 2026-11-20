# Copilot: agentes y skills del frontend unificado

Los perfiles del proyecto están en `.github/agents/*.agent.md` y las skills en `.github/skills/*/SKILL.md`. Selecciona `frontend-sdd-coordinator` para continuar las tasks; el coordinador debe delegar implementación, verificación y revisión independiente. La skill `frontend-design` sólo aplica a trabajo visual autorizado.

La fuente de verdad es `frontend/docs/specs/frontend-unification/`: spec, plan, tasks, decisiones y registro de cierres. Consulta el registro antes de proponer una task nueva.

Copilot cloud usa la configuración de la **rama disponible en GitHub**; estos archivos locales deben estar en un commit y en una rama accesible antes de poder seleccionarlos allí. La disponibilidad de delegación y los comandos varía entre IDE, CLI y cloud. Si no hay agentes independientes disponibles, no declares una task revisada.

`.opencode/` y `.claude/` son configuraciones separadas. Si cambian los procedimientos, sincroniza las tres variantes deliberadamente; no copies frontmatter de un producto a otro sin adaptarlo.
