# Zenit Access · versión 0.2

Expo SDK 58 + Expo Router + FastAPI. Cada compra tiene un titular, una cantidad de personas y un único QR generado al confirmar el pago. El evento inicial tiene 84 plazas. Los ingresos pueden ser parciales y quedan registrados contra el mismo saldo central.

## Backend local

Requiere Python 3.11 o posterior. Desde `backend`:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export ADMIN_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
export SCANNER_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
export EVENT_CAPACITY=84
uvicorn main:app --host 0.0.0.0 --port 8000
```

Guardá ambas claves en tu gestor de contraseñas. Para ingresarlas desde el celular, consultalas en tu terminal con `printenv ADMIN_KEY` y `printenv SCANNER_KEY`. No van en el código ni dentro de la APK. `.env.example` es una referencia y no se carga automáticamente.

SQLite se usa por defecto; los datos quedan en `backend/zenit.sqlite3`. Para PostgreSQL configurar `DATABASE_URL=postgresql+psycopg://usuario:clave@host:5432/zenit`. En ese caso DATABASE_URL tiene prioridad sobre DATABASE_PATH. El cupo inicial se establece solo al crear la base: cambiar EVENT_CAPACITY después no modifica eventos existentes.

## App

Desde `mobile`:

```sh
npm ci
npx expo start
```

Abrir con Expo Go compatible o un development build. Ingresar la URL del servidor y una clave. En un celular físico usar la IP LAN de la computadora, por ejemplo `http://192.168.1.10:8000`, con ambos en la misma red. `localhost` en el celular apunta al propio teléfono. La URL es editable en el inicio y no necesita recompilar la app. HTTP sirve para desarrollo local; en producción usar HTTPS.

La pantalla inicial permite elegir el evento. Después se abre la lista de invitados. Administración puede registrar compras, confirmar pagos y compartir entradas. Recepción puede consultar la lista y validar ingresos, sin acceder a teléfonos ni emitir entradas.

## Flujo acordado

1. Registrar titular, teléfono, mesa y cantidad. Marcar «Ya verifiqué el pago» si corresponde, o dejar pendiente.
2. El pago se verifica manualmente fuera de la app. Al confirmarlo, el servidor asigna el cupo y genera el token QR aleatorio. Una reserva pendiente no bloquea cupo.
3. La invitación PNG incluye evento, fecha, lugar, titular, mesa, cantidad y QR. Compartir abre el selector nativo para elegir una aplicación instalada. WhatsApp, Mensajes u otras aparecen según lo que admita cada dispositivo. La posibilidad de adjuntar por mensaje directo de Instagram depende de esa aplicación; también se puede guardar la imagen y adjuntarla manualmente. No hay envíos automáticos ni confirmación de entrega.
4. Recepción escanea: primero ve titular y saldo, sin consumir entradas. Selecciona cuántas personas están presentes y confirma.
5. Una compra para cuatro admite, por ejemplo, dos ahora y otras dos después. El saldo se valida de forma atómica en el servidor. Ningún escaneo puede exceder la cantidad pagada.
6. La lista muestra titular, mesa y «ingresaron X de Y». Se registran cantidades por grupo, no nombres individuales de acompañantes. Las filas visibles y los totales se actualizan cada tres segundos; también al volver del escáner y al deslizar para actualizar. La lista usa paginación y filtros.

El QR codifica un token secreto, no el nombre ni la cantidad como datos confiables editables. El nombre, evento y cantidad se imprimen en la invitación y se consultan desde el servidor al leerlo. Una captura copiada puede ser usada antes por otra persona: recepción debe comprobar el titular y contar a quienes efectivamente ingresan. No hay reingreso después de consumir el saldo.

## Red y operaciones pendientes

Tres o más celulares deben usar el mismo servidor y la misma base. El servidor serializa cambios de cupo por evento y registra cada confirmación con un identificador único. Reconsultar esa misma operación tras una desconexión devuelve el resultado original sin descontar de nuevo.

Si la app muestra una operación sin confirmar, no se debe autorizar el acceso ni comenzar una operación nueva. Pulsar «Reconsultar la misma operación». La referencia se conserva en memoria mientras la pantalla siga montada. Si se cierra la app, se cambia de pantalla o se pierde esa referencia, consultar el registro con administración y conciliar el ingreso antes de continuar. Sin conexión no se autoriza el acceso.

## Diez QR de ensayo

Desde `backend`, antes de iniciar la API:

```sh
source .venv/bin/activate
python seed_demo.py --output demo-qr
```

Crea un evento separado llamado «PRUEBA · Los Secretos del Destino» y diez compras pagadas: grupos de una, dos y tres personas (19 plazas de prueba). No consume ninguna plaza del evento real. El script es repetible: sin `--reset` conserva QR y asistencia; con `--reset` restablece solo ese evento de prueba y rota sus QR, invalidando los anteriores.

```sh
python seed_demo.py --reset --output demo-qr
```

La carpeta generada contiene diez invitaciones PNG y un `manifest.json` con los códigos de ensayo. Seleccionar el evento PRUEBA en la app. Los PNG y la API deben usar la misma base de datos: si se vuelve a generar el ensayo en una base nueva, se deben reemplazar las imágenes.

