# Frontend unificado

El servidor de desarrollo se limita a `localhost` por defecto y escucha en el puerto `5173`.

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
