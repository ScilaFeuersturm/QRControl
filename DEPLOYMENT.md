# Despliegue Zenit

- API pública: https://zenit-control-qr-api-6bp6.onrender.com
- Comprobación: GET /health devuelve 200 y consulta PostgreSQL.
- Invitados sin clave: GET /tickets devuelve 401.
- Render: https://dashboard.render.com/web/srv-dbr0g84ipgvc73d1bjq0
- Git: https://github.com/ScilaFeuersturm/QRControl/tree/zenit
- Rama de código desplegada: `zenit`; despliegues automáticos desactivados.
- Primer commit desplegado: `9ed7cdc18c36f95dd385619cdef1cb2c6edfb10a`.
- Neon: proyecto QRControl (`jolly-cherry-38706599`), base `qrcontrol`, rama `zenit`.
- La rama Neon `main` queda separada para la versión genérica; `qa-deploy` conserva datos ficticios de las pruebas de PostgreSQL.

## Usar la app

Ingresar la URL pública anterior. Las claves ADMIN_KEY y SCANNER_KEY se consultan en Environment del servicio de Render enlazado. Administración registra pagos y comparte entradas; recepción consulta invitados y confirma ingresos. No poner estas claves dentro de la APK ni del repositorio.

El evento real es «Los Secretos del Destino», el **6 de diciembre de 2026**, con 84 plazas iniciales. El evento «PRUEBA · Los Secretos del Destino» contiene diez compras ficticias para 19 personas. Los QR online se entregan aparte; los de la base SQLite local son otros códigos y no sirven contra Neon.

## Plan gratuito

API Render Free y organización Neon Free. La base Neon no tiene el vencimiento fijo de treinta días de Render Postgres; conserva los límites del plan gratuito vigente. Render puede suspender la API por inactividad y el primer acceso demorar aproximadamente un minuto. Abrir y probar la app antes de empezar el control. Revisar consumo y disponibilidad antes del evento y hacer un backup.

Referencias: https://render.com/docs/free y https://neon.com/pricing.

No se configuró ningún recurso pago. Los cambios futuros del repositorio requieren despliegue manual; revisar la rama elegida para no mezclar la base genérica con la personalización Zenit.