La entrega también incluye una base de pruebas y diez PNG ya vinculados a ella dentro de `Pruebas-Zenit.zip`; seguir su INSTRUCCIONES.md. Son solo para ensayo.

## APK

Proyecto asociado a la cuenta Expo de la usuaria. El código de la app y la configuración de compilación están en la carpeta `mobile`.

El perfil `preview` de `mobile/eas.json` genera un APK Android instalable. Este perfil permite HTTP para ensayar contra la computadora en la red local. El perfil `production` mantiene bloqueado el tráfico HTTP en Android y debe apuntar a un servicio HTTPS. El plugin de red local se configura en `mobile/plugins/withLocalTestNetwork.js`.

Para compilar:

```sh
cd mobile
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

El build requiere cuenta de Expo, proyecto asociado y credenciales Android. Las claves del backend se ingresan al abrir la app. La exportación Metro por sí sola no es una APK.

## Crecer a otros eventos

Desde «Mis eventos», administración puede crear eventos indicando nombre, fecha, lugar y cupo. El servidor permite como máximo dos eventos activos, incluso con creaciones simultáneas. Para abrir otro se puede archivar uno, sin borrar invitados ni historial; archivar bloquea nuevas compras, pagos, emisión e ingresos. Reactivar también respeta el límite. El evento de prueba ocupa uno de esos dos lugares.

Las compras y escaneos pertenecen a un evento. POST `/events` con clave de administración crea otro evento con nombre, fecha, lugar y capacidad; se elige desde la app. Los endpoints usan `event_id`; los QR de un evento no sirven en otro.

El acceso a la base está implementado con SQLAlchemy tanto para SQLite como para PostgreSQL. En PostgreSQL las escrituras bloquean la fila del evento; SQLite usa una transacción de escritura inmediata. Para un servicio con varios procesos/instancias usar PostgreSQL compartido. SQLite queda para desarrollo o una sola instancia con disco persistente. La versión se verificó con SQLite y con PostgreSQL 18 en Neon en una rama de ensayo: tres lectores simultáneos, saldo parcial, reintentos idempotentes y cupo de 84 bajo pagos concurrentes. Antes de vender para un aforo mayor se necesitan prueba de integración PostgreSQL, pruebas de carga, monitoreo y una política de cuentas individuales por operador. Las claves actuales son globales por rol para todos los eventos y no son adecuadas para alojar organizadores independientes.

La inicialización crea tablas y el evento inicial. Al encontrar la base de la primera versión, migra compras pagadas conservando sus tokens y asistencia; pendientes quedan sin token. Hacer backup antes de actualizar. Inicializar el esquema una vez antes de levantar múltiples procesos. Para futuras modificaciones de esquema incorporar migraciones versionadas; `create_all` no altera tablas existentes. Cambiar DATABASE_URL no copia automáticamente datos entre bases.

## Diseño

La entrada azul y dorada se genera en `backend/ticket_design.py`, con composición propia, luna, estrellas y silueta de costa. Es una adaptación visual de la referencia. No reproduce retratos ni logos originales: requieren los archivos autorizados para la pieza definitiva. El QR se dibuja siempre desde los datos de esa compra. Para tipografía consistente en Linux instalar DejaVu o definir TICKET_FONT y TICKET_SERIF_FONT con rutas locales a fuentes autorizadas.

## Validación

- Backend: desde `backend`, `.venv/bin/python -m pytest -q`.
- App: desde `mobile`, `npm run typecheck` y `npm run lint`.
- Exportación Android: `npx expo export --platform android`.

Las pruebas cubren ingresos parciales, concurrencia, reintentos idempotentes, cupo de 84 bajo pagos simultáneos, emisión solo al pagar, revocación, permisos, separación de eventos, paginación, filtros, migración inicial y diez compras de ensayo.

Antes del evento hacer una prueba en los tres celulares reales: cámara, confirmación parcial, simultaneidad, compartir por las aplicaciones necesarias y cortes de red. Falta desplegar la API con HTTPS, persistencia, backups y protección contra abuso, y ensayar la restauración sin perder ingresos recientes. No se debe restaurar un backup durante el acceso sin conciliación.

No incluye integración bancaria, pasarela de pago, WhatsApp API, Instagram API, validación offline, identificación individual de acompañantes ni publicación en tiendas. No se ha probado cámara ni selector de compartir en hardware real.

## Auditoría de dependencias

La auditoría npm de esta versión informa diez alertas moderadas en herramientas de Expo/ESLint y minimatch; no informa alertas altas ni críticas. No se aplicaron cambios de versión mayor sugeridos automáticamente. Revisar la actualización compatible antes de la puesta en producción. El lockfile conserva la instalación comprobada.

## Despliegue de Zenit

El evento se controla el **6 de diciembre de 2026**. El Blueprint `render.yaml` apunta a la rama `zenit`, usa una API gratuita de Render y requiere DATABASE_URL de un PostgreSQL externo (por ejemplo Neon Free) con TLS. No usa la base Render existente que vence ese día. Las claves ADMIN_KEY y SCANNER_KEY son generadas por Render y se consultan en la sección Environment del nuevo servicio. La API inicializa el evento real y el ensayo por separado. No compartir la cadena de conexión ni las claves en el repositorio.

Ramas acordadas: `zenit` conserva esta personalización; `main` contiene QRControl genérico.
