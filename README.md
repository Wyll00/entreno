# Entrenos

Aplicación web personal para registrar entrenamientos desde el móvil. Una sola
cuenta, sin registro público. Es independiente de Brújula: carpeta,
contenedor, volumen, base de datos y credenciales propios.

**Estado (4-oct-2026):** desplegada en https://entrenos.wyll-servidor.duckdns.org.
Puedes registrar series hablando o escribiendo frases, la app reconoce el
ejercicio en un catálogo de más de 800 y lo apunta sola. También hay registro
manual, edición, borrado e historial. Falta probar el dictado en el móvil real.

## Cómo se apunta por voz

1. En «Hoy», toca el micrófono y di, por ejemplo: «press inclinado 60 kilos 8 repeticiones».
   También puedes escribirlo o usar el micrófono del teclado.
2. Si la frase está completa y no es ambigua, **se apunta sola** y aparece **Deshacer**.
3. Si falta algo, pregunta y deja el borrador a medias. Por ejemplo, «curl 12 kilos 10»
   ofrece los curls en botones y «hice tres series» pide el peso y las repeticiones.
   No inventa datos.
4. Después de una serie, el ejercicio queda activo. Basta con decir «otra con 60 y 7,
   y bajé a 50 para diez».
5. «Hoy hice pecho» pone «Pecho» como etiqueta de la sesión. Si no hay sesión abierta,
   se crea la de hoy.

Entiende cifras dichas con palabras («sesenta y dos coma cinco»), «60 por 8»,
«3 series de 10», varios ejercicios en una frase y errores de dictado leves.
Las correcciones («me equivoqué, eran siete») y las fechas («ayer») nunca se
apuntan solas.

Si no reconoce el ejercicio («hip trast») o sobran palabras junto al nombre
(«jalón tras nuca»), no apunta nada: propone los ejercicios parecidos del
catálogo como botones. **Corregir texto** deshace lo apuntado y devuelve la
frase al campo para arreglarla a mano. Al escribir un ejercicio a mano, el
campo sugiere nombres del catálogo y avisa si se va a crear uno nuevo.

**Todo es editable:**
- Series: hoy, en «Hoy»; las de días anteriores, en «Historial».
- Sesiones: fecha y etiqueta. Se pueden reabrir para añadir series o borrar con sus series.
- Ejercicios: nombre, grupo, tipo de peso y alias. Se pueden borrar los que no tienen series.
- Tu nombre: en «Perfil».

El intérprete está en `src/lib/interpret.ts`. Es determinista y no llama a
ningún servicio externo. Sus casos están en `tests/interpret.test.ts`.

## Catálogo de ejercicios

