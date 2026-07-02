"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  BusIcon,
  CarProfileIcon,
  CrosshairIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";
import { MapCanvas } from "./map-canvas";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { AuthMenu } from "./auth-menu";

type RouteData = {
  id: string;
  name: string;
  color: string;
  transportType: string;
  geojsonFile: string;
};

type PlaceSuggestion = {
  entity_id: number | string;
  label: string;
  subtitle?: string;
  latitude: number;
  longitude: number;
};

type JourneyOption = {
  route_id: number | string;
  route_code?: string;
  route_name: string;
  route_color?: string;
  second_route_id?: number | string;
  second_route_code?: string;
  second_route_name?: string;
  second_route_color?: string;
  origin_walk_meters?: number;
  destination_walk_meters?: number;
  transfer_walk_meters?: number;
  transfers?: number;
  estimatedMinutes?: number;
};

type Coordinates = { latitude: number; longitude: number };

type FavoriteItem = {
  id: string | number;
  route_id?: string | number | null;
  place_id?: string | number | null;
  custom_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  place?: {
    id: string | number;
    name: string;
    location: any;
  } | null;
};

function isCombi(route: RouteData) {
  const type = route.transportType.toLocaleLowerCase("es-MX");
  return type.includes("combi") || type.includes("microbus") || type.includes("microbús");
}

function contrastColor(hex: string) {
  const value = hex.replace("#", "");
  if (value.length !== 6) return "#fff";
  const [r, g, b] = [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 >= 155 ? "#111" : "#fff";
}

function normalizeString(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else {
        if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) {
      costs[s2.length] = lastValue;
    }
  }
  return costs[s2.length];
}

function stringSimilarity(s1: string, s2: string): number {
  let longer = s1;
  let shorter = s2;
  if (s1.length < s2.length) {
    longer = s2;
    shorter = s1;
  }
  const longerLength = longer.length;
  if (longerLength === 0) {
    return 1.0;
  }
  return (longerLength - editDistance(longer, shorter)) / longerLength;
}

function BrandMark() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" aria-hidden="true">
      <path d="M15 80V40C15 22 42 22 42 40V80" stroke="#2563eb" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 80V40C42 22 69 22 69 40V80" stroke="#059669" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="42" cy="55" r="7" fill="#fff" stroke="#111827" strokeWidth="4" />
    </svg>
  );
}

