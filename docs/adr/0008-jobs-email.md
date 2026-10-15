# 0008 — Trabajos durables, correo y tokens

- Estado: Aceptado
- Fecha: 2026-10-14
- Aprobación: explícita del responsable del backend tras revisar tareas persistentes PostgreSQL, worker separado, reintentos, concurrencia, correo de pruebas y protección de tokens.

## Contexto

Expiración, correo y reembolsos deben sobrevivir reinicios sin Redis adicional.

## Opciones consideradas

Timers en memoria; cola Redis; trabajos persistentes PostgreSQL.

## Decisión

Worker separado del proceso HTTP usando PostgreSQL: jobs con status, available_at, attempts, locked_until, dedupe_key y last_error saneado. Reclamar lotes con bloqueo SKIP LOCKED y lease; reintentos con backoff, liberar tras caída y revisión manual al agotar intentos. Outbox transaccional para correo/reembolso; operaciones externas idempotentes cuando proveedor lo permita. SMTP mediante adaptador, sin proveedor comercial elegido. Desarrollo con buzón local; producción exige proveedor configurado y prueba de envío. Verificar recovery_email con enlace de un uso de 30 minutos; no habilitar recuperación hasta verificar. Cambiar correo conserva el anterior verificado hasta confirmar el nuevo y revoca tokens previos al aplicar cambio. Tokens aleatorios 32 bytes, hash SHA-256; registro 24 h desde pago, recuperación/verificación 30 min. Entrega del secreto por outbox cifrada, clave fuera de BD, borrado del payload tras envío/expiración; nunca logs. El hash solo no permite reenviar un enlace original.

## Consecuencias

Añade tablas jobs/outbox y email_verification_tokens. Buzón SMTP de pruebas y clave de cifrado se configuran al implementar correo; proveedor real, dominio y remitente antes del despliegue. No bloquean catálogo. No prometer entrega exactamente una vez de SMTP. Los bloqueos/leases coordinan trabajadores, pero las operaciones siguen necesitando idempotencia ante caída o vencimiento de un lease. La aprobación no implica worker, correo ni migraciones implementados.

## Verificación

Reinicio no pierde trabajo; dos workers no ejecutan simultáneamente el mismo lease. Correo duplicado no permite reutilizar token; payload cifrado no aparece en logs ni se conserva indefinidamente.

## Referencias

- [Reglas](../business-rules.md)
- [Cierre de planeación](../planning-readiness.md)
