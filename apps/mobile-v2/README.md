# Rutas Morelia — mobile-v2

App Android nativa (Expo Dev Client + MapLibre) para transporte público en Morelia. Identidad visual urbana/nocturna, distinta de la web y de `apps/mobile`.

## Requisitos (Windows)

| Herramienta | Versión |
|-------------|---------|
| Node.js | >= 22.11 |
| JDK | 17+ (recomendado: Eclipse Temurin 17) |
| Android SDK | API 35+, Build-Tools 35+ |
| Android Studio | Para emulador y SDK Manager |

### Variables de entorno

```powershell
# Ejemplo — ajusta rutas según tu instalación
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.13.11-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH += ";$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator"
```

Verifica:

```powershell
node -v
java -version
adb version
```

## Instalación

Desde la **raíz del monorepo**:

```bash
npm install
npm run build:transit-core
```

Copia variables de entorno:

```bash
cp apps/mobile-v2/.env.example apps/mobile-v2/.env
# Edita EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY si tienes Supabase
```

> Sin Supabase la app funciona con fallbacks: Photon para búsqueda, catálogo CDN/fallback local para rutas, favoritos en AsyncStorage.

## Desarrollo

**Primera vez (build nativo — MapLibre requiere Dev Client, no Expo Go):**

```bash
npm run android -w mobile-v2
```

**Sesiones siguientes (Metro + Dev Client ya instalado):**

```bash
npm run dev:mobile-v2
```

Atajos desde la raíz:

| Script | Acción |
|--------|--------|
| `npm run dev:mobile-v2` | `expo start --dev-client` |
| `npm run android:mobile-v2` | `expo run:android` |

## Arquitectura

```
src/
  theme/          # Tokens dark-first + ThemeProvider
  services/       # Rutas, GeoJSON, búsqueda, viaje, favoritos (testeables)
  stores/         # Zustand: transit, favorites, ui
  hooks/          # Mapa, ubicación, búsqueda, viaje
  components/
    map/          # MapLibre, capas de ruta, marcadores
    sheets/       # Gorhom bottom sheet (búsqueda, rutas, viaje, favoritos)
    ui/           # Glass panels, chips, skeletons
  screens/        # HomeScreen (mapa protagonista)
```

Persistencia preparada para SQLite: `services/storage/storage.interface.ts` define `OfflineCapableStorage`; hoy usa `async-storage.adapter.ts`.

## Troubleshooting Windows

### `JAVA_HOME is not set`
Instala JDK 17 y define `$env:JAVA_HOME` apuntando a la carpeta del JDK (no `bin`).

### `SDK location not found`
Crea `apps/mobile-v2/android/local.properties`:

```
sdk.dir=C\:\\Users\\TU_USUARIO\\AppData\\Local\\Android\\Sdk
```

(o deja que `expo prebuild` lo genere tras `expo run:android`).

### Metro no resuelve `@rutas-morelia/transit-core`
Ejecuta `npm run build:transit-core` desde la raíz.

### Conflicto de React con `apps/web`
El `metro.config.js` bloquea `apps/web/node_modules`. No elimines esa regla.

### MapLibre en blanco
- Usa **Dev Client** compilado (`expo run:android`), no Expo Go.
- Revisa permisos de ubicación en el emulador/dispositivo.

## Tests

```bash
npm run test -w mobile-v2
npm run typecheck -w mobile-v2
```

## Verificación en CI / sin Android SDK

En entornos sin Android SDK/JDK configurado, la verificación válida es:

1. `npm install` + `npm run build:transit-core`
2. `npm run typecheck -w mobile-v2`
3. `npm run test -w mobile-v2` (servicios de rutas, búsqueda, viaje, geometría, favoritos)
4. `npm run dev:mobile-v2` — confirma que **Metro Bundler** arranca (`Waiting on http://localhost:8081` o puerto alterno)

`npm run dev:mobile-v2` **no** compila ni ejecuta el binario Android; eso requiere `npm run android -w mobile-v2` con emulador/dispositivo y SDK instalados. Un arranque exitoso de Metro indica que el entry point JS/TS resuelve dependencias del monorepo sin error fatal.