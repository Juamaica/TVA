# TVA NEXUS — Terminal privada de simulación temporal

Simulación inmersiva inspirada en la Time Variance Authority: mapa temporal 3D (Three.js) con la **Sagrada Línea Temporal blanca e "infinita"**, ramas con geometría real, escáner por reglas, expedientes de variantes, **podas cinematográficas con desintegración progresiva**, TemPad, eventos dinámicos con **notificaciones de ramificaciones/eventos Nexus**, modo crisis, misiones, archivo con reproducción y PWA instalable en Android.

> Toda la simulación es ficticia. No hay viajes reales, ni IA remota, ni envío de datos a terceros.

## Estructura

```
src/
  app/                 layout, page, manifest.ts (PWA), globals.css, api/health, api/backup
  components/
    AuthGate.tsx       arranque, registro del propietario, PIN/contraseña, WebAuthn, recuperación
    Shell.tsx          navegación, bloqueo por inactividad, temporizador de eventos, intro del agente
    ControlRoom.tsx    sala de control (modo terminal + modo inmersivo a pantalla completa)
    MapView.tsx        UI del mapa 3D, panel de rama, filtros, crear rama, fallback 2D (Canvas)
    PruneFlow.tsx      poda: selección → autorización → preparación → pulso → desintegración → informe
    Scanner.tsx        escáner secuencial + lista de anomalías con filtros
    Variants.tsx       expedientes con secuencia de reconocimiento, estados, rastreo, notas, creación
    TemPad.tsx         dispositivo con estados reales (idle/init/ready/open/closing)
    Modules.tsx        Eventos, Misiones, Archivo (reproducción), Asistente (reglas), Perfil/credencial
    SettingsView.tsx   sonido, efectos, partículas, seguridad, notificaciones, backup, reinicio
    ui.tsx             primitivas visuales
  lib/
    types.ts           modelo de datos compartido (ramas, variantes, anomalías, eventos, operaciones…)
    seed.ts            mundo inicial y misiones
    simulation.ts      geometría de ramas, integridad, reglas del escáner, generador de eventos, asistente
    storage.ts         IndexedDB (fallback localStorage), migraciones, export/import validado
    auth.ts            PBKDF2-SHA256 + sal única + comparación en tiempo constante; WebAuthn
    audio.ts           Web Audio sintetizado, vibración, notificaciones locales
  three/engine.ts      motor Three.js: línea blanca infinita, tubos, partículas, ondas, raycast, poda
  store/useTVA.ts      estado global (zustand) + acciones consistentes + persistencia
  tests/logic.test.ts  pruebas de lógica (16)   ·  tests/e2e.mjs pruebas Playwright (29)
public/sw.js           service worker (app-shell + caché de estáticos, offline)
public/icons/          iconos 192/512
```

