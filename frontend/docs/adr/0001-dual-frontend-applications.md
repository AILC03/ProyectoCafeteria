# 0001 — Separación en dos aplicaciones frontend independientes

- Estado: Documentada sobre implementación existente
- Fecha: 2026-11-18
- Responsables: Enrique (frontend)

## Contexto

**Coffee's POS** atiende dos contextos operativos completamente distintos:
1. Autoservicio móvil/web para clientes (bajo peso, diseño *mobile-first*, rutas web, PWA instalable).
2. Terminal de punto de venta (POS), cocina (KDS) y administración para empleados (optimizada para pantallas táctiles/tablets, impresión térmica `window.print()`, respuesta sonora Web Audio y empaquetado de escritorio con Electron).

Además, según [ADR 0013 del backend](../../../backend/docs/adr/0013-application-repository-layout.md), el repositorio común mantiene proyectos desacoplados sin mezclar manifiestos ni `node_modules`.

## Opciones consideradas

- **SPA monolítica única** con rutas `/cliente` y `/pos`: incrementaría el tamaño del bundle móvil con código de administración, Electron e impresión térmica.
- **Dos aplicaciones independientes** en `frontend/clientes/` y `frontend/empleados/`: aísla dependencias, puertos de desarrollo (`5173` y `5174`), estilos y ciclos de compilación.

## Decisión

Mantener dos aplicaciones separadas:
- `frontend/clientes/` (`taffy`): React 19, TypeScript, Vite 8, Tailwind CSS, React Router DOM 7 y Service Worker PWA, ejecutándose en el puerto `5173`.
- `frontend/empleados/` (`coffees-pos`): React 19, JavaScript (JSX), Vite 8 (`base: './'`), Vanilla CSS con temas personalizables y Electron 44, ejecutándose en el puerto `5174`.

## Consecuencias

- Ambas aplicaciones mantienen su propio cliente HTTP (`src/api/client.ts` y `src/api/client.js`) y utilidades monetarias (`money.ts` y `money.js`).
- Los contratos con el backend deben mantenerse sincronizados manualmente en ambas carpetas contra [OpenAPI 0.11.0](../../../backend/docs/api/openapi.yaml).
- En desarrollo local ambos servidores usan un proxy Vite hacia `http://localhost:3000`.

## Verificación

Comprobar que `frontend/clientes/package.json` y `frontend/empleados/package.json` instalan y compilan de forma independiente y que `iniciar.bat` levanta ambas interfaces en `:5173` y `:5174`.

## Referencias

- [Arquitectura del frontend](../architecture.md)
- [ADR 0013 del backend](../../../backend/docs/adr/0013-application-repository-layout.md)
