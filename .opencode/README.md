# Agentes del proyecto — Dashboard DA-001

## Uso

Selecciona `dashboard-sdd-coordinator` como agente principal para DA-001. No se cambia el agente predeterminado de otras sesiones. Ejemplo: «Ejecuta TASK-DA-E1-00 usando el flujo dashboard-sdd». Seleccionar el agente no inicia tareas por sí solo.

El coordinador usa `dashboard-researcher`, `dashboard-backend-implementer`, `frontend-implementer`, `dashboard-verifier` y `dashboard-reviewer`. Los subagentes reciben una tarea delimitada; implementadores no hacen commits y verificador/revisor no corrigen código. Los agentes de unificación permanecen disponibles para su proceso original.

## Permisos sin prompts rutinarios

`.opencode/opencode.json` permite lecturas, ediciones y shell del proyecto sin preguntar por operación. Los subagentes de investigación/revisión/verificación mantienen permisos más estrechos, sin prompts para sus comprobaciones permitidas. Skills y delegaciones frontend/dashboard están permitidas.

Se deniegan patrones de Git destructivo/publicación, borrado por shell, migraciones/seed/configuración de cuentas y lectura/edición directa de entornos privados. El directorio temporal de OpenCode está permitido; otras rutas externas están bloqueadas. Usar ejemplos públicos, no secretos reales. Instalar dependencias o ejecutar scripts sigue requiriendo estar dentro del alcance aprobado; nunca `audit fix` automático.

**Esto no es un sandbox:** shell se ejecuta con los privilegios del usuario. Sus reglas por comandos son defensa parcial, no garantizan detectar todo borrado, secreto, despliegue o escritura indirecta. Los agentes no deben eludir denegaciones mediante intérpretes, comandos equivalentes ni subagentes. Scripts npm permitidos se inspeccionan antes de ejecutar. Para aislamiento real se requiere un entorno separado.

No se cambió configuración global ni políticas de administración. Reglas superiores pueden seguir bloquear o solicitar permisos; estas definiciones no pueden anularlas. El modo Plan tampoco se convierte en modo edición por esta configuración.

La configuración se recarga al guardar. Si la interfaz no muestra los agentes nuevos, usa `/reload` y selecciona el coordinador; no es necesario reiniciar el servicio. La sesión activa puede conservar su agente anterior.

## Aprobaciones que permanecen

Una tarea seleccionada autoriza sus archivos/comandos normales, sin preguntas repetidas. Se mantienen aprobación de contrato y nuevas decisiones, límites de tarea y entorno de prueba autorizado. No se inicia E1 ni se concede aprobación de DTO al configurar agentes. Sin autorización explícita no se hace commit/push/despliegue ni se cambian bases reales.

Referencias V2 utilizadas: https://opencode.ai/v2/docs/config, https://opencode.ai/v2/docs/permissions, https://opencode.ai/v2/docs/agents y https://opencode.ai/v2/docs/skills.
