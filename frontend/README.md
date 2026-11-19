# Frontend — Coffee's POS

Este directorio contiene las dos aplicaciones web de Coffee's POS. Ambas son proyectos independientes: instale sus dependencias y ejecute sus comandos desde la carpeta de cada una.

| Aplicación | Directorio | Público | Puerto de desarrollo |
| --- | --- | --- | --- |
| Clientes | [`clientes/`](./clientes) | Clientes de la cafetería | `5173` |
| Terminal POS | [`empleados/`](./empleados) | Personal, caja y administración | `5174` |

## Requisitos

- Node.js 22 o superior recomendado (el backend requiere Node.js 22.13 o superior).
- API del proyecto disponible en `http://localhost:3000` para las funciones que requieren persistencia.

## Ejecución local

En terminales separadas, inicie primero la API desde `backend/` y después cada interfaz que necesite:

```bash
# backend/
npm ci
npm run dev
```

```bash
# frontend/clientes/
npm install
npm run dev
```

```bash
# frontend/empleados/
npm install
npm run dev
```

Vite reenvía las solicitudes que comienzan con `/api` a `http://localhost:3000`; los clientes HTTP de ambas aplicaciones usan la base `/api/v1`, cookies HttpOnly y token CSRF para las operaciones mutables.

## Comandos comunes

| Objetivo | Clientes | Empleados |
| --- | --- | --- |
| Desarrollo | `npm run dev` | `npm run dev` |
| Compilación | `npm run build` | `npm run build` |
| Vista previa | `npm run preview` | `npm run preview` |
| Calidad | `npm run lint` | — |

Consulte los README de cada aplicación para sus rutas, flujos y comandos específicos.

## Documentación

La documentación técnica completa del frontend (arquitectura, estado real frente a OpenAPI 0.11.0, guías por módulo, brechas detectadas, diccionario de almacenamiento y backlog) está disponible en [`docs/`](./docs/README.md):

- [Índice reconciliado y estado actual](./docs/README.md)
- [Contexto del proyecto y equipo](./docs/PROJECT-CONTEXT.md)
- [Arquitectura dual (Clientes PWA + POS Electron)](./docs/architecture.md)
- [Cobertura de endpoints OpenAPI 0.11.0](./docs/api/endpoints-coverage.md)
- [Integración técnica con backend](./docs/backend-integration.md)
- [Auditoría de brechas (FE-GAP-01)](./docs/tasks/FE-GAP-01-integration-audit.md)
- [Backlog y trabajo pendiente](./docs/development-tasks.md)
- [Arranque local, PWA y Electron](./docs/local-setup.md)

## Estructura

```text
frontend/
├── clientes/    # Portal de autoservicio para clientes (React + TypeScript)
├── empleados/   # Terminal POS y administración (React + JavaScript + Electron)
└── docs/        # Documentación técnica, ADRs, cobertura de API y backlog
```

## Alcance de datos

La API es la fuente de datos cuando está disponible. Algunas pantallas conservan datos y preferencias locales como respaldo para experiencia de terminal o demostración; estos datos no sustituyen la persistencia del backend ni deben considerarse sincronizados automáticamente.
