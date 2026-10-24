# 0011 — Precisiones de integridad, ticket y refresh

- Estado: Aceptado.
- Aprobación: explícita de Ángel el 2026-10-20, incluidos folios, ticket y refresh concurrente.
- Fecha: 2026-10-18.

## Contexto

ADRs previas fijan integridad y rotación de refresh, pero faltan mecanismos.
Esta propuesta cierra especificaciones C06, no implementa ni aprueba servicios.

## Decisión

1. Reservar ID identity y usar prefijos A/C/V con mínimo seis dígitos para
   folio/cliente/venta; permitir huecos y crecimiento, sin reinicio diario.
2. Ticket invitado: token aleatorio 32 bytes, SHA-256 en base, GET solo del
   comprobante pagado. Caducidad 24 h desde pago; reimprimir no consume token.
   Reemisión autorizada en caja revoca anteriores, sin extender plazo original.
   No es QR de registro ni permite estado/historial. Cache-Control no-store,
   tokens fuera de logs y sin filtración por referrer.
3. Refresh: cliente single-flight/Web Locks entre pestañas. Backend serializa
   por familia (advisory lock) y fila FOR UPDATE, verifica revocación y límite
   absoluto, crea sucesor y rota atómicamente. Petición perdedora con token
   rotado hace hasta 5 segundos recibe 409 REFRESH_ALREADY_ROTATED, sin
   Set-Cookie ni credenciales. Espera ganador y reintenta con cookie actual.
   Reuso posterior revoca familia. Logout/reset revocan sin tolerancia.
   Límites absolutos 8 h/30 días no se extienden.
4. Roles coherentes y lock de catálogo conforme a integrity-protocols.md.

## Alternativas y consecuencias

Revocar todo duplicado puede cerrar sesiones legítimas. Reentregar sucesor al
presentar viejo token facilita replay y exige conservar secretos recuperables.
Se propone 409 sin reentrega: atacante con token rotado no recibe sucesor,
pero detección de reuso se demora como máximo 5 segundos. Una respuesta perdida
puede requerir nuevo login. Compromiso aprobado por Ángel el 2026-10-20;
las pruebas de refresh se realizarán al implementar autenticación.

## Pruebas futuras

Dos refresh: un éxito, un 409 sin borrar cookie; viejo tras 5 s revoca; logout
impide renovación inmediata; límite absoluto fijo; familias independientes.
Ticket vencido/revocado y acceso a estado rechazados. Folios concurrentes únicos.

## Referencias

ADR 0005/0006; docs/database/integrity-protocols.md.
