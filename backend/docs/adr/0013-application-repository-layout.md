# 0013 — Organización del repositorio de aplicaciones

- Estado: Aceptado explícitamente por Ángel el 2026-11-16.
- Fecha: 2026-11-16.
- Responsables: Ángel (backend).
- Reemplaza la decisión de mantener frontend y backend en repositorios separados.

## Contexto

Las dos aplicaciones frontend y el backend necesitan una estructura común de
repositorio, sin combinar sus dependencias ni sus comandos de desarrollo.
GitHub Actions requiere que los workflows permanezcan en `.github/workflows/`
en la raíz del repositorio.

## Opciones consideradas

- Mantener frontend y backend en repositorios separados: conserva la distribución
  previa, pero no permite la estructura solicitada.
- Reunir backend y las aplicaciones frontend en un monorepositorio con carpetas
  independientes: centraliza el código y conserva límites por aplicación.

## Decisión

El repositorio Git contiene `backend/` y `frontend/`. El backend conserva su
estructura, manifiestos, dependencias y comandos en `backend/`. Las aplicaciones
se mantienen separadas en `frontend/clientes/` y `frontend/empleados/`, cada una
con sus propios manifiestos y dependencias. `.git` y `.github/` permanecen en la
raíz; el workflow configura su directorio de trabajo en `backend/`.

## Consecuencias

- Los comandos de Node del backend deben ejecutarse desde `backend/`.
- El workflow de CI y el lanzador local deben usar las nuevas rutas.
- El contrato HTTP/OpenAPI entre aplicaciones se mantiene; no se mezclan
  dependencias ni se cambia el comportamiento de las aplicaciones.
- Las herramientas locales de Git y los editores usan la raíz común como
  workspace.

## Verificación

Comprobar que backend y ambas aplicaciones conservan sus manifiestos y archivos,
que los comandos del workflow apuntan a `backend/`, y que el lanzador inicia
ambas aplicaciones en sus nuevas rutas. Ejecutar las comprobaciones del backend
desde `backend/`.

## Referencias

- Aprobación explícita de Ángel en la solicitud del 2026-11-16.
- [Arquitectura](../architecture.md).
- [Workflow de CI](../../../.github/workflows/backend-ci.yml).
