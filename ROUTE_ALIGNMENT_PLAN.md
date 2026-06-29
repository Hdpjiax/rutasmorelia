# Plan integral de alineación de rutas

## Objetivo y criterio de terminado

Cada línea visible debe seguir el eje de una vialidad de la misma red cartográfica que dibuja el mapa. Web y Android deben recibir una única geometría PostGIS; no se corrige con desplazamientos CSS/MapLibre distintos por plataforma.

Una ruta puede publicarse cuando cumple todo lo siguiente:

- 98 % o más de sus puntos tienen una vía motorizable compatible a menos de 30 m.
- Desplazamiento medio menor de 5 m y percentil 95 menor de 12 m.
- La geometría corregida queda a menos de 0.5 m del eje OSM salvo tramos sin cartografía.
- No aparecen saltos entre calles paralelas, diagonales sobre edificios ni giros que atraviesen una manzana.
- El inicio, final, sentido y longitud permanecen coherentes con el KML/SHP oficial.
- La revisión visual pasa a zoom 16, 18 y 20 tanto en web como en Android.

## Arquitectura de datos reversible

`route_variants.source_geometry` conserva para siempre el KML/SHP original. `route_variants.geometry` contiene la versión publicada sobre carreteras. `alignment_metadata` registra método, cobertura, desplazamientos, tolerancia y versión de la red; `alignment_updated_at` registra la fecha.

La reversión de una ruta es inmediata: copiar `source_geometry` nuevamente a `geometry`. Nunca se vuelve a importar ni se modifica el archivo oficial para corregir la visualización.

## Fases de ejecución

### 1. Inventario y normalización

1. Preferir KML/SHP de `public-archivedwl-571`; usar PDF únicamente si no existe geometría georreferenciada.
2. Transformar EPSG:32614 a EPSG:4326.
3. Rechazar coordenadas fuera de Michoacán, líneas nulas, segmentos duplicados o rutas de menos de 50 puntos.
4. Comparar la importación con el archivo fuente y guardar métricas.

### 2. Congelar una red vial

1. Descargar vías `highway` de OpenStreetMap mediante Overpass.
2. Excluir senderos, ciclovías, escaleras, obras y vías propuestas.
3. Guardar los mosaicos y su fecha en `geo-cache/osm` para que toda la ejecución use el mismo estado de OSM.
4. En producción, usar teselas vectoriales generadas del mismo snapshot OSM. Esto elimina diferencias temporales entre la geometría corregida y el mapa base.

### 3. Map matching sobre grafo conectado

1. Proyectar las coordenadas a metros.
2. Para cada vértice, buscar segmentos viales dentro de 30 m.
3. Generar hasta ocho candidatos por observación y puntuar distancia, dirección y continuidad para evitar calles paralelas o transversales.
4. Conectar cada par de candidatos exclusivamente mediante aristas OSM. Queda prohibido unirlos con una línea recta si pertenecen a vías distintas.
5. Detectar cambios de calzada que exijan un recorrido largo. Si se trata de un retorno en vía dividida, conservar el enlace vial completo; si no existe conexión válida, bloquear la ruta para revisión.
6. Fusionar partes contiguas del KML, eliminar duplicados inversos y descartar fragmentos menores de 15 m.
7. Proyectar cada vértice sobre el eje vial y reconstruir intersecciones usando los nodos reales del grafo.
8. Simplificar sólo 0.25 m; la aplicación móvil solicita como máximo 0.3 m de simplificación adicional.
9. Generar GeoJSON de revisión, reporte JSON y SQL por lotes. El script implementado es `tools/map_match_routes.py`.

### 4. Control automático

Cada ruta obtiene: puntos totales, porcentaje ajustado, desplazamiento medio/máximo, vías OSM utilizadas, transiciones desconectadas, longitud de grafo y puntos finales. Además se muestrea la salida cada 2 m: el máximo permitido entre la línea publicada y una arista OSM es 0.5 m. Se bloquea la publicación si falla cobertura, validez PostGIS, SRID 4326, continuidad o límites de desplazamiento. Los tramos sin vía se envían a revisión manual; no se inventa una carretera.

### 5. Revisión visual

Superponer simultáneamente fuente original, versión ajustada y vialidad. Revisar cruces, retornos, glorietas, carriles separados, puentes y terminales. Las capturas de prueba deben incluir los mismos puntos en web y Android.

### 6. Publicación gradual

1. Publicar primero una ruta piloto.
2. Invalidar cachés y verificar ambos clientes.
3. Publicar lotes de 10 rutas.
4. Medir y revisar cada lote antes del siguiente.
5. Conservar un reporte y una sentencia de reversión por lote.

## Estado actual

- Se eliminó `line-offset` de web y Android.
- Se desactivaron las rutas de demostración `DEV-1..3`.
- El esquema reversible ya está preparado.
- Alberca Gertrudis fue reconstruida con el algoritmo de grafo v3: 3,055/3,055 observaciones cubiertas, 0 transiciones desconectadas, movimiento medio 2.223 m, máximo 19.34 m y geometría PostGIS válida.
- La salida final tiene 535 puntos y 37.19 km. En 18,598 muestras tomadas cada 2 m, la distancia media al eje OSM fue 0.019 m, percentil 95 de 0.11 m y máximo de 0.243 m.
- Los cambios de sentido sobre vías divididas ahora recorren los retornos/enlaces OSM; ya no atraviesan camellones con diagonales.
- Falta ejecutar y aprobar los lotes restantes antes de sustituir las otras 105 geometrías.