- **759 ejercicios** de [kinetic-place/exercises-db](https://github.com/kinetic-place/exercises-db)
  (castellano, licencia MIT; ver `src/lib/catalog-data/LICENSE-kinetic-exercises-db.txt`).
  Quedan fuera los estiramientos y el cardio.
- Encima hay una capa propia (`src/lib/catalog.ts`) con unos 70 ejercicios habituales y las
  formas de decirlos («banca», «jalón», «laterales»…).
- El tipo de peso por defecto sale del material: barra, máquina o polea cuentan como total,
  mancuernas y pesas rusas por unidad, y peso corporal sin carga. Si la última vez apuntaste
  ese ejercicio de otra forma, manda tu costumbre.
- En la pestaña **Ejercicios** puedes buscar, cambiar alias o tipo de peso y crear ejercicios
  propios, que se reconocen por voz al momento. Un alias solo puede pertenecer a un ejercicio.
- Para regenerar los datos: `node scripts/import-kinetic.ts <ruta>/es/exercises.json` y subir
  `CATALOG_VERSION`.

## Pila

- Next.js 16.3.8 + React 19.3 + TypeScript 5.9 (versiones fijadas en `package.json` y `package-lock.json`).
- SQLite con `node:sqlite` de Node 24, sin módulos nativos que compilar.
- Better Auth 1.7.7: contraseña y sesiones (`disableSignUp: true`).
- Docker Compose con el volumen `entrenos-data` montado en `/data`.

## Privacidad

La web y la base de datos están en tu servidor. **El dictado lo hace el
navegador del móvil**: en Chrome, el audio lo procesa el servicio de voz de
Google; en Safari, el de Apple (en iOS recientes puede hacerse en el propio
dispositivo). A este servidor solo llega el texto, y la interpretación se hace
aquí, sin IA externa. Si prefieres que el audio no salga del servidor, la
alternativa es whisper.cpp en el VPS, como en Brújula: es más privado, pero
tarda unos 12 s por frase.

## Desarrollo local

```bash
npm ci
cp .env.example .env        # y rellena BETTER_AUTH_SECRET
npm run db:migrate
npm run user:create         # pide correo, nombre y contraseña (sin eco)
npm run dev                 # http://localhost:3210
```

Los puertos 8000, 6001, 6002 y 3001 están reservados para el túnel a
Coolify/Kuma: no los uses. El desarrollo usa el 3210 y la prueba del
contenedor, el 127.0.0.1:3211.

Comprobaciones:

```bash
npm run typecheck
npm test
npm run build
```

## Configuración (`.env`)

| Variable | Para qué |
| --- | --- |
| `BETTER_AUTH_URL` | URL pública exacta (en el servidor, `https://…`). También fija el origen aceptado en las mutaciones y activa las cookies `Secure` cuando es https. |
| `BETTER_AUTH_SECRET` | Secreto de sesión. Genéralo con `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. |
| `TRUSTED_ORIGINS` | Orígenes extra separados por comas (opcional). |
| `DATABASE_PATH` | Archivo SQLite. En Docker es `/data/workouts.sqlite`. |
| `APP_TIME_ZONE` | `Atlantic/Canary`. |
| `BACKUP_DIR`, `BACKUP_KEEP` | Carpeta de copias (fuera de la de la base de datos) y cuántas se conservan. |
| `OPENAI_*` | No se usan ahora mismo: la voz y la interpretación no necesitan ninguna clave. Ninguna variable lleva `NEXT_PUBLIC_`, así que no llegan al navegador. |

## Cuenta y contraseña

- Crear la única cuenta: `npm run user:create`. Si ya existe una, se niega.
- Cambiar la contraseña desde el servidor: `npm run user:password`. Cierra también todas las sesiones abiertas.
- En el contenedor: `docker compose exec -it app node scripts/create-user.ts` (o `set-password.ts`).

## Despliegue en astro-vps

**Desplegado el 4-oct-2026** en https://entrenos.wyll-servidor.duckdns.org
(certificado de Let's Encrypt, HTTP → HTTPS, HSTS).

- **Ubicación:** carpeta `/opt/entrenos`, contenedor `entrenos-app`, volumen `entrenos-data` y copias en `/opt/entrenos/backups`.
- **Red:** no publica ningún puerto en el host. Traefik (Coolify) llega a él por la red Docker `coolify` mediante etiquetas en `compose.server.yaml`, como `links-web`. No hay ficheros en `/data/coolify`.
- **`.env` del servidor:** permisos 600 y secreto generado allí. No está en el repositorio ni en el PC.

Actualizar tras cambiar el código (desde la carpeta del proyecto en el PC):

```bash
tar czf - --exclude=./node_modules --exclude=./.next --exclude=./data --exclude=./backups --exclude=./.env --exclude=./.dev-credentials . | ssh astro-vps 'tar xzf - -C /opt/entrenos && chown -R root:root /opt/entrenos && chown 1000:1000 /opt/entrenos/backups'
ssh astro-vps 'cd /opt/entrenos && docker compose -f compose.yaml -f compose.server.yaml up -d --build'
```

Las migraciones se aplican solas antes de arrancar. Si fallan, el contenedor no
se levanta y la versión anterior de los datos queda intacta en el volumen.

Crear la cuenta, o cambiar la contraseña (pide los datos sin eco):

```bash
ssh -t astro-vps "docker exec -it entrenos-app node scripts/create-user.ts"
ssh -t astro-vps "docker exec -it entrenos-app node scripts/set-password.ts"
```

## Copias de seguridad y restauración

La copia usa la API de backup de SQLite, así que es consistente aunque la app
esté escribiendo. Después ejecuta `integrity_check` sobre la copia y borra las
que pasen de `BACKUP_KEEP`.

**Programada desde el 4-oct-2026:** `/etc/cron.d/entrenos-backup` la lanza cada
día a las 05:30 del servidor (Europe/Berlin), que son las 04:30 en Canarias.
Guarda las 7 últimas y deja el registro en `/opt/entrenos/backups/backup.log`.
Para quitarla, borra ese fichero.

```bash
# a mano, en el servidor (escribe en /opt/entrenos/backups, fuera del volumen)
docker exec entrenos-app node scripts/backup.ts
# cron diario sugerido (crontab -e)
# 30 4 * * * docker exec entrenos-app node scripts/backup.ts >> /opt/entrenos/backups/backup.log 2>&1
```

Un volumen persistente no es una copia de seguridad. Copia también
`backups/` fuera del servidor de vez en cuando, por ejemplo con
`scp astro-vps:/opt/entrenos/backups/*.sqlite .`.

**Prueba de restauración** (no toca la base activa):
`node scripts/restore-check.ts backups/workouts-….sqlite` copia el archivo a una
ruta temporal, comprueba la integridad y muestra las últimas series.

**Restauración real:**

```bash
docker compose stop app
docker run --rm -v entrenos-data:/data -v "$PWD/backups:/backups" alpine \
  sh -c 'rm -f /data/workouts.sqlite-wal /data/workouts.sqlite-shm && cp /backups/workouts-XXXX.sqlite /data/workouts.sqlite && chown 1000:1000 /data/workouts.sqlite'
docker compose start app
```

## Decisiones de datos

- El peso se guarda en **gramos enteros** (62,5 kg = 62500), así no se pierden decimales.
- La modalidad de peso (total con barra, por mancuerna o peso corporal) se guarda y se muestra en cada serie. Nunca se multiplica ni se suma la barra por su cuenta. Con peso corporal, el peso es `NULL`, no 0.
- La modalidad se propone a partir de la última serie confirmada de ese ejercicio, y se ve y se puede cambiar. Si el ejercicio es nuevo, hay que elegirla.
- **Guardado idempotente:** cada borrador lleva un `requestId`. Si se repite con el mismo contenido, devuelve lo que ya se guardó. Si se repite con otro contenido, da 409. La solicitud se conserva aunque luego borres las series, para que un reintento antiguo no las recree.
- Solo puede haber una sesión de entrenamiento abierta. Al cerrarla o al crear otra, se borra el ejercicio activo, que es el contexto que heredará el chat.
- Todos los endpoints comprueban la sesión y que el registro sea tuyo. Las mutaciones exigen además que la cabecera `Origin` sea el de la propia app.

## Pruebas de aceptación

| Caso | Resultado | Cómo |
| --- | --- | --- |
| Endpoints sin login (sesiones, historial, ejercicios, series) | ✅ 401; el registro público da 400 | curl |
| Mutación desde otro origen o sin `Origin` | ✅ 403 | curl |
| 62,5 kg en el borrador, la base de datos y el historial | ✅ | navegador + test |
| Borrador incompleto | ✅ no deja guardar e indica qué falta | navegador + test |
| Cancelar borrador / editar 8→7 / borrar con confirmación | ✅ | navegador + test |
| Doble envío simultáneo con el mismo `requestId` | ✅ una sola escritura | navegador (fetch ×2) |
| Reintento tras reiniciar el servidor o recrear el contenedor | ✅ sin duplicar | test + Docker |
| Serie idéntica con otro `requestId` | ✅ se permite | test |
| Otro usuario no ve ni modifica datos ajenos | ✅ | test |
| Cerrar sesión, abrir otra e historial | ✅ se reinicia el contexto y se distinguen las fechas | navegador + test |
| Recrear el contenedor con el mismo volumen | ✅ los datos siguen | Docker local |
| Copia en caliente y prueba de restauración | ✅ integridad ok | local + contenedor |
| Frases del plan (pecho no es ejercicio, 3 series, contexto, 62,5, mancuernas, sin datos) | ✅ | tests + navegador |
| Apunte automático, Deshacer y aclaración con candidatos | ✅ | navegador |
| Endpoints nuevos (`/api/log`, deshacer, ejercicios) sin login u otro origen | ✅ 401 / 403 | curl |
| El catálogo no llega al navegador | ✅ | inspección del build |
| **Dictado real en el móvil (HTTPS)** | ⏳ pendiente: el navegador del PC no dicta | |
