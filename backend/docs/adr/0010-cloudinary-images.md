# 0010 — Imágenes de productos en Cloudinary Free

- Estado: Aceptado
- Fecha: 2026-10-14
- Aprobación: responsable del backend en conversación; condicionada a uso gratuito dentro de cuota.
- Alcance: proveedor, carga desde panel, límites y procedimiento de reemplazo aprobados explícitamente por el responsable del backend.

## Contexto

Se requiere que el administrador seleccione imágenes desde el panel. Se compararon
URL manual, disco persistente del backend, servicio de imágenes y almacenamiento de objetos.

## Decisión

Usar Cloudinary Image & Video API en plan Free. A la fecha consultada ofrece
25 créditos mensuales compartidos entre almacenamiento, transformaciones y tráfico,
sin tarjeta y con uso permitido incluso en producción dentro de cuota.
Es viable comenzar el proyecto académico gratis; el tráfico real determina si
se mantiene dentro del límite. No prometer capacidad ilimitada ni coste cero
para cualquier volumen. No contratar plan de pago automáticamente.

Solo ADMINISTRADOR podrá autorizar cargas y asociar imágenes al producto.
La cuenta, credenciales e integración todavía no existen por esta decisión.

## Diseño aceptado

- Carga firmada autorizada por backend; api_secret solo en servidor.
- Validar archivo, tipo real, tamaño y dimensiones; no confiar en extensión ni en URL enviada por navegador.
- Una imagen por producto, JPEG/PNG/WebP y máximo 5 MiB.
- Guardar image_url HTTPS, image_public_id e image_version para reemplazo/limpieza.
- Verificar que asset pertenezca al espacio autorizado antes de asociarlo.
- Reemplazar primero en Cloudinary, actualizar BD y limpiar anterior con reintento;
  un fallo de carga no borra la imagen vigente.
- El catálogo sigue funcionando con marcador visual si imagen no está disponible.
- Reutilizar tamaños de entrega para evitar transformaciones innecesarias.
- Vigilar consumo desde consola; si se acerca a cuota, optimizar y revisar antes
  de cambiar plan. No almacenar archivos binarios en PostgreSQL.

## Consecuencias y aceptación

Dependencia externa para archivos; conservar originales del equipo y referencias.
No elimina necesidad de comprobar cuotas al publicar.
Probar permisos, carga inválida, fallo externo, sustitución fallida y consistencia
BD/asset. La imagen no altera snapshots de nombre/precio de órdenes.

## Fuentes verificadas

- [Planes y créditos](https://cloudinary.com/documentation/billing_and_plans)
- [Uso del plan gratuito](https://cloudinary.com/documentation/developer_onboarding_faq_free_plan)
- [Cargas firmadas](https://cloudinary.com/documentation/client_side_uploading)
