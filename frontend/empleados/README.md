# ☕ Coffee's POS — Terminal de empleados

Terminal de punto de venta para cafeterías y restaurantes. Ofrece una experiencia táctil para el personal de caja, preparación y administración. Está desarrollada con React 19 y Vite; también puede empaquetarse como aplicación de escritorio con Electron.

La terminal consume la API en `/api/v1` cuando está disponible y conserva determinados datos de interfaz y respaldo en el navegador (localStorage e IndexedDB). El almacenamiento local no sustituye la persistencia ni la autenticación de la API.

---

## 🚀 Inicio Rápido

### Requisitos

- Node.js 22 o superior recomendado.
- API local en `http://localhost:3000` para autenticación, catálogo, caja, ventas y cocina.

### 1. Instalar dependencias
```bash
npm install
```

### 2. Iniciar la aplicación
```bash
npm run dev
```

Abra [http://localhost:5174](http://localhost:5174). Vite reenvía `/api` a `http://localhost:3000`.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Inicia la terminal web con Vite en el puerto 5174. |
| `npm run build` | Genera la versión web en `dist/`. |
| `npm run preview` | Sirve localmente `dist/`. |
| `npm run electron` | Abre Electron con la compilación existente en `dist/`. Ejecute antes `npm run build`. |
| `npm run electron:dev` | Abre Electron en modo desarrollo. Actualmente Electron busca Vite en el puerto 3000, por lo que requiere un servidor compatible en ese puerto o ajustar esa configuración. |
| `npm run dist:win` | Genera instaladores Windows x64. |
| `npm run dist:mac` | Genera paquetes macOS. |
| `npm run dist:all` | Genera paquetes para macOS y Windows. |

---

## 📱 Pantallas y Flujos de Navegación

1. **Configuración (`setup`):**
   - Vinculación inicial de cafetería y terminal.

2. **Pantalla de Bienvenida (`welcome`):**
   - Fecha y reloj dinámico en tiempo real.
   - Botón `EMPEZAR` para acceder a la pantalla de empleado.
   - Botón de menú superior para ajustes rápidos y personalización visual.

3. **Ingreso de Empleado (`employee-id`):**
   - Teclado numérico táctil interactivo.
   - Botón `← Volver` para regresar a la bienvenida.
   - Accesos directos para pruebas: `Admin (ID: 1)` y `Cajero Demo (ID: 2)`.

4. **PIN de Seguridad (`employee-pin`):**
   - Visualización del empleado identificado.
   - Verificación de PIN de 4 dígitos.
   - Botón `← Cambiar Empleado`.
   - Botón de auto-completado rápido para pruebas (`1234` o `0000`).

5. **Punto de Venta Principal (`pos`):**
   - **Tomar Orden (`order`):**
     - Filtros por categorías (Desayunos, Entradas, Platillos Fuertes, Cafetería, Bebidas, Postres).
     - Carrito interactivo con cantidades (`+`/`-`), notas de cocina por producto y vaciado rápido.
     - Botón `Cobrar` que abre el modal de cobro y ticket térmico.
     - Poner orden en espera (`Hold`) y restaurar órdenes.
   - **Panel de Administración (`admin-dashboard`):**
     - Barra lateral con navegación entre:
       - *Corte de Caja:* Resumen de ventas del día, métricas por empleado y exportación.
       - *Editar Menú:* Alta, edición y eliminación de productos.
       - *Personal y Usuarios:* Gestión de empleados y roles.
        - *Historial de Pedidos:* Registro y reimpresión de tickets.
        - *Cocina / Barista:* Vista de preparación para el rol correspondiente.
       - *Terminal y Licencia:* Información del sistema.
     - Botón `Volver a Ventas` para regresar a la toma de pedidos.
     - Botón `Cerrar Sesión` para volver a la pantalla de bienvenida.
   - **Menú Superior Desplegable:**
     - Accesos directos a todas las secciones desde cualquier vista.

---

## 🎨 Personalización Visual
- Selección de temas de color: Nordic Mint, Dark Graphite, Warm Latte y Fresh Sage.
- Efectos de sonido táctiles configurables.
- Modo pantalla completa.

---

## 🛠️ Tecnologías
- **React 19**
- **Vite**
- **Vanilla CSS** con diseño responsive y soporte touch
- **Electron** y **electron-builder** para escritorio

## Integración y seguridad

El cliente HTTP está en `src/api/client.js`. Trabaja con cookies HttpOnly, solicita CSRF antes de operaciones mutables y procesa errores RFC 7807. El proxy de desarrollo está definido en `vite.config.js` y apunta a `http://localhost:3000`.

Las pantallas usan la API para autenticación de personal, catálogo, ventas, caja y cocina. Para permitir la operación de interfaz ante indisponibilidad parcial, también existen datos locales en `src/data/`, IndexedDB y `localStorage`.

## Estructura relevante

```text
src/
├── api/          # Comunicación con autenticación, caja, ventas, catálogo y cocina
├── components/   # Pantallas POS, espacios de trabajo y modales
├── data/         # Respaldo local de empleados, menú y pedidos
├── utils/        # Dinero, audio, notificaciones y terminal
└── App.jsx       # Estado global, navegación y flujos de cobro
electron/         # Proceso principal de la aplicación de escritorio
```

## Credenciales y datos de prueba

Las credenciales y los datos disponibles dependen de la configuración local y de la API. No incorpore contraseñas reales ni datos personales en el repositorio. Para consultar o ajustar los datos de demostración, revise `src/data/employees.js` y la configuración del backend.
