# Guía de desarrollo

Punto de entrada para IA: [AGENTS.md](../AGENTS.md).
Proceso obligatorio: [flujo y plantillas](workflow/README.md).

## Convenciones iniciales

- Código y nombres técnicos en inglés; documentación e interfaz en español.
- TypeScript ya configurado con `strict: true`.
- Variables/funciones: `camelCase`; tipos/clases: `PascalCase`.
- Tablas/columnas: `snake_case`.
- Evitar `any`; justificar excepciones.
- Dinero en centavos enteros; fechas en UTC.
- Validar entradas y permisos en backend, no confiar en frontend.
- Nunca registrar contraseñas, NIP, tokens originales ni claves secretas.

## Herramientas configuradas

Prettier, ESLint y TypeScript ya están configurados. Node 22 (mínimo 22.13),
npm y package-lock.json según ADR 0002. Comprobaciones: npm run typecheck,
npm run lint, npm run format:check, npm test y npm run build.

## API

Definir primero cada endpoint en `api/openapi.yaml`: acceso, entradas,
respuesta, errores y ejemplos. No alterar respuestas sin coordinar frontend.
Convenciones aceptadas en ADR 0006; completar cada operación conforme a
[plan del contrato](api/contract-plan.md) y aprobar antes de implementarla.

## Integridad

- Usar consultas parametrizadas o APIs seguras del ORM.
- Operaciones sensibles requieren transacciones e idempotencia.
- No usar un doble clic ni controles visuales como garantía de exclusión.
- No modificar históricos para reflejar precios nuevos.
- Nuevas decisiones de arquitectura se registran en ADR.

## Responsabilidades y estado

Coordinar esquema/migraciones con Leonel, revisando ADR y criterios de aceptación;
coordinar contrato con Enrique.
ADR 0001–0012 aceptadas; Ángel aceptó explícitamente ADR 0012 el 2026-10-26.
Cloudinary continúa simulado, también en CI; no se autoriza configurar el proveedor real.
Modelo físico, catálogo y
auth/admin implementados; consultar [estado vigente y límites](auth-admin-implementation.md).
No asumir que órdenes, pagos o cualquier otro módulo estén terminados.
No mezclar aprobaciones documentales con pruebas ejecutadas o infraestructura
configurada. Implementar únicamente después de definir contrato del módulo.
