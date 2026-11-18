# 0009 — Seguridad web, imágenes y operación

- Estado: Aceptado
- Fecha: 2026-10-14
- Aprobación: explícita del responsable del backend tras revisar HTTPS, CORS, CSRF, límites, logs seguros, CI, bases separadas y respaldos.

## Contexto

Se necesitan límites de implementación y despliegue sin confundir documentación con configuración.

## Opciones consideradas

Orígenes abiertos; CORS por lista; imágenes locales o servicio externo.

## Decisión

CORS con origen exacto configurado, credenciales y sin comodín; verificar Origin y token CSRF en mutaciones autenticadas por cookie, incluidos login/logout; webhook Stripe exento de CSRF con firma propia. HTTPS en producción; frontend/API mismo sitio. Límite JSON 256 KiB y validación por ruta; cabeceras seguras; proxy confiable solo según despliegue. Logs estructurados con requestId y sin secretos/cuerpo de credenciales. Imágenes en Cloudinary según ADR 0010, con carga separada de JSON y sin descarga de URLs arbitrarias por backend. CI ejecuta instalación reproducible, tipos, lint, formato, pruebas/build y migraciones sobre BD aislada. Desarrollo/shadow/test separados. Respaldos diarios y adicionales antes de migraciones de producción; prueba de restauración previa a entrega.

## Imágenes resueltas en ADR 0010

El responsable eligió carga desde el panel administrador a Cloudinary si permite realizar el proyecto gratis. Se verificó el plan Free y la decisión se registra en ADR 0010. Esta decisión sustituye la propuesta anterior de URL manual sin carga. La configuración de cuenta y la implementación aún no están realizadas.

## Consecuencias

Hosting, dominio, SMTP y retención operativa requieren selección antes de producción. Cloudinary ya elegido; cuenta e implementación pendientes. La aprobación no configura CI, seguridad ni respaldos.

## Verificación

Probar CORS/CSRF, cookies, logs saneados, tamaño de entrada, origen rechazado y restauración. No afirmar seguridad implementada mientras solo exista health.

## Referencias

- [Reglas](../business-rules.md)
- [Cierre de planeación](../planning-readiness.md)
