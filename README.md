# Rutas Morelia

Plataforma web y móvil para consultar, planificar y navegar el transporte público de Morelia.

## Estructura

- `apps/web`: Next.js 16, React 19, TypeScript, Tailwind CSS 4, Motion y MapLibre GL.
- `apps/api`: NestJS 11, TypeORM y endpoints geoespaciales.
- `apps/mobile`: Expo 56, React Native y MapLibre Native.
- `infra/database/migrations`: esquema PostgreSQL/PostGIS versionado.
- `compose.yaml`: PostGIS, API y web para desarrollo reproducible.
- `PRODUCT.md` y `DESIGN.md`: contexto estratégico y sistema visual.

## Inicio local

Requisitos: Node.js 24 y npm 11. Docker es opcional para frontend, pero necesario para ejecutar PostGIS y la API completa.

```bash
npm run dev:web
npm run dev:api
npm run dev:mobile
```

La web queda en `http://localhost:3000`, la API en `http://localhost:4000/v1` y Swagger en `http://localhost:4000/docs`.

Para levantar la infraestructura completa:

```bash
docker compose up --build
```

## Verificación

```bash
npm run check
```

## Mapas móviles

MapLibre React Native contiene código nativo. La aplicación móvil requiere un development build de Expo y no funciona dentro de Expo Go. El estilo `demotiles.maplibre.org` es solamente para desarrollo; producción deberá servir un estilo propio o contratar un proveedor de mosaicos compatible.

## Estado actual

- MVP web responsive con mapa OSM, rutas, paradas, búsqueda, geolocalización, tema claro/oscuro y estados accesibles.
- API base con catálogo de rutas y búsqueda de paradas cercanas mediante `ST_DWithin`.
- Esquema PostGIS para ciudades, rutas, segmentos, paradas, colonias, lugares, usuarios, historial, favoritos y telemetría GPS futura.
- Aplicación Expo con la misma experiencia principal e integración MapLibre nativa.

Siguientes bloques: autenticación JWT/OAuth, importación de datos oficiales, conexión web/móvil con la API, ruteo OpenRouteService, pruebas de integración y observabilidad.
