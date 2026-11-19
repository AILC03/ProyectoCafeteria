# Frontend unificado

El servidor de desarrollo se limita a `localhost` por defecto y escucha en el puerto `5173`.

## Requisitos

- Node.js `>=22.13.0 <23`.

## Proxy de API local

Las siguientes variables Vite no contienen secretos y son opcionales. Defínelas en un archivo
`.env.local` no versionado cuando necesites cambiar la integración local:

```dotenv
VITE_API_PROXY_TARGET=http://localhost:3000
VITE_API_PROXY_ORIGIN=http://localhost:5173
VITE_API_PROXY_REFERER=http://localhost:5173/
```

Si no se definen, esos valores locales seguros son los predeterminados. No versionar archivos
`.env` con configuraciones específicas del entorno.

## Pruebas

- `npm run test`: ejecuta todas las pruebas unitarias (`*.unit.test.ts(x)`) y de componentes
  (`*.component.test.tsx`).
- `npm run test:unit`: descubre únicamente pruebas `*.unit.test.ts(x)`.
- `npm run test:components`: descubre únicamente pruebas `*.component.test.tsx` con Vitest,
  jsdom y React Testing Library.
- `npm run test:coverage`: cobertura V8 sin umbrales configurados.
- `npm run test:e2e`: Playwright para pruebas ubicadas en `e2e/` con Chromium. No instala navegadores.

El servidor MSW de pruebas se inicia sin handlers y falla ante solicitudes no gestionadas, por lo
que las pruebas no llaman a la API real de forma predeterminada.
