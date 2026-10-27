# Operaciones del contrato por completar

## Estado vigente — 2026-10-26

Contrato OpenAPI 0.4.0 con auth/admin, catálogo y primera entrega orders
implementados en `dev`. Incluye creación pendiente móvil/caja, consulta protegida, preparación/LISTO y búsqueda/asociación
mínima de cliente; no pagos ni worker. [Detalle](../orders-implementation.md).
Las notas inferiores describen etapas históricas, no pendientes vigentes.

### Historial — 2026-10-21 y entrega inicial

Actualización 2026-10-21: health y las cuatro operaciones de catálogo de lectura
ya están implementadas/probadas. OpenAPI 0.2.0 es el contrato vigente. Las
operaciones de escritura, auth y demás módulos siguen pendientes. La descripción
inferior de la entrega de Leonel se conserva como historial de revisión.

En la entrega inicial solo GET /api/v1/health estaba implementado. openapi.yaml
incorporaba además cuatro
lecturas del catálogo recibidas de Leonel, todavía sin implementación. Contrato
y ejemplos validados en revisión; ajustes pendientes en
[lista de correcciones](../database/correcciones-pendientes.md).
La tabla siguiente es planificación; no representa endpoints disponibles.
Convenciones aceptadas en ADR 0006; el contrato de negocio aún no está completo.
Validar esquemas y casos de error por operación.

| Módulo    | Operaciones a especificar                                                          | Criterios                                        |
| --------- | ---------------------------------------------------------------------------------- | ------------------------------------------------ |
| auth      | Recuperación por correo y reset administrativo; login/sesión/cambio ya disponibles | AC-16/17                                         |
| catalog   | Cloudinary real; lecturas y CRUD administrativo ya disponibles                     | ADR 0010: JPEG/PNG/WebP, una por producto, 5 MiB |
| orders    | Expiración automática e historial; crear/consultar/asociar/LISTO ya disponibles    | AC-01/02/10                                      |
| payments  | Crear/reutilizar Checkout; cobrar efectivo; webhook con cuerpo raw                 | AC-03/05/07/08/09                                |
| cash      | Abrir, consultar actual, resumen y cerrar                                          | AC-04; responsable y cierre excepcional auditado |
| customers | Buscar cliente para caja, consumir token ticket, perfil/historial                  | AC-11/12/13/14                                   |
| customers | Favoritos y repetir selección con catálogo actual                                  | AC-19/21                                         |
| tickets   | Ticket de venta, acceso digital limitado a comprobante de invitado                 | Sin exponer estado/historial de invitados        |

Para cada operación: rol y propiedad, body/query/path, campos obligatorios y límites,
respuesta/códigos/ejemplos, idempotencia, regla y prueba. El ticket digital de invitado
necesita un permiso opaco de alcance limitado: no utilizar folio público ni QR de cobro
como autorización. Especificar token de acceso al ticket en el diseño físico antes de implementarlo.

Secuencia vigente: especificar caja/efectivo y su contrato; después tickets y
registro, recuperación/worker y Stripe según dependencias.

Las reglas ya aceptadas deben figurar en cada operación: JWT cookie/CSRF,
roles y propiedad, LISTO por preparación/cajero/admin, responsable de caja,
recibido/cambio, límites de pedidos e Idempotency-Key para crear/cobrar efectivo.
Coordinar esquema con Leonel y entradas/respuestas con Enrique.
