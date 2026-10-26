# 0012 — Implementación segura de auth y administración

- Estado: Propuesto para revisión técnica; implementado localmente por encargo de corrección de Ángel.
- Fecha: 2026-10-25.
- No sustituye plazos, roles ni reglas aceptadas de ADR 0005/0009/0010/0011.

## Contexto

El PR integrado implementaba Bearer de 8 h, bcrypt, registro abierto y clave de
respaldo. Se corrige hacia el contrato delegado; no se conserva compatibilidad
con ese flujo inseguro ni se modifica la contraseña Argon2id del administrador.

## Precisiones implementadas

- jsonwebtoken 9 con HS256, allowlist única, issuer/audience y claims sub/sid/iat/exp
  obligatorios. Claves independientes aleatorias, 32 bytes representados en hex;
  ninguna clave por defecto ni secreto leído al importar módulos.
- Cookies HttpOnly, Path=/, host-only, SameSite=Lax; Secure y prefijo __Host- en
  producción. Variables AUTH_* nuevas; JWT_SECRET legado se ignora.
- JWT de acceso <=15 min; refresh aleatorio con SHA-256 en BD, sin extensión de
  8 h/30 días. Logout revoca familia actual; cambio de credencial revoca todas.
- Una fila rotada conserva acceso de JWT ya emitidos hasta exp si no está
  revocada; el refresh antiguo no vuelve a emitir credenciales. La ventana 409
  de 5 segundos aprobada no perdona revocación ni vencimiento absoluto.
- Locks por usuario/familia y contadores persistentes con HMAC, sin guardar IP ni
  identificador original. Login y verificación de credencial actual comparten
  bloqueo de cuenta 5 fallos/15 min. IP: 20 intentos/minuto, configurable 1–100.
- CSRF double-submit firmado, cookie HttpOnly y copia por JSON/cabecera, nonce
  y contexto prelogin/familia (HMAC, no UUID público); TTL 1 h y Origin exacto.
- Límites adicionales de administración: hasta 50 grupos, 100 valores/grupo;
  IDs y centavos como strings y máximo individual 9999900 centavos.
- Grupos con valores/asignaciones no cambian pricing_scope: 409 y grupo nuevo.
  PUT de configuración reemplaza solo relaciones sin referencias históricas.
- Cloudinary: intent propio de 10 minutos y public_id aleatorio, validación por
  API autenticada, CAS public_id+version (version por sí sola puede coincidir).
  JPEG/PNG/WebP <=5 MiB, dimensión 1–8192 px y área <=40 MP como límite técnico.
- Limpieza durable vía jobs, lease y reintentos. Espera mínima de dos horas
  desde autorización incluso para imagen reemplazada, para evitar reupload con
  firma todavía válida. Dispatcher local explícito; no servicio daemon automático.

## Consecuencias y límites

En desarrollo sin claves auth devuelve 503 y no habilita administración; en
producción ausencia de claves u origen no HTTPS impide iniciar servidor.
Cloudinary sin credenciales devuelve 503 solo en las rutas de imagen.
Las cargas se validan antes de asociar; configurar también límites en un preset
del proveedor para limitar consumo durante la carga directa, no solo finalizar.
Conservar alertas de cuota Free; no activar planes de pago.

Falta prueba real del proveedor con la cuenta del equipo y revisión frontend
de cookies/CSRF, límites técnicos y 409 de refresh. No hay registro por ticket,
recuperación de acceso ni CRUD de empleados implementados por esta corrección.

## Verificación

Unitarias/HTTP, PostgreSQL 17 aislado, carreras refresh/imagen, bloqueo persistente,
roles, revocación, snapshots y contrato OpenAPI. Proveedor de imágenes simulado;
no afirmar que mocks verifican red, credenciales ni cuota Cloudinary.
