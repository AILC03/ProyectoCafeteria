# 🤖 AGENTS.md — Instrucciones de Desarrollo Frontend (Coffee´s Pos)

Este proyecto ha sido optimizado como una **aplicación 100% Frontend (React 19 + Vite)**, desacoplada de backend y bases de datos externas.

---

## 1. Inicio Rápido del Servidor de Desarrollo

### Requisitos
- Node.js >= 18.0.0

### Instalación y Ejecución
```bash
# 1. Instalar dependencias frontend
npm install

# 2. Iniciar servidor Vite
npm run dev
```
* **Frontend App:** `http://localhost:3000`

---

## 2. Arquitectura de Pantallas y Navegación

La aplicación se compone de las siguientes pantallas y vistas navegables mediante botones interactivos:

| Pantalla / Vista | Identificador | Descripción |
|---|---|---|
| **Asistente de Configuración** | `setup` | Wizard de bienvenida, registro de cafetería y terminal |
| **Bienvenida** | `welcome` | Reloj en tiempo real, fecha, botón `EMPEZAR` y botón de menú |
| **Número de Empleado** | `employee-id` | Teclado táctil para digitar ID de empleado (`1` para Admin, `2` para Cajero) |
| **PIN de Seguridad** | `employee-pin` | Teclado táctil para digitar PIN (`1234` o `0000`) |
| **Punto de Venta (POS)** | `pos` (Tab: `order`) | Catálogo por categorías, carrito de compras, cobro rápido |
| **Panel de Administración** | `pos` (Tab: `admin-dashboard`) | Dashboard integral con barra lateral navegable |
| **Corte de Caja** | `pos` (Tab: `shift`) | Métricas diarias, desglose por método de pago y por empleado |
| **Historial de Pedidos** | `pos` (Tab: `history`) | Registro de tickets, filtros y reimpresión |
| **Editar Menú** | `pos` (Tab: `menu-admin`) | Catálogo interactivo de productos con alta, edición y baja |
| **Personal y Usuarios** | `pos` (Tab: `users-admin`) | Gestión de empleados, roles y permisos |

---

## 3. Credenciales de Prueba en Frontend

Los siguientes usuarios están precargados en memoria / almacenamiento local:

- **Administrador:** ID `1` | PIN `1234`
- **Cajero Demo:** ID `2` | PIN `0000`
- **Cajero Turno:** ID `101` | PIN `1234`

---

## 4. Modales y Componentes Interactivos

- **CheckoutModal:** Selección de método de pago (Efectivo, Tarjeta, Transferencia), cálculo de cambio y confirmación.
- **ReceiptModal:** Simulación visual de ticket térmico imprimible.
- **NoteModal:** Notas personalizadas por producto.
- **MenuModal:** Ajustes de tema (Nordic Mint, Dark Graphite, Warm Latte, Fresh Sage), audio y configuración.
- **ConfirmModal & ToastNotification:** Confirmaciones y avisos interactivos.
