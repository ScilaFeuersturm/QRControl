# QRControl

Base genérica para gestión de eventos y control de acceso mediante QR, con Expo SDK 58, Expo Router y FastAPI. Cada compra tiene un titular, una cantidad de personas, un pago confirmado manualmente y un QR con saldo para ingresos parciales.

- `main`: producto genérico configurable por instalación.
- `zenit`: personalización Los Secretos del Destino, control de acceso el 6 de diciembre de 2026, cupo inicial de 84 personas y evento de ensayo separado.

## Ejecutar

Desde `backend`, crear un entorno virtual, instalar `requirements.txt`, definir ADMIN_KEY y SCANNER_KEY con claves aleatorias distintas de al menos 24 caracteres y ejecutar `uvicorn main:app --host 0.0.0.0 --port 8000`.

Desde `mobile`, ejecutar `npm ci` y `npx expo start`. Ingresar la URL del servidor y la clave del equipo. Administración puede crear el primer evento desde «Administrar / crear eventos». La base genérica arranca sin eventos, salvo que se configure INITIAL_EVENT_NAME.

Los archivos `.env.example` enumeran la configuración. Las variables del backend deben exportarse en el entorno; el backend no carga archivos .env automáticamente. Expo sí carga su archivo local .env. No poner claves de acceso en variables EXPO_PUBLIC.

## Configuración por cliente

Backend: BRAND_NAME, TICKET_ACCENT_COLOR, MAX_ACTIVE_EVENTS (por defecto 2), DATABASE_URL o DATABASE_PATH. Para precargar un evento nuevo: INITIAL_EVENT_NAME, INITIAL_EVENT_DATE, INITIAL_EVENT_VENUE y EVENT_CAPACITY.

App: EXPO_PUBLIC_BRAND_NAME, EXPO_PUBLIC_ACCENT_COLOR y EXPO_PUBLIC_API_URL. El esquema, nombre de aplicación e identificadores Android/iOS se definen en `mobile/app.json`. Esta rama no está asociada al proyecto Expo de Zenit: asociar un proyecto de Expo propio al compilar para un cliente.

El límite de eventos activos se consulta al servidor y se valida también en cada creación o reactivación. El diseño de invitación está en `backend/ticket_design.py`.

## Operación

Crear un evento con fecha, lugar y capacidad. Registrar titular, teléfono, mesa y cantidad; al confirmar manualmente el pago se asignan las plazas disponibles y se genera el QR. La reserva sin pagar no ocupa cupo ni tiene QR. Compartir abre el selector del dispositivo para enviar la invitación PNG por aplicaciones compatibles.

Recepción consulta el QR y confirma cuántas personas entran. El grupo puede llegar por separado. El servidor impide superar el saldo y las confirmaciones usan un identificador único para que reintentar la misma operación no duplique ingresos. Las filas visibles y totales se actualizan cada tres segundos. Los acompañantes se cuentan por grupo; no se registran sus identidades individuales.

Archivar un evento conserva el historial y bloquea nuevas operaciones. Reactivarlo respeta el límite de eventos activos. Todas las claves son globales por rol para esta instalación: esta base no es un SaaS con aislamiento entre organizaciones.

## Pruebas

Backend: `.venv/bin/python -m pytest -q`. App: `npm run typecheck` y `npm run lint`. Para diez QR ficticios dentro de un evento separado, ejecutar `python seed_demo.py --output demo-qr`. Usar la misma base de datos en la API. `--reset` rota solo esos códigos y restablece su asistencia. El ensayo ocupa un lugar de evento activo.

La compatibilidad con el prefijo QR anterior se conserva para migraciones. El código QR no contiene nombre ni cantidad como información editable confiable: esos datos se imprimen en la invitación y se consultan desde el servidor.

## Despliegue y APK

`render.yaml` define una API gratuita y requiere una cadena PostgreSQL externa con TLS. No almacena SQLite en el disco efímero de Render. Una opción es Neon Free, sujeto a sus límites vigentes. Las claves las genera Render y se consultan en el panel Environment. No se despliega esta rama genérica automáticamente al servicio Zenit.

`mobile/eas.json` incluye un perfil preview para APK. Asociar primero el proyecto Expo correcto y ejecutar `npx eas-cli@latest build --platform android --profile preview`. Solo preview/development permiten HTTP local; producción requiere HTTPS en Android. No se compiló una APK genérica en esta entrega; la compilación Zenit es independiente.

Para producción: PostgreSQL compartido, HTTPS, protección contra abuso, copias de seguridad, monitoreo, pruebas de carga y prueba real de cámara/compartir en los equipos acordados. SQLite sirve para desarrollo y una sola instancia con disco persistente. DATABASE_SCHEMA opcional permite un esquema PostgreSQL exclusivo; cambiar DATABASE_URL no migra datos automáticamente.

Si se pierde una respuesta de ingreso, reconsultar la misma operación. Si se cierra la app o se pierde su referencia, conciliar el registro con administración antes de admitir personas. No se autoriza acceso sin conexión. Una copia del QR puede consumir primero el saldo: el personal debe comprobar al titular y contar las personas presentes.

La auditoría npm informa alertas moderadas en herramientas Expo/ESLint/minimatch; revisar actualizaciones compatibles antes de la entrega productiva. No hay pagos automáticos, envíos automáticos a redes sociales, soporte offline ni publicación en tiendas.
