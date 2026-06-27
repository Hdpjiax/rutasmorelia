"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map } from "maplibre-gl";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// Highly vibrant, rich transit colors for mock fallbacks
const DEFAULT_ROUTES = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      properties: { id: "1", color: "#2e7d32" }, // Vibrant Emerald Green
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [-101.215, 19.704],
          [-101.207, 19.701],
          [-101.198, 19.7],
          [-101.191, 19.703],
          [-101.183, 19.708],
          [-101.176, 19.713],
        ],
      },
    },
    {
      type: "Feature" as const,
      properties: { id: "2", color: "#e64a19" }, // Vibrant Orange-Red
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [-101.205, 19.718],
          [-101.201, 19.711],
          [-101.198, 19.703],
          [-101.194, 19.695],
          [-101.189, 19.688],
        ],
      },
    },
    {
      type: "Feature" as const,
      properties: { id: "3", color: "#0091ea" }, // Vibrant Sky Blue
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [-101.225, 19.692],
          [-101.214, 19.695],
          [-101.202, 19.699],
          [-101.191, 19.703],
          [-101.181, 19.698],
        ],
      },
    },
  ],
};

const EMPTY_ROUTES_GEOJSON = {
  type: "FeatureCollection" as const,
  features: [],
};

type MapCanvasProps = {
  activeRoute: string;
  theme: "light" | "dark";
  mapCenter?: { latitude: number; longitude: number; timestamp: number } | null;
};

// Computes optimal contrast casing color for routes based on luminance (YIQ)
// Yellow/light routes get a dark casing; dark routes get a white casing
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

