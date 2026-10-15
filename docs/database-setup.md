# Preparación local de PostgreSQL

En pgAdmin conectar al servidor local (5432). En Databases → Create → Database
crear `cafeteria` para desarrollo y `cafeteria_shadow` vacía y exclusiva para
cálculo de migraciones. Usar usuario local con acceso a ambas.

Prisma puede recrear el contenido de shadow: nunca usar la principal ni una
base con datos importantes. Alternativamente puede crear shadow automáticamente
si el usuario tiene permiso CREATEDB.

Desde la raíz, solo si `.env` todavía no existe:

```powershell
Copy-Item .env.example .env
```

Editar localmente DATABASE_URL y SHADOW_DATABASE_URL con usuario y contraseña.
Codificar caracteres especiales para URL. No compartir ni subir `.env`.
No usar superusuario en producción.

El usuario informó que creó las bases después del fallo inicial 3D000. La conexión no se ha vuelto a verificar en esta revisión: no asumir éxito ni pedir credenciales por chat.

Ejecutar `npm run db:check` desde la raíz para comprobar desarrollo y shadow sin crear ni borrar tablas. El script exige bases diferentes. Crear además una BD exclusiva de pruebas (por ejemplo cafeteria_test) antes de pruebas de integración; no usar desarrollo ni shadow para limpieza de pruebas. La configuración de tests/TEST_DATABASE_URL aún no existe.

No ejecutar migrate dev todavía: el esquema inicial no contiene modelos. Primero concretar el diseño físico y revisar la migración con Leonel. No resetear datos ante un fallo de conexión.
