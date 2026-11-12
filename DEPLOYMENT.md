# Entornos y ramas

- `main`: QRControl genérico, configurable por cliente. No tiene un proyecto Expo asociado ni un servicio público propio.
- `zenit`: personalización del evento del 6 de diciembre de 2026. Su API se publicó en https://zenit-control-qr-api-6bp6.onrender.com desde esa rama.
- Los despliegues de Zenit son manuales. Un push a `main` no actualiza el evento.
- Neon: proyecto QRControl; ramas `main` y `zenit` separadas. La rama `qa-deploy` contiene únicamente datos ficticios de verificación.

Las pruebas de PostgreSQL 18 en Neon verificaron saldo parcial, tres lectores concurrentes, reintentos de la misma operación y límite de cupo bajo pagos simultáneos. Antes de usar cada instalación comercial se deben probar los equipos y la red reales y dimensionar el servicio.

Consultar la documentación de la rama `zenit` para acceder a su servicio y claves. No reutilizar esas claves ni su base para nuevos clientes; asignar datos y credenciales propios por instalación. No guardar contraseñas ni cadenas de conexión en Git.
