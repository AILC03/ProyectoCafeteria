# Operaciones del contrato por completar

Solo GET /api/v1/health está implementado y definido en openapi.yaml.
La tabla siguiente es planificación; no representa endpoints disponibles.
Convenciones aceptadas en ADR 0006; el contrato de negocio aún no está completo. Validar esquemas y casos de error por operación.

| Módulo    | Operaciones a especificar                                                       | Criterios                                        |
| --------- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| auth      | Login cliente/personal, logout, sesión actual, cambio de credencial             | AC-15/18                                         |
| auth      | Verificar correo, solicitar/completar recuperación, reset administrador         | AC-16/17                                         |
| catalog   | Listar categorías/productos/detalle/opciones; CRUD admin; disponibilidad cajero | AC-02/18/20                                      |
| catalog   | Autorizar carga Cloudinary y asociar/reemplazar imagen; solo administrador      | ADR 0010: JPEG/PNG/WebP, una por producto, 5 MiB |
| orders    | Crear móvil/caja; consulta propia/operativa; marcar LISTO                       | AC-01/02/10                                      |
| payments  | Crear/reutilizar Checkout; cobrar efectivo; webhook con cuerpo raw              | AC-03/05/07/08/09                                |
| cash      | Abrir, consultar actual, resumen y cerrar                                       | AC-04; responsable y cierre excepcional auditado |
| customers | Buscar cliente para caja, consumir token ticket, perfil/historial               | AC-11/12/13/14                                   |
| customers | Favoritos y repetir selección con catálogo actual                               | AC-19/21                                         |
| tickets   | Ticket de venta, acceso digital limitado a comprobante de invitado              | Sin exponer estado/historial de invitados        |

Para cada operación: rol y propiedad, body/query/path, campos obligatorios y límites,
respuesta/códigos/ejemplos, idempotencia, regla y prueba. El ticket digital de invitado
necesita un permiso opaco de alcance limitado: no utilizar folio público ni QR de cobro
como autorización. Especificar token de acceso al ticket en el diseño físico antes de implementarlo.

Secuencia: especificar catálogo de lectura; revisar con frontend; implementar; luego
autenticación y los flujos protegidos según las dependencias.

Las reglas ya aceptadas deben figurar en cada operación: JWT cookie/CSRF,
roles y propiedad, LISTO por preparación/cajero/admin, responsable de caja,
recibido/cambio, límites de pedidos e Idempotency-Key para crear/cobrar efectivo.
Coordinar esquema con Leonel y entradas/respuestas con Enrique.