export function TransitApp() {
  const reducedMotion = useReducedMotion();
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [routeQuery, setRouteQuery] = useState("");
  const [transportFilter, setTransportFilter] = useState<"all" | "combi" | "camion" | "fav">("all");
  const [activeRoute, setActiveRoute] = useState("");
  const [routesOpen, setRoutesOpen] = useState(false);
  const [activeSearch, setActiveSearch] = useState<"origin" | "destination" | null>(null);
  const [origin, setOrigin] = useState("Mi ubicación");
  const [destination, setDestination] = useState("");
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number; timestamp: number } | null>(null);
  const [originCoordinates, setOriginCoordinates] = useState<Coordinates | null>(null);
  const [destinationCoordinates, setDestinationCoordinates] = useState<Coordinates | null>(null);
  const [zoomCommand, setZoomCommand] = useState<{ delta: number; timestamp: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [hasSearchedPlaces, setHasSearchedPlaces] = useState(false);
  const [journeyOptions, setJourneyOptions] = useState<JourneyOption[]>([]);
  const [isPlanningJourney, setIsPlanningJourney] = useState(false);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from("favorites").select("*, place:places(id, name, location)").then(({ data, error }) => {
          if (!error && data) setFavorites(data);
        });
      } else {
        const stored = localStorage.getItem("local_favorites");
        if (stored) setFavorites(JSON.parse(stored));
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        supabase.from("favorites").select("*, place:places(id, name, location)").then(({ data, error }) => {
          if (!error && data) setFavorites(data);
        });
      } else {
        const stored = localStorage.getItem("local_favorites");
        setFavorites(stored ? JSON.parse(stored) : []);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const toggleRouteFavorite = useCallback(async (routeId: string | number) => {
    const supabase = getSupabaseBrowserClient();
    const existing = favorites.find((f) => String(f.route_id) === String(routeId));
    
    if (existing) {
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("favorites").delete().eq("id", existing.id);
        }
      }
      const updated = favorites.filter((f) => String(f.route_id) !== String(routeId));
      setFavorites(updated);
      localStorage.setItem("local_favorites", JSON.stringify(updated));
      setMessage("Ruta eliminada de favoritos");
    } else {
      let newFav: FavoriteItem = { id: "local_" + Date.now(), route_id: routeId };
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Find route id from name/code
          const { data: routeData } = await supabase.from("routes").select("id").eq("code", String(routeId)).limit(1);
          const rId = routeData?.[0]?.id || (typeof routeId === "number" ? routeId : null);
          if (rId) {
            const { data, error } = await supabase
              .from("favorites")
              .insert({ user_id: user.id, route_id: rId })
              .select()
              .single();
            if (!error && data) newFav = data;
          }
        }
      }
      const updated = [...favorites, newFav];
      setFavorites(updated);
      localStorage.setItem("local_favorites", JSON.stringify(updated));
      setMessage("Ruta guardada en favoritos");
    }
  }, [favorites]);

  const togglePlaceFavorite = useCallback(async (label: string, lat: number, lon: number) => {
    const supabase = getSupabaseBrowserClient();
    const existing = favorites.find((f) => f.custom_name === label || (f.place && f.place.name === label));
    
    if (existing) {
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("favorites").delete().eq("id", existing.id);
        }
      }
      const updated = favorites.filter((f) => f.custom_name !== label && (!f.place || f.place.name !== label));
      setFavorites(updated);
      localStorage.setItem("local_favorites", JSON.stringify(updated));
      setMessage("Lugar eliminado de favoritos");
    } else {
      let newFav: FavoriteItem = { id: "local_" + Date.now(), custom_name: label, latitude: lat, longitude: lon };
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: placeData, error: placeError } = await supabase
            .from("places")
            .insert({
              city_id: 1,
              name: label,
              category: "Favorito",
              address: "Morelia, Michoacán",
              location: `POINT(${lon} ${lat})`
            })
            .select("id")
            .single();
            
          if (!placeError && placeData) {
            const { data, error } = await supabase
              .from("favorites")
              .insert({
                user_id: user.id,
                place_id: placeData.id,
                custom_name: label
              })
              .select("*, place:places(id, name, location)")
              .single();
            if (!error && data) newFav = data;
          }
        }
      }
      const updated = [...favorites, newFav];
      setFavorites(updated);
      localStorage.setItem("local_favorites", JSON.stringify(updated));
      setMessage("Lugar guardado en favoritos");
    }
  }, [favorites]);

  useEffect(() => {
    fetch("/routes/index.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => setRoutes(data.routes ?? []))
      .catch(() => setMessage("No fue posible cargar las rutas."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!routesOpen) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setRoutesOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [routesOpen]);

  useEffect(() => {
    if (!activeSearch) return;
    const query = (activeSearch === "origin" ? origin : destination).trim();
    if (query.length < 2 || (activeSearch === "origin" && query === "Mi ubicación")) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsSearchingPlaces(true);
      setHasSearchedPlaces(false);
      try {
        if (!isSupabaseConfigured()) throw new Error("Supabase no configurado");
        const client = getSupabaseBrowserClient();
        const expanded = query.replace(/\bblvd\.?\b/gi, "boulevard").replace(/\bav\.?\b/gi, "avenida");
        const variants = [...new Set([query, expanded])];
        const responses = await Promise.all(variants.map((value) => client!.functions.invoke("search-transit", { body: { query: value, limit: 8 } })));
        let results: PlaceSuggestion[] = responses.flatMap(({ data, error }) => error || !Array.isArray(data?.data) ? [] : data.data);
        results = results.filter((item, index, list) => index === list.findIndex((other) => other.label === item.label && other.latitude === item.latitude));
        if (results.length === 0) {
          const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${query} Morelia`)}&format=json&limit=6&addressdetails=1&accept-language=es`);
          if (response.ok) {
            const places = await response.json();
            results = Array.isArray(places) ? places.map((place, index) => ({
              entity_id: `osm-${place.place_id ?? index}`,
              label: String(place.display_name || "").split(",")[0],
              subtitle: String(place.display_name || "").split(",").slice(1, 4).join(",").trim(),
              latitude: Number(place.lat),
              longitude: Number(place.lon),
            })) : [];
          }
        }
        if (!cancelled) setSuggestions(results);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) { setIsSearchingPlaces(false); setHasSearchedPlaces(true); }
      }
    }, 320);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [activeSearch, origin, destination]);

  const filteredRoutes = useMemo(() => {
    const query = routeQuery.trim();
    const filterFn = (route: RouteData) => {
      if (transportFilter === "fav") {
        return favorites.some((f) => String(f.route_id) === String(route.id));
      }
      return transportFilter === "all" || (transportFilter === "combi" ? isCombi(route) : !isCombi(route));
    };

    if (!query) {
      return routes
        .filter(filterFn)
        .sort((a, b) => Number(!isCombi(a)) - Number(!isCombi(b)) || a.name.localeCompare(b.name, "es-MX"));
    }

    const normQuery = normalizeString(query);
    const scored = routes
      .filter(filterFn)
      .map((route) => {
        const normName = normalizeString(route.name);
        const normCode = normalizeString(route.id || "");
        
        let score = 0;
        if (normName.includes(normQuery) || normCode.includes(normQuery)) {
          score = 1.0;
        } else {
          const simName = stringSimilarity(normName, normQuery);
          const simCode = stringSimilarity(normCode, normQuery);
          score = Math.max(simName, simCode);
        }
        return { route, score };
      })
      .filter((item) => item.score > 0.35)
      .sort((a, b) => b.score - a.score || a.route.name.localeCompare(b.route.name, "es-MX"));

    return scored.map((item) => item.route);
  }, [routeQuery, routes, transportFilter, favorites]);

  function requestLocation() {
    if (!navigator.geolocation) {
      setMessage("Tu dispositivo no permite obtener la ubicación.");
      return;
    }
    setMessage("Buscando tu ubicación…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = { latitude: coords.latitude, longitude: coords.longitude };
        setOrigin("Mi ubicación");
        setOriginCoordinates(point);
        setMapCenter({ ...point, timestamp: Date.now() });
        setMessage("Ubicación actualizada.");
      },
      () => setMessage("No pudimos acceder a tu ubicación. Revisa los permisos."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function planJourney(originPoint: Coordinates, destinationPoint: Coordinates) {
    if (!isSupabaseConfigured()) return setMessage("El planificador no está disponible.");
    setIsPlanningJourney(true);
    setJourneyOpen(true);
    setJourneyOptions([]);
    try {
      const client = getSupabaseBrowserClient();
      const { data, error } = await client!.functions.invoke("plan-journey", { body: { origin: originPoint, destination: destinationPoint } });
      if (error) throw error;
      const options = Array.isArray(data?.data) ? data.data : [];
      setJourneyOptions(options);
      setMessage(options.length ? `${options.length} opciones encontradas.` : "No encontramos rutas cercanas para este viaje.");
    } catch {
      setMessage("No pudimos calcular el viaje. Intenta nuevamente.");
    } finally {
      setIsPlanningJourney(false);
    }
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!destinationCoordinates) {
      setActiveSearch("destination");
      setMessage("Selecciona una dirección de destino de la lista.");
      return;
    }
    if (!originCoordinates) {
      setActiveSearch("origin");
      setMessage("Selecciona un origen o usa tu ubicación.");
      return;
    }
    void planJourney(originCoordinates, destinationCoordinates);
  }

  function selectSuggestion(suggestion: PlaceSuggestion) {
    const point = { latitude: suggestion.latitude, longitude: suggestion.longitude };
    if (activeSearch === "origin") {
      setOrigin(suggestion.label);
      setOriginCoordinates(point);
      if (destinationCoordinates) void planJourney(point, destinationCoordinates);
    } else {
      setDestination(suggestion.label);
      setDestinationCoordinates(point);
      if (originCoordinates) {
        void planJourney(originCoordinates, point);
      } else if (origin === "Mi ubicación") {
        if (navigator.geolocation) {
          setMessage("Obteniendo tu ubicación para calcular la ruta…");
          navigator.geolocation.getCurrentPosition(
            ({ coords }) => {
              const startPoint = { latitude: coords.latitude, longitude: coords.longitude };
              setOriginCoordinates(startPoint);
              setMapCenter({ ...startPoint, timestamp: Date.now() });
              void planJourney(startPoint, point);
            },
            () => {
              setMessage("Por favor selecciona un punto de origen en la lista para planificar la ruta.");
            },
            { enableHighAccuracy: true, timeout: 8000 }
          );
        } else {
          setMessage("Selecciona una dirección de origen.");
        }
      } else {
        setMessage("Selecciona una dirección de origen.");
      }
    }
    setSuggestions([]);
    setActiveSearch(null);
  }

  return (
    <main className="app-shell" data-theme="light">
      <div className="map-stage">
        <MapCanvas
          activeRoute={activeRoute}
          theme="light"
          mapCenter={mapCenter}
          zoomCommand={zoomCommand}
          originCoordinates={originCoordinates}
          destinationCoordinates={destinationCoordinates}
        />
      </div>

      <div className="map-overlay">
        <header className="map-toolbar" aria-label="Navegación principal" style={{ background: "transparent", border: 0, boxShadow: "none" }}>
          <div className="brand toolbar-brand" aria-label="ViaMorelia">
            <span className="compact-brand-mark"><BrandMark /></span>
            <strong>ViaMorelia</strong>
          </div>
          <div className="topbar-spacer" />
          <div className="toolbar-actions" style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end", pointerEvents: "auto" }}>
            <button className="routes-trigger" type="button" onClick={() => setRoutesOpen(true)}>
              <ListBulletsIcon size={20} weight="bold" /><span>Rutas</span>
            </button>
            <AuthMenu onMessage={setMessage} />
          </div>
        </header>

        <form className="compact-search search-dock" onSubmit={submitSearch}>
            <div className={`search-reveal ${activeSearch === "origin" ? "open" : ""}`}>
              <input value={origin} onChange={(event) => { setSuggestions([]); setHasSearchedPlaces(false); setOrigin(event.target.value); }} placeholder="Origen" aria-label="Origen" autoComplete="off" />
            </div>
            <button className="toolbar-icon" type="button" onClick={() => { setSuggestions([]); setActiveSearch(activeSearch === "origin" ? null : "origin"); }} aria-label="Buscar origen">
              <MagnifyingGlassIcon size={20} />
            </button>
            <div className={`search-reveal ${activeSearch === "destination" ? "open" : ""}`}>
              <input value={destination} onChange={(event) => { setSuggestions([]); setHasSearchedPlaces(false); setDestination(event.target.value); }} placeholder="Destino" aria-label="Destino" autoComplete="off" />
            </div>
            <button className="toolbar-icon" type="button" onClick={() => { setSuggestions([]); setActiveSearch(activeSearch === "destination" ? null : "destination"); }} aria-label="Buscar destino">
              <MagnifyingGlassIcon size={20} />
            </button>
            {activeSearch && (
              <div className={`address-suggestions ${activeSearch}`} role="listbox" aria-label="Sugerencias de direcciones">
                {(activeSearch === "origin" ? origin : destination).trim().length < 2 ? (
                  favorites.filter((f) => f.place_id || f.latitude || f.custom_name).length > 0 ? (
                    <>
                      <div className="suggestion-section-title" style={{ padding: "8px 12px", fontSize: "11px", fontWeight: "bold", color: "var(--muted)", borderBottom: "1px solid var(--line)" }}>
                        LUGARES FAVORITOS
                      </div>
                      {favorites.filter((f) => f.place_id || f.latitude || f.custom_name).map((fav) => {
                        const label = fav.custom_name || (fav.place && fav.place.name) || "Lugar favorito";
                        const lat = fav.latitude || (fav.place && fav.place.location?.coordinates?.[1]) || 0;
                        const lon = fav.longitude || (fav.place && fav.place.location?.coordinates?.[0]) || 0;
                        return (
                          <div key={`fav-place-${fav.id}`} className="suggestion-row-container" style={{ display: "flex", width: "100%", alignItems: "center", borderBottom: "1px solid var(--line)" }}>
                            <button type="button" className="suggestion-row" style={{ flex: 1, borderBottom: 0 }} onClick={() => selectSuggestion({ entity_id: fav.id, label, latitude: lat, longitude: lon })}>
                              <MagnifyingGlassIcon size={17} style={{ color: "var(--accent)" }} />
                              <span><strong>{label}</strong><small>Lugar favorito</small></span>
                            </button>
                            <button
                              type="button"
                              className="suggestion-fav-btn"
                              onClick={(e) => { e.stopPropagation(); togglePlaceFavorite(label, lat, lon); }}
                              style={{
                                padding: "10px 14px",
                                background: "transparent",
                                border: 0,
                                cursor: "pointer",
                                fontSize: "18px",
                                color: "var(--accent)"
                              }}
                              title="Eliminar de favoritos"
                            >
                              ★
                            </button>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div className="suggestion-state">Escribe para buscar o marca favoritos en tus búsquedas.</div>
                  )
                ) : isSearchingPlaces ? (
                  <div className="suggestion-state">Buscando direcciones…</div>
                ) : suggestions.length ? (
                  suggestions.map((suggestion) => {
                    const isFav = favorites.some((f) => f.custom_name === suggestion.label || (f.place && f.place.name === suggestion.label));
                    return (
                      <div key={`${suggestion.entity_id}-${suggestion.latitude}`} className="suggestion-row-container" style={{ display: "flex", width: "100%", alignItems: "center", borderBottom: "1px solid var(--line)" }}>
                        <button type="button" className="suggestion-row" style={{ flex: 1, borderBottom: 0 }} onClick={() => selectSuggestion(suggestion)}>
                          <MagnifyingGlassIcon size={17} />
                          <span><strong>{suggestion.label}</strong><small>{suggestion.subtitle || "Morelia, Michoacán"}</small></span>
                        </button>
                        <button
                          type="button"
                          className="suggestion-fav-btn"
                          onClick={(e) => { e.stopPropagation(); togglePlaceFavorite(suggestion.label, suggestion.latitude, suggestion.longitude); }}
                          style={{
                            padding: "10px 14px",
                            background: "transparent",
                            border: 0,
                            cursor: "pointer",
                            fontSize: "18px",
                            color: isFav ? "var(--accent)" : "#cbd5e1"
                          }}
                          title={isFav ? "Eliminar de favoritos" : "Marcar como favorito"}
                        >
                          {isFav ? "★" : "☆"}
                        </button>
                      </div>
                    );
                  })
                ) : hasSearchedPlaces ? (
                  <div className="suggestion-state">No encontramos esa dirección en Morelia.</div>
                ) : null}
              </div>
            )}
        </form>

        <AnimatePresence>
          {routesOpen && (
            <>
              <motion.button className="route-modal-backdrop" type="button" aria-label="Cerrar selector" onClick={() => setRoutesOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
              <motion.section className="route-modal" role="dialog" aria-modal="true" aria-labelledby="routes-title" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <div className="route-modal-header">
                  <div><h1 id="routes-title">Selecciona una ruta</h1><p>Combis y autobuses de Morelia.</p></div>
                  <button className="toolbar-icon" type="button" onClick={() => setRoutesOpen(false)} aria-label="Cerrar"><XIcon size={20} /></button>
                </div>
                <label className="route-search-field"><MagnifyingGlassIcon size={19} /><input autoFocus value={routeQuery} onChange={(event) => setRouteQuery(event.target.value)} placeholder="Buscar ruta por nombre" /></label>
                <div className="transport-filters" role="group" aria-label="Filtrar por tipo de transporte">
                  <button type="button" aria-pressed={transportFilter === "all"} onClick={() => setTransportFilter("all")}>Todas</button>
                  <button type="button" aria-pressed={transportFilter === "combi"} onClick={() => setTransportFilter("combi")}><CarProfileIcon size={18} /> Combi</button>
                  <button type="button" aria-pressed={transportFilter === "camion"} onClick={() => setTransportFilter("camion")}><BusIcon size={18} /> Camión</button>
                  <button type="button" aria-pressed={transportFilter === "fav"} onClick={() => setTransportFilter("fav")}>★ Favoritas</button>
                </div>
                <div className="modal-route-list">
                  {isLoading ? <div className="empty-state">Cargando rutas…</div> : filteredRoutes.length ? filteredRoutes.map((route) => {
                    const isFav = favorites.some((f) => String(f.route_id) === String(route.id));
                    return (
                      <div key={route.id} className="route-row-container" style={{ display: "flex", width: "100%", alignItems: "center", borderBottom: "1px solid var(--line)" }}>
                        <button className="route-row" type="button" style={{ flex: 1, borderBottom: 0 }} aria-pressed={activeRoute === route.id} onClick={() => { setActiveRoute(route.id); setRoutesOpen(false); }}>
                          <span className="route-color-icon vehicle-icon" style={{ background: route.color, color: contrastColor(route.color) }}>
                            {isCombi(route) ? <CarProfileIcon size={22} weight="fill" /> : <BusIcon size={22} weight="fill" />}
                          </span>
                          <span className="route-copy"><strong>{route.name}</strong><span>{isCombi(route) ? "Combi" : "Autobús"}</span></span>
                        </button>
                        <button
                          type="button"
                          className="route-fav-btn"
                          onClick={(e) => { e.stopPropagation(); toggleRouteFavorite(route.id); }}
                          style={{
                            padding: "10px 14px",
                            background: "transparent",
                            border: 0,
                            cursor: "pointer",
                            fontSize: "18px",
                            color: isFav ? "#eab308" : "#cbd5e1"
                          }}
                          title={isFav ? "Eliminar de favoritas" : "Marcar como favorita"}
                        >
                          {isFav ? "★" : "☆"}
                        </button>
                      </div>
                    );
                  }) : <div className="empty-state">No encontramos rutas con ese nombre.</div>}
                </div>
              </motion.section>
            </>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {journeyOpen && (
            <motion.aside className="journey-panel" aria-label="Opciones de viaje" initial={reducedMotion ? false : { opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }}>
              <div className="journey-panel-header">
                <div><h2>Rutas para tu viaje</h2><p>Caminata y transbordos estimados</p></div>
                <button className="toolbar-icon" type="button" onClick={() => setJourneyOpen(false)} aria-label="Cerrar opciones"><XIcon size={19} /></button>
              </div>
              <div className="journey-results">
                {isPlanningJourney ? <div className="suggestion-state">Buscando rutas cercanas…</div> : journeyOptions.length ? journeyOptions.map((option, index) => {
                  const rCode = option.route_code || option.route_id;
                  const isFav = favorites.some((f) => String(f.route_id) === String(rCode));
                  return (
                    <div key={`${option.route_id}-${index}`} className="journey-result-container" style={{ display: "flex", width: "100%", alignItems: "center", borderBottom: "1px solid var(--line)" }}>
                      <button className="journey-result" type="button" style={{ flex: 1, borderBottom: 0 }} onClick={() => setActiveRoute(Number(option.transfers || 0) > 0 ? `${option.route_code},${option.second_route_code}` : String(option.route_code || option.route_id))}>
                        {Number(option.transfers || 0) > 0 ? (
                          <div className="journey-route-marks-group" style={{ display: "inline-flex", gap: "2px", marginRight: "10px" }}>
                            <span className="journey-route-mark" style={{ background: option.route_color || "#ef5445", width: "24px", minWidth: "24px", height: "40px", borderRadius: "8px 0 0 8px" }}><BusIcon size={14} weight="fill" /></span>
                            <span className="journey-route-mark" style={{ background: option.second_route_color || "#22c55e", width: "24px", minWidth: "24px", height: "40px", borderRadius: "0 8px 8px 0" }}><BusIcon size={14} weight="fill" /></span>
                          </div>
                        ) : (
                          <span className="journey-route-mark" style={{ background: option.route_color || "#ef5445" }}><BusIcon size={19} weight="fill" /></span>
                        )}
                        <span className="journey-result-copy">
                          <strong>{option.route_name.replace(" → ", " > ")}</strong>
                          <small>{Number(option.transfers || 0) > 0 ? `${option.transfers} transbordo` : "Ruta directa"} · {option.estimatedMinutes || "—"} min</small>
                          <span>
                            Camina {Math.round(Number(option.origin_walk_meters || 0))} m para abordar
                            {Number(option.transfers || 0) > 0 && ` · Trasbordo: camina ${Math.round(Number(option.transfer_walk_meters || 0))} m`}
                            {` · ${Math.round(Number(option.destination_walk_meters || 0))} m al destino`}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="journey-fav-btn"
                        onClick={(e) => { e.stopPropagation(); toggleRouteFavorite(rCode); }}
                        style={{
                          padding: "10px 14px",
                          background: "transparent",
                          border: 0,
                          cursor: "pointer",
                          fontSize: "18px",
                          color: isFav ? "#eab308" : "#cbd5e1"
                        }}
                        title={isFav ? "Eliminar de favoritas" : "Marcar como favorita"}
                      >
                        {isFav ? "★" : "☆"}
                      </button>
                    </div>
                  );
                }) : <div className="empty-state">No encontramos rutas dentro del rango caminable.</div>}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <div className="map-controls-bottom" aria-label="Controles del mapa">
          <button className="map-control-button zoom-symbol" type="button" onClick={() => setZoomCommand({ delta: 1, timestamp: Date.now() })} aria-label="Acercar mapa">+</button>
          <button className="map-control-button zoom-symbol" type="button" onClick={() => setZoomCommand({ delta: -1, timestamp: Date.now() })} aria-label="Alejar mapa">−</button>
          <button className="map-control-button" type="button" onClick={requestLocation} aria-label="Centrar mapa en mi ubicación"><CrosshairIcon size={21} weight="bold" /></button>
        </div>

        <AnimatePresence>{message && <motion.div className="toast" role="status" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>{message}</motion.div>}</AnimatePresence>
      </div>
    </main>
  );
}
