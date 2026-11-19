# 0003 — Respaldo local, PWA móvil y Electron en modo Venta Rápida

- Estado: Documentada sobre implementación existente
- Fecha: 2026-11-18
- Responsables: Enrique (frontend)

## Contexto

El frontend nació inicialmente como un prototipo 100% cliente con modo restaurante (salón de mesas) y almacenamiento en `localStorage`. Al integrarse con el backend de cafetería, se simplificó el alcance operativo a mostrador/cafetería, conservando capacidad de instalación en móviles (PWA), empaquetado de escritorio para caja (Electron) y tolerancia visual cuando la API no está levantada.

## Opciones consideradas

- **Eliminar por completo `localStorage` desde el día uno**: bloqueaba demostraciones o pruebas de interfaz cuando PostgreSQL estaba apagado.
- **Conservar capa de fallback local separada de los flujos críticos e ir migrando hacia API**: permite demostrar UI sin API pero introduce riesgos de desincronización si falla un endpoint en silencio.

## Decisión

1. **Modo Venta Rápida en `empleados/`**: Se archivaron los componentes del salón de mesas en `frontend/empleados/respaldo/` (`TablesWorkspace.jsx`, `AdminTablesManager.jsx`, `tablesData.js`), manteniendo exclusivamente toma rápida (`Comer Aquí` / `Para Llevar`), KDS, caja y administración.
2. **PWA en `clientes/`**: `manifest.json` y `sw.js` (estrategia Network-first excluyendo `/api/`) permiten instalar la carta móvil en teléfonos cuando se sirve por HTTPS.
3. **Electron en `empleados/`**: `electron/main.cjs` y `electron-builder` generan ejecutables Windows/macOS cargando `dist/index.html` con seguridad de sandbox activada.
4. **Fallback en `localStorage`**: `CartContext` guarda `taffy_cart`; `empleados/src/data/` (`db.js`, `employees.js`, `menuData.js`) sirve como respaldo visual, con limpieza automática de registros demo antiguos.

## Consecuencias

- Permite trabajo offline parcial de catálogo y carrito, pero genera riesgos documentados en [persistencia local](../storage/local-persistence.md): nunca se deben almacenar secretos (`password`, `pin`, `registrationToken`) ni dar por cobrada una orden en `localStorage` si la API falló.
- En Electron con `file://`, el uso de rutas relativas `/api/v1` requiere configurar un `VITE_API_BASE_URL` absoluto al desplegar fuera de Vite dev server.

## Verificación

Revisar `frontend/clientes/public/sw.js`, `frontend/empleados/electron/main.cjs`, `frontend/empleados/respaldo/LEEME_RESTAURACION.md` y [persistencia local](../storage/local-persistence.md).

## Referencias

- [Persistencia local](../storage/local-persistence.md)
- [Arranque local y empaquetado](../local-setup.md)
