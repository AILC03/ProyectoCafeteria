# Registro de decisiones arquitectónicas del frontend (ADR)

Este directorio registra las decisiones técnicas adoptadas en el diseño e implementación de las
aplicaciones frontend (`frontend/clientes/` y `frontend/empleados/`), complementando los
[ADR del backend](../../../backend/docs/adr/README.md).

Crear `NNNN-titulo-corto.md` usando [la plantilla](template.md). Estados posibles: `Propuesto`,
`Aceptado`, `Rechazado`, `Reemplazado`.

## ADR registrados

- [0001 — Separación en dos aplicaciones frontend independientes](0001-dual-frontend-applications.md): Implementada (clientes TS/Tailwind y empleados JSX/Electron).
- [0002 — Cliente HTTP con cookies HttpOnly, CSRF en memoria y Problem Details](0002-http-client-csrf-cookies.md): Implementada (con mejoras pendientes de refresh).
- [0003 — Respaldo local, PWA móvil y Electron en modo Venta Rápida](0003-local-fallback-pwa-electron.md): Implementada (con saneamiento pendiente de secretos en `localStorage`).
