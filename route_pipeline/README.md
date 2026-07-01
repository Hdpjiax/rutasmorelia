# Pipeline local de rutas

El pipeline oficial solo permite procesar `alberca-gertrudis` hasta que la ruta piloto sea aprobada.

```powershell
# Siempre usar el Python que incluye pyvalhalla 3.7.0
.\.venv-valhalla\Scripts\python.exe -m route_pipeline bootstrap-map --pbf C:\datos\morelia.osm.pbf
.\.venv-valhalla\Scripts\python.exe -m route_pipeline build --route alberca-gertrudis
.\.venv-valhalla\Scripts\python.exe -m route_pipeline validate --route alberca-gertrudis
.\.venv-valhalla\Scripts\python.exe -m route_pipeline review --route alberca-gertrudis
.\.venv-valhalla\Scripts\python.exe -m route_pipeline approve --route alberca-gertrudis --reviewer "Nombre" --pdf-reviewed
.\.venv-valhalla\Scripts\python.exe -m route_pipeline publish --route alberca-gertrudis
```

`bootstrap-map` también puede descargar el PBF de México si se omite `--pbf`, pero un extracto PBF de Morelia con margen de 20 km reduce drásticamente el tiempo de construcción.

Para usar un mapa vectorial producido desde el mismo PBF en web, configure:

```powershell
$env:NEXT_PUBLIC_MAP_STYLE_URL='https://mapas.ejemplo.mx/morelia/style.json'
```

La publicación en Supabase requiere `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. La función RPC de la migración solamente puede ejecutarse con `service_role`; nunca coloque esa clave en web o Android.

