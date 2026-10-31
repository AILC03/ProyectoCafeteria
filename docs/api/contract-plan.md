# Operaciones del contrato por completar

Entrega local CASH-01/02 — 2026-10-27: caja, cobro CASH por ID, venta y ticket
protegido. [Alcance](../cash-implementation.md). AUTH-02 local — 2026-10-31 añade el
registro de cliente exclusivamente con QR de ese ticket pagado, sin sesión automática.
El contrato vigente es OpenAPI 0.6.0; QR de cobro, ticket digital público, Stripe y
worker siguen pendientes. Rutas anteriores conservadas; LISTO CASH comprueba
pago/venta coherentes.

## Estado de entregas locales — 2026-10-31

OpenAPI 0.6.0 contiene auth/admin, catálogo, órdenes, caja/efectivo, ticket protegido y
registro QR de invitado. Las entregas CASH y AUTH-02 están implementadas y verificadas
localmente, pendientes de revisión humana/integración; Stripe, worker, QR de cobro,
ticket digital público, recuperación y perfil/historial continúan pendientes.
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
| payments  | Crear/reutilizar Checkout y webhook con cuerpo raw; efectivo ya disponible         | AC-03/05/07/08/09                                |
| cash      | Caja y cierre ya disponibles; revisar/integrar entrega local                       | AC-04; responsable y cierre excepcional auditado |
| customers | Perfil/historial; búsqueda y consumo de token ticket ya disponibles                | AC-11/12/13/14                                   |
| customers | Favoritos y repetir selección con catálogo actual                                  | AC-19/21                                         |
| tickets   | Ticket de venta, acceso digital limitado a comprobante de invitado                 | Sin exponer estado/historial de invitados        |

Para cada operación: rol y propiedad, body/query/path, campos obligatorios y límites,
respuesta/códigos/ejemplos, idempotencia, regla y prueba. El ticket digital de invitado
necesita un permiso opaco de alcance limitado: no utilizar folio público ni QR de cobro
como autorización. Especificar token de acceso al ticket en el diseño físico antes de implementarlo.

Secuencia vigente: preparar operaciones de preparación/perfil/ticket digital; construir
worker y correo antes de recuperación, y Stripe según sus dependencias.

Las reglas ya aceptadas deben figurar en cada operación: JWT cookie/CSRF,
roles y propiedad, LISTO por preparación/cajero/admin, responsable de caja,
recibido/cambio, límites de pedidos e Idempotency-Key para crear/cobrar efectivo.
Coordinar esquema con Leonel y entradas/respuestas con Enrique.