export function MapCanvas({ activeRoute, mapCenter }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const activeRouteGeoJSONRef = useRef<any>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [styleVersion, setStyleVersion] = useState(0);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Use light neutral Positron GL style (gray/white basemap to make colored routes POP)
    const styleUrl = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [-101.194, 19.702],
      zoom: 13.3,
      minZoom: 10,
      maxZoom: 19,
      attributionControl: false,
      style: styleUrl,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    // Dynamically loads a custom SVG arrow into the map's sprites
    function loadArrowImage(callback: () => void) {
      if (map.hasImage("route-arrow-icon")) {
        callback();
        return;
      }

      // Sleek, modern solid white navigation triangle with a black border
      // Long, sharp aspect ratio (20px width vs 18px height) with rounded corners for premium feel
      const svgString = `
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
          <polygon points="6,7 26,16 6,25" fill="#ffffff" stroke="#000000" stroke-width="3" stroke-linejoin="round"/>
        </svg>
      `;

      const img = new Image(32, 32);
      img.onload = () => {
        if (!map.hasImage("route-arrow-icon")) {
          map.addImage("route-arrow-icon", img);
        }
        callback();
      };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
    }

    // Helper to safely register/re-add route layers and sources
    function setupRouteLayers() {
      loadArrowImage(() => {
        if (!map.getSource("routes")) {
          map.addSource("routes", { type: "geojson", data: EMPTY_ROUTES_GEOJSON });
        }

        // 1. Bold casing layer for high contrast and sharp borders (swaps to dark for light route colors)
        if (!map.getLayer("route-lines-casing")) {
          map.addLayer({
            id: "route-lines-casing",
            type: "line",
            source: "routes",
            paint: {
              "line-color": ["get", "casingColor"],
              "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10, 3.8, // Bold, robust border casing
                14, 5.8,
                18, 9.0,
              ],
              "line-opacity": 0.95,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
        }

        // 2. Core route line (significantly thickened for maximum color pop and richness)
        if (!map.getLayer("route-lines")) {
          map.addLayer({
            id: "route-lines",
            type: "line",
            source: "routes",
            paint: {
              "line-color": ["get", "color"],
              "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10, 1.8, // Thickened core line
                14, 3.4,
                18, 6.0,
              ],
              "line-opacity": 1.0,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
        }

        // 3. Directional arrow icons layer (crisp solid white triangle arrows pointing along the street segments)
        if (!map.getLayer("route-arrows")) {
          map.addLayer({
            id: "route-arrows",
            type: "symbol",
            source: "routes",
            layout: {
              "symbol-placement": "line",
              "symbol-spacing": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10, 90,
                14, 130,
                18, 180,
              ],
              "icon-image": "route-arrow-icon",
              "icon-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10, 0.55,
                14, 0.75,
                18, 1.0,
              ],
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
            },
          });
        }

        // 4. Route variant names label layer (aligned nicely along the streets, kept upright)
        if (!map.getLayer("route-text-labels")) {
          map.addLayer({
            id: "route-text-labels",
            type: "symbol",
            source: "routes",
            layout: {
              "symbol-placement": "line",
              "symbol-spacing": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10, 180,
                14, 240,
                18, 320,
              ],
              "text-field": ["get", "name"],
              "text-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10, 8.5,
                14, 10.5,
                18, 12.5,
              ],
              "text-keep-upright": true, // Kept readable (never upside down)
              "text-allow-overlap": false,
              "text-ignore-placement": false,
            },
            paint: {
              "text-color": ["get", "color"], // Matches the colored route theme
              "text-halo-color": ["get", "casingColor"], // Swaps halo color for legibility
              "text-halo-width": 2.0,
              "text-opacity": 0.9,
            },
          });
        }

        // If we already have a loaded route geometry in cache, restore it immediately
        if (activeRouteGeoJSONRef.current) {
          const source = map.getSource("routes") as maplibregl.GeoJSONSource;
          if (source) {
            source.setData(activeRouteGeoJSONRef.current);
          }
        }
      });
    }

    map.on("load", () => {
      setupRouteLayers();
      setStyleVersion((v) => v + 1);
    });

    map.on("styledata", () => {
      if (map.isStyleLoaded()) {
        setupRouteLayers();
        setStyleVersion((v) => v + 1);
      }
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Center map and add/update marker on mapCenter change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!mapCenter) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      return;
    }

    map.flyTo({
      center: [mapCenter.longitude, mapCenter.latitude],
      zoom: 16,
      essential: true,
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([mapCenter.longitude, mapCenter.latitude]);
    } else {
      const el = document.createElement("div");
      el.innerHTML = `
        <style>
          @keyframes location-pulse {
            0% { transform: scale(1); opacity: 0.8; }
            100% { transform: scale(2.4); opacity: 0; }
          }
        </style>
        <div style="
          width: 18px;
          height: 18px;
          background: #3b82f6;
          border: 3px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 8px rgba(59, 130, 246, 0.8);
          position: relative;
        ">
          <div style="
            position: absolute;
            top: -3px;
            left: -3px;
            width: 18px;
            height: 18px;
            border: 3px solid #3b82f6;
            border-radius: 50%;
            animation: location-pulse 1.8s infinite ease-in-out;
            pointer-events: none;
          "></div>
        </div>
      `;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([mapCenter.longitude, mapCenter.latitude])
        .addTo(map);
      userMarkerRef.current = marker;
    }
  }, [mapCenter]);

  // Load/update route variant geometry
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource("routes")) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      // Fallback for default local dev mock routes
      const feature = DEFAULT_ROUTES.features.find((f) => f.properties.id === activeRoute);
      if (feature) {
        const routeColor = feature.properties.color;
        const geojson = {
          type: "FeatureCollection" as const,
          features: [
            {
              ...feature,
              properties: {
                ...feature.properties,
                name: feature.properties.id === "3" ? "Villas - Centro" : "Ruta " + feature.properties.id,
                casingColor: getContrastCasingColor(routeColor),
              },
            },
          ],
        };
        activeRouteGeoJSONRef.current = geojson;
        const source = map.getSource("routes") as maplibregl.GeoJSONSource;
        if (source) source.setData(geojson);
      }
      return;
    }

    const client = supabase;
    const activeMap = map;

    async function loadRouteGeometry() {
      if (!activeMap) return;
      // Look up route variant geometry with name for direction labels
      const { data, error } = await client
        .from("route_variants")
        .select("geometry, route_id, name, routes(color)")
        .eq("route_id", activeRoute)
        .eq("is_active", true)
        .limit(1);

      if (error) {
        console.error("Error loading route variant geometry:", error);
        return;
      }

      if (data && data.length > 0) {
        const variant = data[0];
        const routeColor = Array.isArray(variant.routes)
          ? (variant.routes[0]?.color || "#FFA500")
          : ((variant.routes as any)?.color || "#FFA500");

        const geojson = {
          type: "FeatureCollection" as const,
          features: [
            {
              type: "Feature" as const,
              properties: {
                id: String(activeRoute),
                color: routeColor,
                name: variant.name || "Principal",
                casingColor: getContrastCasingColor(routeColor),
              },
              geometry: variant.geometry as any,
            },
          ],
        };

        activeRouteGeoJSONRef.current = geojson;
        const source = activeMap.getSource("routes") as maplibregl.GeoJSONSource;
        if (source) {
          source.setData(geojson);

          // Fit bounds to show the entire route
          if (variant.geometry && variant.geometry.coordinates && variant.geometry.coordinates.length > 0) {
            const coords = variant.geometry.coordinates;
            const flatCoords = (variant.geometry as any).type === "MultiLineString"
              ? coords.flat(1)
              : coords;
            if (flatCoords.length > 0) {
              const bounds = flatCoords.reduce(
                (acc: any, coord: any) => acc.extend(coord),
                new maplibregl.LngLatBounds(flatCoords[0], flatCoords[0])
              );
              activeMap.fitBounds(bounds, { padding: 40, maxZoom: 15 });
            }
          }
        }
      }
    }

    loadRouteGeometry();
  }, [activeRoute, styleVersion]);

  return (
    <div
      ref={containerRef}
      className="map-canvas"
      role="application"
      aria-label="Mapa interactivo de rutas de transporte público en Morelia"
    />
  );
}
