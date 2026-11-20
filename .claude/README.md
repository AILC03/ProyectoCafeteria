# Configuración de Claude Code

- Agentes del proyecto: `.claude/agents/*.md`. Invoca `frontend-sdd-coordinator` como agente principal (`claude --agent frontend-sdd-coordinator`) o pídele a Claude Code que lo use; los agentes `frontend-implementer`, `frontend-verifier`, `frontend-reviewer` y `frontend-spec-researcher` son especialistas delegables.
- Skills del proyecto: `.claude/skills/*/SKILL.md`. Puedes invocar `/frontend-sdd`, `/atomic-task-commit` y `/frontend-design` desde Claude Code.
- La fuente de verdad del trabajo es `frontend/docs/specs/frontend-unification/`: spec, plan, tasks, decisiones y estado. No mantengas una copia de esos documentos dentro de `.claude/`.
- Estos archivos están adaptados a Claude Code. La configuración de `.opencode/` es independiente: si se cambia el flujo de trabajo, revisa ambas variantes para no dejar instrucciones divergentes.

El revisor y el investigador sólo pueden leer mediante herramientas; el verificador tiene terminal para ejecutar comprobaciones, pero sus instrucciones prohíben editar. El implementador no hace commits: el coordinador realiza el cierre tras verificación y revisión.
