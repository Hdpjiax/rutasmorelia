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
  zoomCommand?: { delta: number; timestamp: number } | null;
  originCoordinates?: { latitude: number; longitude: number } | null;
  destinationCoordinates?: { latitude: number; longitude: number } | null;
};

type RouteFeature = {
  type: "Feature";
  properties: Record<string, unknown> & { color?: string; routeCode?: string };
  geometry:
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "MultiLineString"; coordinates: [number, number][][] };
};

export function MapCanvas({ activeRoute, mapCenter, zoomCommand, originCoordinates, destinationCoordinates }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
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

    function customizeMapStyle(m: Map) {
      // 1. Agua
      if (m.getLayer("water")) m.setPaintProperty("water", "fill-color", "#bae6fd");
      if (m.getLayer("waterway")) m.setPaintProperty("waterway", "line-color", "#bae6fd");

      // 2. Parques (más intensos)
      ["park_national_park", "park_nature_reserve"].forEach((lid) => {
        if (m.getLayer(lid)) {
          m.setPaintProperty(lid, "fill-color", "#bbf7d0"); // Fresh vibrant green
          m.setPaintProperty(lid, "fill-opacity", 0.95);
        }
      });

      // 3. Tren (linea principal destacada, patios de maniobras/servicios tenues)
      if (m.getLayer("rail")) {
        m.setPaintProperty("rail", "line-color", [
          "case",
          ["has", "service"],
          "#cbd5e1",
          "#475569"
        ]);
        m.setPaintProperty("rail", "line-width", [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          ["case", ["has", "service"], 0.8, 1.5],
          14,
          ["case", ["has", "service"], 0.8, 2.8],
          18,
          ["case", ["has", "service"], 0.8, 3.5]
        ]);
      }
      if (m.getLayer("rail_dash")) {
        m.setPaintProperty("rail_dash", "line-color", "#ffffff");
        m.setPaintProperty("rail_dash", "line-width", [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          ["case", ["has", "service"], 0.0, 1.0],
          14,
          ["case", ["has", "service"], 0.0, 2.0],
          18,
          ["case", ["has", "service"], 0.0, 2.5]
        ]);
        m.setPaintProperty("rail_dash", "line-dasharray", [3, 3]);
      }

      // 4. Periferico Paseo de la Republica destacado completo
      const trunkFills = [
        "road_trunk_fill_noramp", "road_mot_fill_noramp", "road_trunk_fill_ramp", "road_mot_fill_ramp",
        "bridge_trunk_fill", "bridge_mot_fill",
        "tunnel_trunk_fill", "tunnel_mot_fill"
      ];
      const trunkCasings = [
        "road_trunk_case_noramp", "road_mot_case_noramp", "road_trunk_case_ramp", "road_mot_case_ramp",
        "bridge_trunk_case", "bridge_mot_case",
        "tunnel_trunk_case", "tunnel_mot_case"
      ];

      trunkFills.forEach((lid) => {
        if (m.getLayer(lid)) {
          m.setPaintProperty(lid, "line-color", "#fed7aa"); // Warm peach fill
        }
      });

      trunkCasings.forEach((lid) => {
        if (m.getLayer(lid)) {
          m.setPaintProperty(lid, "line-color", "#f97316"); // Orange-red outline
          m.setPaintProperty(lid, "line-opacity", 0.9);
        }
      });

      // 5. Calles de la ciudad siempre visibles (estilo Google Maps: gris e inicio de zoom mas bajo)
      const minorFills = [
        "road_minor_fill", "road_service_fill", "road_sec_fill_noramp", "road_pri_fill_noramp",
        "bridge_minor_fill", "bridge_service_fill", "bridge_sec_fill", "bridge_pri_fill",
        "tunnel_minor_fill", "tunnel_service_fill", "tunnel_sec_fill", "tunnel_pri_fill"
      ];
      const minorCasings = [
        "road_minor_case", "road_service_case", "road_sec_case_noramp", "road_pri_case_noramp",
        "bridge_minor_case", "bridge_service_case", "bridge_sec_case", "bridge_pri_case",
        "tunnel_minor_case", "tunnel_service_case", "tunnel_sec_case", "tunnel_pri_case"
      ];

      minorFills.forEach((lid) => {
        if (m.getLayer(lid)) {
          m.setPaintProperty(lid, "line-color", "#ffffff"); // Fills clean white
          if (lid.includes("minor")) {
            m.setPaintProperty(lid, "line-width", ["interpolate", ["linear"], ["zoom"], 10, 0.6, 13, 1.5, 16, 3.2, 18, 5.0]);
          } else if (lid.includes("pri") || lid.includes("sec")) {
            m.setPaintProperty(lid, "line-width", ["interpolate", ["linear"], ["zoom"], 10, 1.0, 13, 2.2, 16, 4.2, 18, 6.5]);
          } else {
            m.setPaintProperty(lid, "line-width", ["interpolate", ["linear"], ["zoom"], 12, 0.6, 15, 1.5, 18, 3.0]);
          }
        }
      });

      minorCasings.forEach((lid) => {
        if (m.getLayer(lid)) {
          m.setPaintProperty(lid, "line-color", "#d4d4d8"); // Google Maps elegant grey
          m.setPaintProperty(lid, "line-opacity", 0.95);
          if (lid.includes("minor")) {
            m.setPaintProperty(lid, "line-width", ["interpolate", ["linear"], ["zoom"], 10, 1.4, 13, 2.8, 16, 5.2, 18, 7.5]);
          } else if (lid.includes("pri") || lid.includes("sec")) {
            m.setPaintProperty(lid, "line-width", ["interpolate", ["linear"], ["zoom"], 10, 1.8, 13, 3.8, 16, 6.2, 18, 9.0]);
          } else {
            m.setPaintProperty(lid, "line-width", ["interpolate", ["linear"], ["zoom"], 12, 1.4, 15, 2.8, 18, 5.0]);
          }
        }
      });

      // 6. Nombres de calles mas visibles
      ["roadname_minor", "roadname_sec", "roadname_pri", "roadname_major"].forEach((lid) => {
        if (m.getLayer(lid)) {
          m.setPaintProperty(lid, "text-color", "#334155");
          m.setPaintProperty(lid, "text-halo-color", "#ffffff");
          m.setPaintProperty(lid, "text-halo-width", 1.8);
        }
      });
    }

    function setupLayers() {
      customizeMapStyle(map);
      loadArrowImage(() => {
        if (!map.getSource("routes")) {
          map.addSource("routes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        }

        // Find the first road name symbol layer to insert route lines underneath labels but above roads
        const roadNameLayers = ["roadname_minor", "roadname_sec", "roadname_pri", "roadname_major"];
        const beforeId = roadNameLayers.find((lid) => map.getLayer(lid));

        if (!map.getLayer("route-lines-casing")) {
          map.addLayer({
            id: "route-lines-casing",
            type: "line",
            source: "routes",
            paint: {
              "line-color": "#111827", // Consistent high-contrast dark border
              "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.0, 14, 3.4, 18, 4.6],
              "line-opacity": 0.95,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          }, beforeId);
        }
        if (!map.getLayer("route-lines")) {
          map.addLayer({
            id: "route-lines",
            type: "line",
            source: "routes",
            paint: {
              "line-color": ["get", "color"],
              "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.0, 14, 1.8, 18, 2.8],
              "line-opacity": 1.0,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          }, beforeId);
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
      el.innerHTML = `<div style="width:26px;height:26px;background:#2563eb;border:4px solid #ffffff;border-radius:50%;box-shadow:0 0 10px rgba(37,99,235,0.8);position:relative;"><div style="position:absolute;top:-4px;left:-4px;width:26px;height:26px;border:4px solid #2563eb;border-radius:50%;animation:location-pulse 2.0s infinite ease-in-out;pointer-events:none;"></div></div>
      <style>@keyframes location-pulse{0%{transform:scale(1);opacity:0.8}100%{transform:scale(2.8);opacity:0}}</style>`;
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([mapCenter.longitude, mapCenter.latitude])
        .addTo(map);
      userMarkerRef.current = marker;
    }
  }, [mapCenter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zoomCommand) return;
    map.easeTo({ zoom: map.getZoom() + zoomCommand.delta, duration: 180 });
  }, [zoomCommand]);

  // Load route GeoJSON from local file and update transfer walks & markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource("routes")) return;

    // Clear old markers
    if (markersRef.current) {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    }

    // Clear old walks
    const walksSource = map.getSource("journey-walks") as maplibregl.GeoJSONSource;
    if (walksSource) walksSource.setData({ type: "FeatureCollection", features: [] });

    // If no route selected, clear the map
    if (!activeRoute) {
      const source = map.getSource("routes") as maplibregl.GeoJSONSource;
      if (source) source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    async function loadRoute() {
      try {
        const routeCodes = activeRoute.split(",");
        const allFeatures: RouteFeature[] = [];

        for (const code of routeCodes) {
          const trimmedCode = code.trim();
          const res = await fetch(`/routes/${trimmedCode}.geojson`, { cache: "no-store" });
          if (!res.ok) continue;
          const data = (await res.json()) as { type: "FeatureCollection"; features: RouteFeature[] };
          if (data.features) {
            allFeatures.push(
              ...data.features.map((f) => ({
                ...f,
                properties: { ...f.properties, routeCode: trimmedCode },
              }))
            );
          }
        }

        if (allFeatures.length === 0) return;

        // Check if there are 2 routes and they have the same color
        let finalFeatures = allFeatures;
        if (routeCodes.length === 2) {
          const firstColor = allFeatures.find((f) => f.properties.routeCode === routeCodes[0])?.properties.color as string | undefined;
          const secondColor = allFeatures.find((f) => f.properties.routeCode === routeCodes[1])?.properties.color as string | undefined;

          if (firstColor && secondColor && firstColor.toLowerCase() === secondColor.toLowerCase()) {
            const newColor = getDistinctColor(secondColor);
            finalFeatures = allFeatures.map((f) => {
              if (f.properties.routeCode === routeCodes[1]) {
                return {
                  ...f,
                  properties: {
                    ...f.properties,
                    color: newColor,
                  },
                };
              }
              return f;
            });
          }
        }

        const map = mapRef.current;
        if (!map || !map.getSource("routes")) return;

        const colored = {
          type: "FeatureCollection",
          features: finalFeatures.map((f) => ({
            ...f,
            properties: {
              ...f.properties,
              casingColor: getContrastCasingColor(f.properties.color || "#FFA500"),
            },
          })),
        };

        const source = map.getSource("routes") as maplibregl.GeoJSONSource;
        if (source) source.setData(colored as Parameters<maplibregl.GeoJSONSource["setData"]>[0]);

        // Fit map bounds to show route
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
        // Draw walking lines and markers if origin & destination coordinates are provided
        if (originCoordinates && destinationCoordinates) {
          const originPoint: [number, number] = [originCoordinates.longitude, originCoordinates.latitude];
          const destPoint: [number, number] = [destinationCoordinates.longitude, destinationCoordinates.latitude];
          const walkFeatures: {
            type: "Feature";
            geometry: { type: "LineString"; coordinates: [number, number][] };
            properties: { type: string };
          }[] = [];

          let pBoard: [number, number];
          let pAlight: [number, number];

          // Add origin and destination pin markers
          const originMarker = new maplibregl.Marker({
            element: createPinMarker("#10b981", "O"),
          })
            .setLngLat(originPoint)
            .addTo(map);
          markersRef.current.push(originMarker);

          const destMarker = new maplibregl.Marker({
            element: createPinMarker("#ef4444", "D"),
          })
            .setLngLat(destPoint)
            .addTo(map);
          markersRef.current.push(destMarker);

          if (routeCodes.length === 1) {
            pBoard = findClosestPoint(finalFeatures, originPoint);
            pAlight = findClosestPoint(finalFeatures, destPoint);

            const walkDistBoard = getDistance(originPoint, pBoard);

            // Add boarding and alighting markers
            const mBoard = new maplibregl.Marker({
              element: createStopMarker("board", `Sube aquí (${Math.round(walkDistBoard)} m)`),
            })
              .setLngLat(pBoard)
              .addTo(map);
            markersRef.current.push(mBoard);

            const mAlight = new maplibregl.Marker({
              element: createStopMarker("alight", "Bájate aquí"),
            })
              .setLngLat(pAlight)
              .addTo(map);
            markersRef.current.push(mAlight);

            // Origin to Board walk
            walkFeatures.push({
              type: "Feature",
              geometry: { type: "LineString", coordinates: [originPoint, pBoard] },
              properties: { type: "walk-origin" },
            });
            // Alight to Destination walk
            walkFeatures.push({
              type: "Feature",
              geometry: { type: "LineString", coordinates: [pAlight, destPoint] },
              properties: { type: "walk-dest" },
            });
          } else if (routeCodes.length === 2) {
            const featuresA = finalFeatures.filter((f) => f.properties.routeCode === routeCodes[0]);
            const featuresB = finalFeatures.filter((f) => f.properties.routeCode === routeCodes[1]);

            pBoard = findClosestPoint(featuresA, originPoint);
            pAlight = findClosestPoint(featuresB, destPoint);
            const { pA: pTransferA, pB: pTransferB } = findClosestPair(featuresA, featuresB);

            const walkDistBoard = getDistance(originPoint, pBoard);
            const transferDist = getDistance(pTransferA, pTransferB);
            const isOverlap = transferDist < 30;

            // Add markers
            const mBoard = new maplibregl.Marker({
              element: createStopMarker("board", `Sube aquí (${Math.round(walkDistBoard)} m)`),
            })
              .setLngLat(pBoard)
              .addTo(map);
            markersRef.current.push(mBoard);

            const mTransferA = new maplibregl.Marker({
              element: createStopMarker("transfer-alight", "Bájate aquí"),
              offset: isOverlap ? [-72, 0] : [0, 0]
            })
              .setLngLat(pTransferA)
              .addTo(map);
            markersRef.current.push(mTransferA);

            const mTransferB = new maplibregl.Marker({
              element: createStopMarker("transfer-board", `Sube aquí (${Math.round(transferDist)} m)`),
              offset: isOverlap ? [72, 0] : [0, 0]
            })
              .setLngLat(pTransferB)
              .addTo(map);
            markersRef.current.push(mTransferB);

            const mAlight = new maplibregl.Marker({
              element: createStopMarker("alight", "Bájate aquí"),
            })
              .setLngLat(pAlight)
              .addTo(map);
            markersRef.current.push(mAlight);

            // Walks
            walkFeatures.push({
              type: "Feature",
              geometry: { type: "LineString", coordinates: [originPoint, pBoard] },
              properties: { type: "walk-origin" },
            });
            walkFeatures.push({
              type: "Feature",
              geometry: { type: "LineString", coordinates: [pTransferA, pTransferB] },
              properties: { type: "walk-transfer" },
            });
            walkFeatures.push({
              type: "Feature",
              geometry: { type: "LineString", coordinates: [pAlight, destPoint] },
              properties: { type: "walk-dest" },
            });
          }

          const walksGeoJSON = { type: "FeatureCollection", features: walkFeatures };
          const wSource = map.getSource("journey-walks") as maplibregl.GeoJSONSource;
          if (wSource) {
            wSource.setData(walksGeoJSON as Parameters<maplibregl.GeoJSONSource["setData"]>[0]);
          } else {
            map.addSource("journey-walks", { type: "geojson", data: walksGeoJSON as Parameters<maplibregl.GeoJSONSource["setData"]>[0] });
            map.addLayer({
              id: "journey-walks-layer",
              type: "line",
              source: "journey-walks",
              paint: {
                "line-color": "#3b82f6",
                "line-width": 3,
                "line-dasharray": [2, 2],
              },
              layout: { "line-cap": "round", "line-join": "round" },
            });
          }
        }
      } catch (err) {
        console.error("Error loading route GeoJSON:", err);
      }
    }
    loadRoute();
  }, [activeRoute, styleVersion, originCoordinates, destinationCoordinates]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} className="map-canvas" role="application" aria-label="Mapa interactivo de rutas de transporte público en Morelia" />
    </div>
  );
}

function getDistance(c1: [number, number], c2: [number, number]): number {
  const [lng1, lat1] = c1;
  const [lng2, lat2] = c2;
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findClosestPoint(features: RouteFeature[], target: [number, number]): [number, number] {
  let minDistance = Infinity;
  let closest: [number, number] = target;

  for (const f of features) {
    const coordsList: [number, number][][] = [];
    if (f.geometry.type === "LineString") {
      coordsList.push(f.geometry.coordinates);
    } else if (f.geometry.type === "MultiLineString") {
      coordsList.push(...f.geometry.coordinates);
    }

    for (const coords of coordsList) {
      for (const c of coords) {
        const dist = getDistance(c, target);
        if (dist < minDistance) {
          minDistance = dist;
          closest = c as [number, number];
        }
      }
    }
  }
  return closest;
}

function findClosestPair(featuresA: RouteFeature[], featuresB: RouteFeature[]): { pA: [number, number]; pB: [number, number] } {
  let minDistance = Infinity;
  let bestA: [number, number] = [0, 0];
  let bestB: [number, number] = [0, 0];

  const listA: [number, number][] = [];
  const listB: [number, number][] = [];

  for (const f of featuresA) {
    if (f.geometry.type === "LineString") listA.push(...f.geometry.coordinates);
    else if (f.geometry.type === "MultiLineString") {
      for (const line of f.geometry.coordinates) listA.push(...line);
    }
  }

  for (const f of featuresB) {
    if (f.geometry.type === "LineString") listB.push(...f.geometry.coordinates);
    else if (f.geometry.type === "MultiLineString") {
      for (const line of f.geometry.coordinates) listB.push(...line);
    }
  }

  for (const pA of listA) {
    for (const pB of listB) {
      const dist = getDistance(pA, pB);
      if (dist < minDistance) {
        minDistance = dist;
        bestA = pA;
        bestB = pB;
      }
    }
  }

  return { pA: bestA, pB: bestB };
}

function createStopMarker(type: "board" | "transfer-alight" | "transfer-board" | "alight", label: string): HTMLDivElement {
  const el = document.createElement("div");
  let bg = "#10b981";
  let icon = "↑";
  
  if (type === "transfer-alight") {
    bg = "#f59e0b";
    icon = "↓";
  } else if (type === "transfer-board") {
    bg = "#f97316";
    icon = "↑";
  } else if (type === "alight") {
    bg = "#ef4444";
    icon = "↓";
  }

  el.innerHTML = `
    <div style="
      background: ${bg};
      color: white;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 8px;
      border-radius: 99px;
      border: 2px solid #ffffff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
      display: flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    ">
      <span style="font-size: 12px; line-height: 1;">${icon}</span>
      <span>${label}</span>
    </div>
  `;
  return el;
}

function createPinMarker(color: string, label: string): HTMLDivElement {
  const el = document.createElement("div");
  el.innerHTML = `
    <div style="
      background: ${color};
      color: white;
      font-family: system-ui, sans-serif;
      font-size: 12px;
      font-weight: bold;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      ${label}
    </div>
  `;
  return el;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const cleanHex = hex.startsWith("#") ? hex : `#${hex}`;
  const r = parseInt(cleanHex.slice(1, 3), 16) / 255;
  const g = parseInt(cleanHex.slice(3, 5), 16) / 255;
  const b = parseInt(cleanHex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  const sFraction = s / 100;
  const lFraction = l / 100;
  const c = (1 - Math.abs(2 * lFraction - 1)) * sFraction;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = lFraction - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (0 <= h && h < 60) { r = c; g = x; b = 0; }
  else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
  else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
  else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
  else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
  else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

  const rHex = Math.round((r + m) * 255).toString(16).padStart(2, "0");
  const gHex = Math.round((g + m) * 255).toString(16).padStart(2, "0");
  const bHex = Math.round((b + m) * 255).toString(16).padStart(2, "0");

  return `#${rHex}${gHex}${bHex}`;
}

function getDistinctColor(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  const newH = (h + 60) % 360;
  const newL = l > 50 ? Math.max(15, l - 25) : Math.min(85, l + 25);
  return hslToHex(newH, s, newL);
}
