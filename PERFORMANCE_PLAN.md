# Plan de rendimiento de ViaMorelia

## Objetivos

- Respuesta visual al toque: menos de 100 ms.
- Ruta visible: P95 menor a 800 ms en red móvil y menor a 200 ms desde caché.
- Primer resultado de búsqueda local: menor a 300 ms.
- Planificación de viaje: P95 menor a 1.2 s.
- Menú de 100+ rutas: desplazamiento estable a 60 FPS.
- Inicio interactivo en dispositivo medio: menor a 1.5 s con caché caliente.

## Línea base encontrada

- Todas las selecciones consultaban `/rest/v1/variants`, recurso inexistente: HTTP 404.
- La tabla correcta, `route_variants`, responde en PostgreSQL en aproximadamente 0.14 ms.
- Las geometrías originales promedian 31.6 KB y alcanzan 180 KB.
- El planificador devolvía 106 opciones y tardó 1.49 s en la medición inicial.
- La búsqueda dependía de geocodificación externa y tardó aproximadamente 0.95 s.
- Las 109 rutas se montaban simultáneamente dentro de un `ScrollView`.

## Fase 1: correcciones aplicadas

- Sustituir la consulta rota por `get_route_geometry`.
- Simplificar geometrías en servidor con tolerancia aproximada de 2 m.
- Cancelar solicitudes obsoletas al cambiar rápidamente de ruta.
- Mantener una caché en memoria de las últimas 12 geometrías.
- Persistir el catálogo de rutas durante 24 horas con `AsyncStorage`.
- Virtualizar el menú con `FlatList` y lotes pequeños.
- Mostrar estado explícito de carga/error y permitir reintento.
- Ejecutar en paralelo las tres consultas espaciales del planificador.
- Ordenar y limitar el planificador a las 20 mejores opciones.
- Ejecutar búsqueda local y geocodificación externa en paralelo.
- Cachear las últimas 20 búsquedas durante la sesión.

## Resultados medidos

- Geometría de ruta: HTTP 200; 616 ms en primera conexión y 147 ms caliente.
- Ruta de prueba: 11.5 KB después de simplificación.
- Promedio estimado de geometría: 31.6 KB a 9.9 KB, reducción cercana al 69%.
- Planificador: 1.49 s a 1.05 s en la muestra, mejora aproximada del 29%.
- Opciones del planificador: 106 a 20, reducción del 81%.
- Respuesta del planificador optimizado: 4.7 KB.

## Fase 2: observabilidad y búsqueda progresiva

1. Registrar duración de inicio, carga de catálogo, búsqueda, planificación y dibujo de ruta.
2. Enviar percentiles P50/P95 y errores por tipo de red y modelo de dispositivo.
3. Mantener los resultados locales como primera respuesta y enriquecerlos después con OSM.
4. Añadir cancelación real a geocodificación y planificación cuando cambia la entrada.
5. Objetivo de salida: primera sugerencia local menor a 300 ms y cero resultados obsoletos.

## Fase 3: mapa y modo sin conexión

1. Ajustar tolerancia de geometría según nivel de zoom y densidad de pantalla.
2. Prefetch sólo de la siguiente ruta probable, nunca del catálogo completo.
3. Guardar de forma persistente las rutas consultadas recientemente con límite de tamaño.
4. Mostrar el último recorrido válido cuando la red esté degradada.
5. Evaluar un estilo de mapa alojado cerca de los usuarios y caché de teselas permitida por licencia.

## Fase 4: inicio y navegación

1. Medir tiempo de inicialización de MapLibre, Supabase Auth y navegación por separado.
2. Evitar que la restauración de sesión bloquee el mapa o el catálogo local.
3. Cargar pantallas no críticas, como cuenta, después del primer frame interactivo.
4. Revisar tamaño del bundle Android/iOS y eliminar dependencias o iconos no utilizados.
5. Perfilar memoria al abrir/cerrar el drawer y cambiar 30 rutas consecutivas.

## Fase 5: validación de producción

1. Probar Android de gama media/baja e iPhone con red 3G/4G limitada.
2. Repetir selección rápida, pérdida de red, retorno desde segundo plano y caché vencida.
3. Bloquear regresiones con pruebas de interacción y umbrales P95 en telemetría.
4. Revisar mensualmente los asesores de seguridad/rendimiento de Supabase.
5. No eliminar índices señalados como “sin uso” hasta contar con tráfico representativo.