## Ejecutar

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
```
La base de datos PostgreSQL sólo se usa para el endpoint opcional `/api/backup` (copias subidas explícitamente). Todo lo demás vive en IndexedDB del dispositivo.

## Pruebas

```bash
npx tsx src/tests/logic.test.ts                 # reglas del escáner, poda, integridad, eventos, backup, migraciones
npm run build && npm start &                    # servidor en :3000
npx playwright install chromium
node src/tests/e2e.mjs 1 && node src/tests/e2e.mjs 2
```

### Flujos verificados (Chromium headless, 390×780, táctil)
1. Primer inicio y creación de credenciales (PBKDF2, código de recuperación) ✓
2. PIN incorrecto denegado, bloqueo manual, desbloqueo ✓
3. Navegación entre módulos ✓
4. Escaneo que detecta las anomalías reales del modelo (7 en el mundo inicial) y resolución ✓
5. Apertura/edición de expedientes (estado, notas) ✓
6. Mapa con canvas WebGL (geometría generada a partir de los datos) ✓
7. Creación de rama ✓
8. Autorización y cancelación de poda sin cambios ✓
9. Desintegración progresiva ✓ 10. Rama eliminada sólo al terminar ✓ 11. Historial + instantánea + reproducción ✓
12. Línea principal protegida (sin botón, el store rechaza) ✓
13. TemPad abrir/cerrar ✓ 14. Misiones por acciones reales ✓ 15. Activación de modo crisis ✓
16. Persistencia tras recargar / nueva página ✓ 17. Exportación ✓ (importación validada por pruebas de lógica)
18. Sin scroll horizontal a 390 px ✓ 20. Sin errores críticos de consola ✓
19. Offline: service worker con precache y caché de `_next/static` — **no probado en este entorno** (requiere HTTPS + instalación real).
- Resolución de crisis, biometría y notificaciones en Android: lógica implementada, **no verificadas en dispositivo real** (headless no tiene sensor biométrico ni permite notificaciones).

## Instalar en Android (PWA)

1. Despliega en un origen **HTTPS** (Vercel: `vercel`; o cualquier host Node con `npm run build && npm start` tras un proxy TLS). Configura `DATABASE_URL` sólo si quieres el backup remoto.
2. Abre la URL en **Chrome para Android** → menú ⋮ → **"Instalar aplicación"** / "Añadir a pantalla de inicio" (también hay botón "Instalar en Android" en Ajustes cuando Chrome lo permite).
3. Al abrirla desde el icono se ejecuta en `display: fullscreen` (sin barra del navegador). Activa notificaciones en Ajustes → "Notificaciones de ramificaciones / Nexus".

### ¿APK?
**No se ha generado ni probado un APK en este entorno** (no hay Android SDK). Opciones honestas para obtener uno a partir de esta PWA ya desplegada:
- **PWABuilder** (pwabuilder.com): introduce la URL HTTPS → "Android" → genera un APK/AAB (Trusted Web Activity). Se instala con el icono propio y pantalla completa.
- **Bubblewrap** (`npx @bubblewrap/cli init --manifest https://TU-DOMINIO/manifest.webmanifest` → `build`), requiere JDK + Android SDK.
- **Capacitor** si en el futuro quieres Keystore/biometría nativa.

## Seguridad: qué protege y qué no
- Credenciales: PBKDF2-SHA256 (210 000 iteraciones), sal aleatoria por credencial, comparación en tiempo constante, nunca texto plano. Sin contraseñas maestras ni accesos ocultos. Recuperación mediante código de un solo uso mostrado al crear la cuenta.
- Biometría: WebAuthn con autenticador de plataforma (huella/rostro). Es verificación real del dispositivo; sólo se ofrece si `isUserVerifyingPlatformAuthenticatorAvailable()` es cierto y el origen es seguro. Si no, PIN.
- Bloqueo automático por inactividad configurable, bloqueo manual, re-autenticación al volver, PIN exigido para autorizar una poda.
- **Limitación**: en una PWA los datos viven en el almacenamiento del navegador; el PIN protege la interfaz y las acciones, **no cifra IndexedDB** frente a alguien con acceso físico/root. Para eso: bloqueo de pantalla de Android y/o empaquetado nativo con Keystore.

## Notificaciones
Sólo se emiten para sucesos de la simulación (nueva divergencia, evento Nexus, señal de variante, crisis). Son notificaciones locales (`Notification`/`showNotification` vía service worker): funcionan con la app abierta o en segundo plano reciente. **Sin servidor push no hay notificaciones con la app cerrada** — es una limitación de la plataforma, no se simula lo contrario.

## Rendimiento
DPR limitado, modo bajo consumo (menos segmentos, DPR 1), control de partículas, reducción de movimiento, luz de operación pre-creada (sin recompilación de shaders), liberación de contexto WebGL al desmontar, y fallback 2D automático si WebGL no está disponible.

## Solución de problemas
- *Pantalla negra en el mapa*: activa "Modo de bajo consumo" en Ajustes o el fallback 2D se activará solo si WebGL falla.
- *No aparece "Instalar"*: la URL debe ser HTTPS y el manifest/SW deben servirse (comprueba `/manifest.webmanifest` y `/sw.js`).
- *Olvidé el PIN*: "Olvidé mi credencial" → código de recuperación. Sin él, "Reiniciar terminal" borra todo.
- *Cambios no visibles tras desplegar*: el SW usa versión `tva-nexus-v2`; cierra y reabre la app.
