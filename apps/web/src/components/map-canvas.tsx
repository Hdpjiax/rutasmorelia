"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map } from "maplibre-gl";

function getContrastCasingColor(hexColor: string): string {
  if (!hexColor) return "#ffffff";
  const cleanHex = hexColor.replace("#", "");
  if (cleanHex.length !== 6) return "#ffffff";
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 155 ? "#222222" : "#ffffff";
}

type MapCanvasProps = {
  activeRoute: string;
  theme: "light" | "dark";
  mapCenter?: { latitude: number; longitude: number; timestamp: number } | null;
};

type RouteFeature = {
  type: "Feature";
  properties: Record<string, unknown> & { color?: string };
  geometry:
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "MultiLineString"; coordinates: [number, number][][] };
};

export function MapCanvas({ activeRoute, mapCenter }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [styleVersion, setStyleVersion] = useState(0);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [-101.194, 19.702],
      zoom: 13.3,
      minZoom: 10,
      maxZoom: 19,
      attributionControl: false,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    function loadArrowImage(callback: () => void) {
      if (map.hasImage("route-arrow-icon")) { callback(); return; }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><polygon points="6,7 26,16 6,25" fill="#ffffff" stroke="#000000" stroke-width="3" stroke-linejoin="round"/></svg>`;
      const img = new Image(32, 32);
      img.onload = () => {
        if (!map.hasImage("route-arrow-icon")) map.addImage("route-arrow-icon", img);
        callback();
      };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    }

    function setupLayers() {
      loadArrowImage(() => {
        if (!map.getSource("routes")) {
          map.addSource("routes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        }

        if (!map.getLayer("route-lines-casing")) {
          map.addLayer({
            id: "route-lines-casing",
            type: "line",
            source: "routes",
            paint: {
              "line-color": ["get", "casingColor"],
              "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.2, 14, 4.0, 18, 5.0],
              "line-opacity": 0.95,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
        }
        if (!map.getLayer("route-lines")) {
          map.addLayer({
            id: "route-lines",
            type: "line",
            source: "routes",
            paint: {
              "line-color": ["get", "color"],
              "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 14, 2.2, 18, 3.2],
              "line-opacity": 1.0,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
        }
        if (!map.getLayer("route-arrows")) {
          map.addLayer({
            id: "route-arrows",
            type: "symbol",
            source: "routes",
            layout: {
              "symbol-placement": "line",
              "symbol-spacing": ["interpolate", ["linear"], ["zoom"], 10, 90, 14, 130, 18, 180],
              "icon-image": "route-arrow-icon",
              "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.55, 14, 0.75, 18, 1.0],
              "icon-allow-overlap": false,
              "icon-ignore-placement": false,
              "icon-padding": 12,
            },
          });
        }
        if (!map.getLayer("route-text-labels")) {
          map.addLayer({
            id: "route-text-labels",
            type: "symbol",
            source: "routes",
            layout: {
              "symbol-placement": "line",
              "symbol-spacing": ["interpolate", ["linear"], ["zoom"], 10, 180, 14, 240, 18, 320],
              "text-field": ["get", "name"],
              "text-size": ["interpolate", ["linear"], ["zoom"], 10, 8.5, 14, 10.5, 18, 12.5],
              "text-keep-upright": true,
              "text-allow-overlap": false,
              "text-ignore-placement": false,
            },
            paint: {
              "text-color": ["get", "color"],
              "text-halo-color": ["get", "casingColor"],
              "text-halo-width": 2.0,
              "text-opacity": 0.9,
            },
          });
        }
      });
    }

    map.on("load", () => { setupLayers(); setStyleVersion((v) => v + 1); });
    map.on("styledata", () => {
      if (map.isStyleLoaded()) { setupLayers(); setStyleVersion((v) => v + 1); }
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Center map on user location
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!mapCenter) {
      if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }
      return;
    }
    map.flyTo({ center: [mapCenter.longitude, mapCenter.latitude], zoom: 16, essential: true });
    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([mapCenter.longitude, mapCenter.latitude]);
    } else {
      const el = document.createElement("div");
      el.innerHTML = `<div style="width:18px;height:18px;background:#3b82f6;border:3px solid #ffffff;border-radius:50%;box-shadow:0 0 8px rgba(59,130,246,0.8);position:relative;"><div style="position:absolute;top:-3px;left:-3px;width:18px;height:18px;border:3px solid #3b82f6;border-radius:50%;animation:location-pulse 1.8s infinite ease-in-out;pointer-events:none;"></div></div>
      <style>@keyframes location-pulse{0%{transform:scale(1);opacity:0.8}100%{transform:scale(2.4);opacity:0}}</style>`;
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([mapCenter.longitude, mapCenter.latitude])
        .addTo(map);
      userMarkerRef.current = marker;
    }
  }, [mapCenter]);

  // Load route GeoJSON from local file
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource("routes")) return;

    // If no route selected, clear the map
    if (!activeRoute) {
      const source = map.getSource("routes") as maplibregl.GeoJSONSource;
      if (source) source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    async function loadRoute() {
      try {
        const res = await fetch(`/routes/${activeRoute}.geojson`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { type: "FeatureCollection"; features: RouteFeature[] };
        if (!data.features || data.features.length === 0) return;

        const map = mapRef.current;
        if (!map || !map.getSource("routes")) return;

        const colored = {
          ...data,
          features: data.features.map((f) => ({
            ...f,
            properties: {
              ...f.properties,
              casingColor: getContrastCasingColor(f.properties.color || "#FFA500"),
            },
          })),
        };

        const source = map.getSource("routes") as maplibregl.GeoJSONSource;
        if (source) source.setData(colored);

        const allCoords: [number, number][] = [];
        for (const f of colored.features) {
          if (f.geometry.type === "LineString") {
            for (const c of f.geometry.coordinates) allCoords.push(c);
          } else if (f.geometry.type === "MultiLineString") {
            for (const line of f.geometry.coordinates) for (const c of line) allCoords.push(c);
          }
        }
        if (allCoords.length > 0) {
          const bounds = allCoords.reduce(
            (acc: maplibregl.LngLatBounds, coord: [number, number]) => acc.extend(coord),
            new maplibregl.LngLatBounds(allCoords[0], allCoords[0])
          );
          map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
        }
      } catch (err) {
        console.error("Error loading route GeoJSON:", err);
      }
    }

    loadRoute();
  }, [activeRoute, styleVersion]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} className="map-canvas" role="application" aria-label="Mapa interactivo de rutas de transporte público en Morelia" />
    </div>
  );
}
