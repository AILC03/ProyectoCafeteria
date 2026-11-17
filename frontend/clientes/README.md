# Portal de clientes — Coffee's POS

Aplicación de autoservicio para consultar el menú de la cafetería, personalizar productos, crear pedidos y administrar la cuenta de cliente. Está construida con React 19, TypeScript, Vite y Tailwind CSS.

## Requisitos

- Node.js 22 o superior recomendado.
- La API local en `http://localhost:3000` para autenticación, catálogo, pedidos, favoritos y registro con ticket.

## Inicio rápido

```bash
npm install
npm run dev
```

La aplicación se abre en `http://localhost:5173`. También puede ejecutar `iniciar.bat` en Windows; instala las dependencias si aún no existen y arranca Vite.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Inicia Vite en el puerto 5173. |
| `npm run start` | Alias de `dev`. |
| `npm run build` | Comprueba TypeScript y genera la compilación en `dist/`. |
| `npm run preview` | Sirve localmente la compilación generada. |
| `npm run lint` | Ejecuta Oxlint. |

En Windows, `ejecutar-produccion.bat` ejecuta `build` y abre la vista previa local.

## Rutas y flujo

| Ruta | Descripción |
| --- | --- |
| `/` | Redirige a inicio de sesión. |
| `/iniciar-sesion` | Inicio de sesión con teléfono o número de cliente y NIP; permite acceso como invitado. Incluye alta mediante el código del ticket. |
| `/registro` | Redirige a `/iniciar-sesion`, donde se encuentra el formulario de registro. |
| `/menu` | Catálogo, categorías, favoritos, carrito, personalización, envío del pedido, historial y perfil. |

El registro con ticket solicita nombre, teléfono de 10 dígitos, NIP de cuatro dígitos y el código impreso en un ticket válido. La navegación de la aplicación se define en `src/App.tsx`.

## Integración con API

El cliente HTTP (`src/api/client.ts`) usa `/api/v1` y cookies de sesión HttpOnly. Para mutaciones obtiene y envía automáticamente el encabezado `X-CSRF-Token` y reintenta una vez si el token CSRF es inválido.

Durante el desarrollo, `vite.config.ts` reenvía `/api` a `http://localhost:3000`. Ejecute la API del directorio `../../backend` antes de probar flujos autenticados. Si el catálogo no responde, la pantalla intenta usar el respaldo disponible en `localStorage`; las funciones de cuenta y pedidos requieren la API.

## Estructura relevante

```text
src/
├── api/          # Clientes de autenticación, catálogo, pedidos, favoritos y registro
├── components/   # Encabezado, carrito y modales
├── context/      # Estado de autenticación, carrito y notificaciones
├── pages/        # Inicio de sesión y menú
├── types/        # Tipos de dominio
└── utils/        # Dinero y categorías
```

## Tecnología

- React 19 y React Router
- TypeScript
- Vite
- Tailwind CSS y PostCSS
- `canvas-confetti` y `lucide-react`
