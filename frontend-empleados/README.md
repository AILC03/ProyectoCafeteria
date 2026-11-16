# ☕ COFFEE´S POS — Frontend Interactivo (React 19 + Vite)

Sistema de punto de venta (POS) para cafeterías y restaurantes, enfocado en una experiencia de usuario rápida, táctil e intuitiva. 
Todo el proyecto opera **100% en el Frontend** sin necesidad de bases de datos externas ni servidores backend.

---

## 🚀 Inicio Rápido

### 1. Instalar dependencias
```bash
npm install
```

### 2. Iniciar la aplicación
```bash
npm run dev
```

Abre en tu navegador: [http://localhost:3000](http://localhost:3000)

---

## 📱 Pantallas y Flujos de Navegación

1. **Pantalla de Bienvenida (`welcome`):**
   - Fecha y reloj dinámico en tiempo real.
   - Botón `EMPEZAR` para acceder a la pantalla de empleado.
   - Botón de menú superior para ajustes rápidos y personalización visual.

2. **Ingreso de Empleado (`employee-id`):**
   - Teclado numérico táctil interactivo.
   - Botón `← Volver` para regresar a la bienvenida.
   - Accesos directos para pruebas: `Admin (ID: 1)` y `Cajero Demo (ID: 2)`.

3. **PIN de Seguridad (`employee-pin`):**
   - Visualización del empleado identificado.
   - Verificación de PIN de 4 dígitos.
   - Botón `← Cambiar Empleado`.
   - Botón de auto-completado rápido para pruebas (`1234` o `0000`).

4. **Punto de Venta Principal (`pos`):**
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
       - *Terminal y Licencia:* Información del sistema.
     - Botón `Volver a Ventas` para regresar a la toma de pedidos.
     - Botón `Cerrar Sesión` para volver a la pantalla de bienvenida.
   - **Menú Superior Desplegable:**
     - Accesos directos a todas las secciones desde cualquier vista.

5. **Asistente de Configuración (`setup`):**
   - Wizard guiado para personalizar nombre del negocio, terminal y primer administrador.

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
