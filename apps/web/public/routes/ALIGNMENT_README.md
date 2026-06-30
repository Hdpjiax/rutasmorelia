# Regeneración de rutas

El índice `index.json` quedó vacío para que la web no cargue las geometrías anteriores mientras se rehacen los trazos contra eje vial.

Flujo recomendado para el primer lote:

```bash
npm --prefix apps/api run align:routes -- --input rutastransporte --route "Amarilla 2" --limit 1
```

Variables útiles:

- `OSRM_BASE_URL`: servidor OSRM local o remoto.
- `MATCH_RADIUS_METERS`: radio de búsqueda por punto, por defecto `65`.
- `DENSIFY_METERS`: distancia para densificar KML antes del map-matching, por defecto `18`.

El script escribe:

- `apps/web/public/routes/index.json`
- `apps/web/public/routes/<ruta>.geojson`
- `apps/web/public/routes/ALIGNMENT_REPORT.json`

La geometría se rechaza automáticamente si queda fuera del eje vial según las métricas de validación.
