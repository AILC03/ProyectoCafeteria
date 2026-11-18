# 0001 — PostgreSQL como base de datos

- Estado: Aceptado
- Fecha: 2026-10-14
- Responsables: equipo ESMAOS; elección solicitada por responsable del backend.

## Contexto

El anteproyecto proponía MySQL. El equipo solicita PostgreSQL antes de crear
tablas, migraciones o código de acceso a datos. Actualmente solo hay estructura
y documentación, por lo que no se necesita migrar datos.

## Opciones consideradas

- MySQL: mantener el motor inicialmente propuesto.
- PostgreSQL: motor relacional con transacciones, restricciones e índices
  únicos parciales útiles para las reglas de caja y pagos.

## Decisión

Usar PostgreSQL. Conservar entidades, relaciones y reglas del modelo aprobado.
Elegir herramienta de acceso a datos y migraciones en otra ADR.

## Consecuencias

- Actualizar ejemplo DATABASE_URL; puerto local habitual 5432.
- Instalar/configurar el motor antes de ejecutar futuras migraciones.
- Usar tipos PostgreSQL; recomendar TIMESTAMPTZ para instantes e identity
  para IDs generados.
- Evaluar índice único parcial para una sola sesión de caja abierta y para
  máximo un pago exitoso por orden; no sustituye las transacciones de negocio.
- Consultas, migraciones y pruebas de integración deben apuntar a PostgreSQL.
- El PDF previo menciona MySQL; la documentación editable del repositorio y
  esta ADR registran el cambio y prevalecen para la implementación.
- Actualizar el anteproyecto si la entrega académica exige reflejar el motor.

## Verificación

Cuando exista aplicación, ejecutar migraciones y pruebas de integración sobre
PostgreSQL aislado de producción. Esta ADR no implica instalación realizada.

## Referencias

- ../architecture.md
- ../data-dictionary.md
