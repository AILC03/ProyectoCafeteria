# Respaldo del Sistema de Mesas y Modo Restaurante - Coffee´s Pos

Este directorio contiene una copia exacta y funcional de todos los archivos relacionados con la pantalla de mesas y el modo restaurante antes de ser retirados para dejar el sistema exclusivamente en **Venta Rápida (Cafetería / Mostrador)**.

## Archivos respaldados:

- `App.jsx` -> Contiene el ruteo original con soporte para mesas, comensales y cambio de modo de negocio.
- `components/PosHeader.jsx` -> Encabezado original con botón de "Mesas", indicador de mesa activa y retorno a mesas.
- `components/OrderingWorkspace.jsx` -> Panel de comandas con soporte para enviar comanda a cocina, solicitar cuenta y mesa asignada.
- `components/MenuModal.jsx` -> Modal de ajustes con el selector de modo ("Restaurante" vs "Venta Rápida").
- `components/AdminDashboardWorkspace.jsx` -> Dashboard de administración con la pestaña de "Gestión de Mesas".
- `components/TablesWorkspace.jsx` -> Componente de la vista visual del salón de mesas (Control de Mesas).
- `components/AdminTablesManager.jsx` -> Administrador de creación, edición y eliminación de mesas.
- `data/tablesData.js` -> Capa de datos y persistencia en localStorage para comandas y mesas.

## ¿Cómo restaurar?
Si en el futuro deseas volver a activar el modo restaurante con mesas, solo avísame o copia estos archivos de vuelta a `src/`.
