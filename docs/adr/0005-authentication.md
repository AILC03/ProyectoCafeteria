# 0005 — Sesiones, credenciales y autorización

- Estado: Aceptado
- Fecha: 2026-10-14
- Aprobación: explícita del responsable del backend tras revisar JWT de 15 minutos, renovación con rotación, revocación inmediata, Argon2id y firma del backend.

## Contexto

NIP corto para clientes y contraseña para personal requieren controles y revocación.

## Opciones consideradas

JWT con refresh; sesión opaca en BD con cookie; sesión solo en memoria.

## Decisión

Elección aprobada: JWT de acceso transportado en cookie HttpOnly, Secure en producción, con renovación controlada mediante sesiones PostgreSQL. No usar la sesión opaca de la propuesta anterior como sustituto del JWT acordado. Token de renovación aleatorio con hash en BD, rotación y detección de reutilización; JWT con sid, sub, iat y exp, validación estricta de algoritmo/emisor/audiencia, sin datos personales. SameSite y CSRF conforme a ADR 0009.

Personal sin expiración por inactividad, con máximo absoluto de 8 horas desde el inicio de sesión; clientes recuerdan acceso hasta 30 días. La renovación no extiende esos límites absolutos. JWT de acceso de 15 minutos, con exp limitado también por el vencimiento absoluto de la sesión. Renovación transparente mientras la sesión siga vigente, incluso después de periodos sin solicitudes. Al cumplirse 8 horas, el personal debe iniciar sesión nuevamente; no cerrar automáticamente la sesión de caja.

Logout, baja, cambio/reset de credencial revocan sesiones. Para revocación inmediata, comprobar sesión vigente y permisos actuales en PostgreSQL en solicitudes protegidas: la firma del JWT por sí sola no basta. Rotación del refresh atómica. Coordinar renovaciones simultáneas del navegador y comprobar concurrencia en backend, sin convertir una carrera legítima en cierre accidental. La implementación y pruebas deben concretar el mecanismo antes de integrar autenticación.

Firmar JWT con clave secreta exclusiva del backend, fuera del código y de los logs. Aceptar únicamente el algoritmo configurado; validar firma, emisor, audiencia y vencimiento. No aceptar el algoritmo indicado por el token sin compararlo con la configuración. El algoritmo concreto, biblioteca y procedimiento de rotación de claves se documentarán al implementar; no se aprobaron dependencias adicionales en esta revisión.

Contraseñas del personal de 8 a 24 caracteres, sin truncar; NIP exactamente cuatro dígitos como texto. Cinco fallos por cuenta en 15 minutos implican bloqueo de 15 minutos, además de límite por IP. Argon2id con sal individual para NIP y contraseñas, nunca credenciales originales. Configuración base documentada: 19 MiB, dos iteraciones y paralelismo uno; calibrar en el entorno de despliegue. Contadores persistentes y respuestas genéricas. must_change_pin limita acceso a cambio obligatorio y logout.

ADMINISTRADOR tiene operaciones de CAJERO además de las administrativas. Solo responsable de sesión cobra y cierra; administrador puede cerrar excepcionalmente con motivo registrado. PREPARACION, CAJERO y ADMINISTRADOR pueden marcar órdenes EN_PREPARACION como LISTO; registrar actor y fecha. Ningún otro estado puede pasar a LISTO.

## Consecuencias

Cookies requieren CSRF y CORS definidos conforme a ADR 0009, aceptada posteriormente. El NIP tiene espacio reducido: hash no sustituye límites de intentos. Esta decisión no implica autenticación implementada ni configuración operativa de las medidas de ADR 0009. Ver cuestionario resuelto para evidencia de aprobación.

## Verificación

Probar ceros iniciales, sesión robada tras revocación, inactivo, bloqueo concurrente, cambio obligatorio y acceso entre roles. Comparación de credencial inválida sin revelar si la cuenta existe.

## Referencias

- [Reglas](../business-rules.md)
- [Cierre de planeación](../planning-readiness.md)

- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
