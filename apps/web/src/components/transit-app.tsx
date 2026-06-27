"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRightIcon,
  ArrowsDownUpIcon,
  BusIcon,
  CrosshairIcon,
  HeartIcon,
  List,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  NavigationArrowIcon,
} from "@phosphor-icons/react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { AuthMenu } from "./auth-menu";
import { MapCanvas } from "./map-canvas";

const DEFAULT_ROUTES = [
  { id: "3", number: "3", name: "Villas · Centro", detail: "Por Acueducto", time: "15 min", color: "#347b8f" },
];

type Coordinates = { latitude: number; longitude: number };
type TransitSuggestion = {
  entity_type: "route" | "stop" | "place";
  entity_id: number;
  label: string;
  subtitle: string | null;
  latitude: number | null;
  longitude: number | null;
};

// Determines contrast text color (black or white) for route number badges
function getContrastTextColor(hexColor: string): string {
  if (!hexColor) return "#ffffff";
  const cleanHex = hexColor.replace("#", "");
  if (cleanHex.length !== 6) return "#ffffff";
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 155 ? "#111111" : "#ffffff";
}

export function TransitApp() {
  const prefersReducedMotion = useReducedMotion();
  const theme = "light"; // Force Light Mode completely
  const [tab, setTab] = useState<"routes" | "stops">("routes");
  const [origin, setOrigin] = useState("Mi ubicación");
  const [destination, setDestination] = useState("");
  const [activeRoute, setActiveRoute] = useState("3");
  const [message, setMessage] = useState<string | null>(null);
  const [originCoordinates, setOriginCoordinates] = useState<Coordinates | null>(null);
  const [destinationCoordinates, setDestinationCoordinates] = useState<Coordinates | null>(null);
  
  const [originSuggestions, setOriginSuggestions] = useState<TransitSuggestion[]>([]);
  const [originSearchStatus, setOriginSearchStatus] = useState<"idle" | "loading" | "error">("idle");
  const [destinationSuggestions, setDestinationSuggestions] = useState<TransitSuggestion[]>([]);
  const [destinationSearchStatus, setDestinationSearchStatus] = useState<"idle" | "loading" | "error">("idle");
  
  const [routes, setRoutes] = useState<any[]>(DEFAULT_ROUTES);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(true);
  const [journeyOptions, setJourneyOptions] = useState<any[]>([]);
  const [isSearchingJourney, setIsSearchingJourney] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number; timestamp: number } | null>(null);

  // States to control autocomplete visibility
  const [showOriginSuggestions, setShowOriginSuggestions] = useState(false);
  const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false);

  // Hamburger Menu Drawer State (Mobile Only)
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // User session and favorites
  const [user, setUser] = useState<User | null>(null);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [selectedDestSuggestion, setSelectedDestSuggestion] = useState<TransitSuggestion | null>(null);

  // Lock refs to prevent autocomplete queries when setting a selected suggestion
  const isSelectingOriginRef = useRef(false);
  const isSelectingDestRef = useRef(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setIsLoadingRoutes(false);
      return;
    }
    const client = supabase;

    async function fetchRoutes() {
      setIsLoadingRoutes(true);
      const { data, error } = await client
        .from("routes")
        .select("id, name, code, color, transport_type, description")
        .eq("is_active", true)
        .eq("validation_status", "validated")
        .order("name", { ascending: true });

      if (error) {
        console.error("Error loading routes:", error);
        setIsLoadingRoutes(false);
        return;
      }

      if (data && data.length > 0) {
        const mapped = data.map((r: any) => {
          let num = r.transport_type === "combi" ? "C" : "A";
          const match = r.code.match(/\d+/);
          if (match) num += match[0];
          
          return {
            id: String(r.id),
            number: num,
            name: r.name,
            detail: r.description || (r.transport_type === "combi" ? "Ruta de combi" : "Ruta de autobús"),
            time: r.transport_type === "combi" ? "Combi" : "Camión",
            color: r.color || "#FFA500",
          };
        });
        setRoutes(mapped);
        setActiveRoute(mapped[0].id);
      }
      setIsLoadingRoutes(false);
    }

    fetchRoutes();
  }, []);

  // Force Light mode dataset and local storage
  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    window.localStorage.setItem("rutas-morelia-theme", "light");
  }, []);

  // Listen to Auth State changes to load and sync favorites
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) {
        fetchFavorites(data.user.id);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchFavorites(currentUser.id);
      } else {
        setFavorites([]);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function fetchFavorites(userId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("favorites")
      .select("id, route_id, stop_id, place_id, custom_name")
      .eq("user_id", userId);
    if (!error && data) {
      setFavorites(data);
    }
  }

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [message]);

  // Origin autocomplete query effect
  useEffect(() => {
    const query = origin.trim();
    if (query === "Mi ubicación") {
      setOriginSuggestions([]);
      setOriginSearchStatus("idle");
      return;
    }

    // Skip autocomplete if value was changed via clicking a suggestion
    if (isSelectingOriginRef.current) {
      isSelectingOriginRef.current = false;
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase || query.length < 2) return;

    const timeout = window.setTimeout(async () => {
      setOriginSearchStatus("loading");
      const { data, error } = await supabase.functions.invoke("search-transit", {
        body: { query, limit: 6 },
      });
      if (error) {
        setOriginSuggestions([]);
        setOriginSearchStatus("error");
        return;
      }
      setOriginSuggestions((data?.data ?? []) as TransitSuggestion[]);
      setOriginSearchStatus("idle");
    }, 260);

    return () => window.clearTimeout(timeout);
  }, [origin]);

  // Destination autocomplete query effect
  useEffect(() => {
    const query = destination.trim();

    // Skip autocomplete if value was changed via clicking a suggestion
    if (isSelectingDestRef.current) {
      isSelectingDestRef.current = false;
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase || query.length < 2) return;

    const timeout = window.setTimeout(async () => {
      setDestinationSearchStatus("loading");
      const { data, error } = await supabase.functions.invoke("search-transit", {
        body: { query, limit: 6 },
      });
      if (error) {
        setDestinationSuggestions([]);
        setDestinationSearchStatus("error");
        return;
      }
      setDestinationSuggestions((data?.data ?? []) as TransitSuggestion[]);
      setDestinationSearchStatus("idle");
    }, 260);

    return () => window.clearTimeout(timeout);
  }, [destination]);

  const filteredRoutes = useMemo(() => {
    const query = destination.trim().toLocaleLowerCase("es-MX");
    if (!query) return routes;
    return routes.filter((route) => `${route.name} ${route.detail}`.toLocaleLowerCase("es-MX").includes(query));
  }, [destination, routes]);

  function swapLocations() {
    setOrigin(destination || "Centro Histórico");
    setDestination(origin === "Mi ubicación" ? "" : origin);
    setOriginCoordinates(destinationCoordinates);
    setDestinationCoordinates(null);
    setOriginSuggestions([]);
    setDestinationSuggestions([]);
    setShowOriginSuggestions(false);
    setShowDestinationSuggestions(false);
  }

  async function planJourney(event: React.FormEvent) {
    event.preventDefault();
    if (!destination.trim()) {
      setMessage("Escribe un destino para encontrar tu mejor ruta.");
      return;
    }
    setJourneyOptions([]);
    setIsSearchingJourney(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      let origCoords = originCoordinates;
      let destCoords = destinationCoordinates;
      
      if (!origCoords || !destCoords) {
        origCoords = origCoords || { latitude: 19.7027, longitude: -101.1925 };
        destCoords = destCoords || { latitude: 19.6917, longitude: -101.1685 };
      }
      
      setMessage("Calculando las mejores opciones de viaje…");
      const { data, error } = await supabase.functions.invoke("plan-journey", {
        body: { origin: origCoords, destination: destCoords },
      });
      if (error) {
        console.error("Error planning journey:", error);
        setMessage("No pudimos calcular el viaje. Intenta de nuevo.");
        setIsSearchingJourney(false);
        return;
      }
      const options = data?.data as any[] | undefined;
      if (options && options.length > 0) {
        setJourneyOptions(options);
        setMessage(`${options.length} opciones encontradas.`);
        setActiveRoute(String(options[0].route_id));
        setIsMenuOpen(true); // Open routes panel drawer on mobile
      } else {
        setMessage("No encontramos una ruta directa entre esos puntos.");
      }
    } else {
      setMessage(`Mostrando rutas relacionadas con ${destination.trim()}.`);
      setIsMenuOpen(true); // Open routes panel drawer on mobile
    }
    setIsSearchingJourney(false);
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setMessage("Tu dispositivo no permite obtener la ubicación.");
      return;
    }
    setMessage("Buscando tu ubicación…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: Date.now(),
        };
        setOrigin("Mi ubicación");
        setOriginCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
        setMapCenter(coords);
        setMessage("Ubicación actualizada.");
      },
      () => setMessage("No pudimos acceder a tu ubicación. Revisa los permisos."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function updateOrigin(value: string) {
    setOrigin(value);
    setOriginCoordinates(null);
    setMapCenter(null);
    setShowOriginSuggestions(true);
    if (value.trim().length < 2) {
      setOriginSuggestions([]);
      setOriginSearchStatus("idle");
    }
  }

  function updateDestination(value: string) {
    setDestination(value);
    setDestinationCoordinates(null);
    setSelectedDestSuggestion(null); // Reset context since user is typing manually
    setShowDestinationSuggestions(true);
    if (value.trim().length < 2) {
      setDestinationSuggestions([]);
      setDestinationSearchStatus("idle");
      setJourneyOptions([]);
    }
  }

  function selectOriginSuggestion(suggestion: TransitSuggestion) {
    isSelectingOriginRef.current = true;
    setOrigin(suggestion.label);
    setOriginCoordinates(
      suggestion.latitude !== null && suggestion.longitude !== null
        ? { latitude: suggestion.latitude, longitude: suggestion.longitude }
        : null,
    );
    setShowOriginSuggestions(false);
    setOriginSuggestions([]);
  }

  function selectDestinationSuggestion(suggestion: TransitSuggestion) {
    isSelectingDestRef.current = true;
    setDestination(suggestion.label);
    setDestinationCoordinates(
      suggestion.latitude !== null && suggestion.longitude !== null
        ? { latitude: suggestion.latitude, longitude: suggestion.longitude }
        : null,
    );
    setSelectedDestSuggestion(suggestion); // Cache selection details
    setShowDestinationSuggestions(false);
    setDestinationSuggestions([]);
    if (suggestion.entity_type === "route") {
      setActiveRoute(String(suggestion.entity_id));
      setIsMenuOpen(true); // Open routes panel drawer on mobile
    }
  }

  // Toggles route favoriting to database
  async function toggleRouteFavorite(routeId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    if (!user) {
      setMessage("Inicia sesión o continúa como invitado para guardar favoritos.");
      return;
    }

    const existing = favorites.find((f) => String(f.route_id) === String(routeId));
    if (existing) {
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("id", existing.id);
      if (!error) {
        setFavorites((favs) => favs.filter((f) => f.id !== existing.id));
        setMessage("Eliminado de favoritos.");
      } else {
        setMessage("No se pudo quitar la ruta de favoritos.");
      }
    } else {
      const { data, error } = await supabase
        .from("favorites")
        .insert({
          user_id: user.id,
          route_id: parseInt(routeId),
        })
        .select()
        .single();
      if (!error && data) {
        setFavorites((favs) => [...favs, data]);
        setMessage("Guardado en favoritos.");
      } else {
        setMessage("No se pudo guardar la ruta en favoritos.");
      }
    }
  }

  // Resolves whether active selected destination place is favorited
  const isDestinationFavorited = useMemo(() => {
    if (!selectedDestSuggestion) return false;
    const sugg = selectedDestSuggestion;
    return favorites.some((f) => {
      if (sugg.entity_type === "stop") {
        return String(f.stop_id) === String(sugg.entity_id);
      } else if (sugg.entity_type === "place") {
        if (sugg.entity_id >= 900000) {
          // Geocoded OSM places are matched via custom name labels
          return f.place_id && f.custom_name === sugg.label;
        }
        return String(f.place_id) === String(sugg.entity_id);
      }
      return false;
    });
  }, [selectedDestSuggestion, favorites]);

  // Saves destination stops/places to favorites (prompts for custom name)
  async function toggleDestinationPlaceFavorite() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !selectedDestSuggestion) return;

    if (!user) {
      setMessage("Inicia sesión o continúa como invitado para guardar favoritos.");
      return;
    }

    const sugg = selectedDestSuggestion;

    if (isDestinationFavorited) {
      // Delete favorite
      const existing = favorites.find((f) => {
        if (sugg.entity_type === "stop") return String(f.stop_id) === String(sugg.entity_id);
        if (sugg.entity_type === "place") {
          if (sugg.entity_id >= 900000) return f.place_id && f.custom_name === sugg.label;
          return String(f.place_id) === String(sugg.entity_id);
        }
        return false;
      });

      if (existing) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("id", existing.id);
        if (!error) {
          setFavorites((favs) => favs.filter((f) => f.id !== existing.id));
          setMessage("Lugar eliminado de favoritos.");
        }
      }
    } else {
      // Add favorite (prompt for custom name)
      const customName = window.prompt(
        "¿Cómo quieres guardar este lugar? (ej. Mi Casa, Trabajo, Universidad)",
        sugg.label
      );

      if (customName === null) return; // Cancelled
      const finalName = customName.trim() || sugg.label;

      let targetPlaceId: number | null = null;
      let targetStopId: number | null = null;

      if (sugg.entity_type === "stop") {
        targetStopId = sugg.entity_id;
      } else if (sugg.entity_type === "place") {
        if (sugg.entity_id >= 900000) {
          // Geocoded OSM place - must insert into public.places first
          const { data: cityData } = await supabase
            .from("cities")
            .select("id")
            .eq("name", "Morelia")
            .limit(1);
          const cityId = cityData?.[0]?.id || 1;

          const { data: placeData, error: placeError } = await supabase
            .from("places")
            .insert({
              city_id: cityId,
              name: finalName,
              category: "Favorito",
              address: sugg.subtitle || "Morelia, Michoacán",
              location: `POINT(${sugg.longitude} ${sugg.latitude})`,
            })
            .select("id")
            .single();

          if (placeError || !placeData) {
            console.error("Error creating place for favorite:", placeError);
            setMessage("No se pudo guardar el lugar.");
            return;
          }
          targetPlaceId = placeData.id;
        } else {
          targetPlaceId = sugg.entity_id;
        }
      }

      const { data: favData, error: favError } = await supabase
        .from("favorites")
        .insert({
          user_id: user.id,
          place_id: targetPlaceId,
          stop_id: targetStopId,
          custom_name: finalName,
        })
        .select()
        .single();

      if (!favError && favData) {
        setFavorites((favs) => [...favs, favData]);
        setMessage(`Lugar "${finalName}" guardado en favoritos.`);
      } else {
        console.error("Error inserting favorite:", favError);
        setMessage("No se pudo guardar el favorito.");
      }
    }
  }

  // Shared rendered Lists component for both desktop side panel and mobile drawer
  const renderedLists = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tab}
        className="route-list"
        initial={prefersReducedMotion ? false : { opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={prefersReducedMotion ? undefined : { opacity: 0, x: -8 }}
        transition={{ duration: 0.18 }}
        role="tabpanel"
      >
        {tab === "routes" ? (
          journeyOptions.length > 0 ? (
            journeyOptions.map((option, idx) => (
              <button
                key={`${option.route_id}-${idx}`}
                type="button"
                className="route-row journey-option-row"
                aria-pressed={activeRoute === String(option.route_id)}
                onClick={() => {
                  setActiveRoute(String(option.route_id));
                  setIsMenuOpen(false); // Close mobile menu drawer
                }}
              >
                <span className="route-number" style={{ background: option.route_color || "#FFA500", color: getContrastTextColor(option.route_color || "#FFA500") }}>
                  {option.route_code ? (option.route_code.split('_')[1] || option.route_code[0]) : "R"}
                </span>
                <span className="route-copy">
                  <strong className="text-glow">{option.route_name}</strong>
                  <span className="journey-details">
                    Subir: <strong>{option.boarding_stop_name || "Parada cercana"}</strong>
                    <br />
                    Bajar: <strong>{option.alighting_stop_name || "Destino"}</strong>
                  </span>
                  <span className="journey-walk-info">
                    Caminata: {Math.round((option.origin_walk_meters || 0) + (option.destination_walk_meters || 0))}m · {option.stops_count} paradas
                  </span>
                </span>
                <div className="journey-meta" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                  <span className="route-time">{option.estimatedMinutes} min</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className="route-fare">${option.fare || "11.00"}</span>
                    {user && (
                      <button
                        type="button"
                        style={{ background: "transparent", border: 0, padding: 2, cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRouteFavorite(String(option.route_id));
                        }}
                        aria-label="Favorito"
                      >
                        <HeartIcon
                          size={15}
                          weight={favorites.some((f) => String(f.route_id) === String(option.route_id)) ? "fill" : "regular"}
                          color={favorites.some((f) => String(f.route_id) === String(option.route_id)) ? "var(--accent)" : "var(--muted)"}
                        />
                      </button>
                    )}
                  </div>
                </div>
              </button>
            ))
          ) : isLoadingRoutes ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton-row" aria-hidden="true">
                <div className="skeleton-number" />
                <div className="skeleton-text">
                  <div className="skeleton-title" />
                  <div className="skeleton-subtitle" />
                </div>
                <div className="skeleton-number" style={{ width: 36, height: 16 }} />
              </div>
            ))
          ) : filteredRoutes.length ? filteredRoutes.map((route) => (
            <motion.button
              whileTap={{ scale: 0.98 }}
              whileHover={{ y: -1 }}
              key={route.id}
              type="button"
              className="route-row"
              aria-pressed={activeRoute === route.id}
              onClick={() => {
                setActiveRoute(route.id);
                setIsMenuOpen(false); // Close mobile menu drawer
              }}
            >
              <span className="route-number" style={{ background: route.color, color: getContrastTextColor(route.color) }}>{route.number}</span>
              <span className="route-copy">
                <strong>{route.name}</strong>
                <span>{route.detail}</span>
              </span>
              <div className="route-time-container" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                <span className="route-time">{route.time}</span>
                {user && (
                  <button
                    type="button"
                    style={{ background: "transparent", border: 0, padding: 4, cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRouteFavorite(route.id);
                    }}
                    aria-label="Favorito"
                  >
                    <HeartIcon
                      size={17}
                      weight={favorites.some((f) => String(f.route_id) === String(route.id)) ? "fill" : "regular"}
                      color={favorites.some((f) => String(f.route_id) === String(route.id)) ? "var(--accent)" : "var(--muted)"}
                    />
                  </button>
                )}
              </div>
            </motion.button>
          )) : <div className="empty-state">No encontramos rutas con ese destino. Prueba con una colonia o punto conocido.</div>
        ) : (
          [
            ["Catedral", "A 3 min caminando"],
            ["Mercado Independencia", "A 6 min caminando"],
            ["Las Tarascas", "A 9 min caminando"],
          ].map(([name, distance]) => (
            <button
              key={name}
              type="button"
              className="route-row"
              onClick={() => {
                setMessage(`Parada ${name} seleccionada.`);
                setIsMenuOpen(false); // Close mobile menu drawer
              }}
            >
              <span className="route-number" style={{ background: "var(--primary-strong)" }}><MapPinIcon size={18} weight="fill" /></span>
              <span className="route-copy"><strong>{name}</strong><span>{distance}</span></span>
              <ArrowRightIcon size={18} aria-hidden="true" />
            </button>
          ))
        )}
      </motion.div>
    </AnimatePresence>
  );

  // Shared rendered Tabs component
  const renderedTabs = (
    <div className="tabs" role="tablist" aria-label="Explorar transporte">
      <button className="tab-button" role="tab" aria-selected={tab === "routes"} onClick={() => setTab("routes")} type="button">
        Rutas cercanas
      </button>
      <button className="tab-button" role="tab" aria-selected={tab === "stops"} onClick={() => setTab("stops")} type="button">
        Paradas
      </button>
    </div>
  );

  return (
    <main className="app-shell" data-theme={theme}>
      <div className="map-stage" aria-hidden="false">
        <MapCanvas activeRoute={activeRoute} theme={theme} mapCenter={mapCenter} />
      </div>

      <div className="map-overlay">
        
        {/* ========================================================================= */}
        {/* DESKTOP VIEW COMPONENT LAYOUT                                             */}
        {/* ========================================================================= */}
        <header className="topbar desktop-only" aria-label="Navegación principal">
          <div className="brand" aria-label="ViaMorelia - Movilidad Urbana de Morelia">
            <div className="brand-mark" aria-hidden="true" style={{ background: "transparent", width: 28, height: 28, minWidth: 28 }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" fill="none">
                <defs>
                  <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#3b82f6" />
                    <stop offset="100%" stop-color="#1d4ed8" />
                  </linearGradient>
                  <linearGradient id="greenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#10b981" />
                    <stop offset="100%" stop-color="#047857" />
                  </linearGradient>
                </defs>
                <path d="M15 80V40C15 22 42 22 42 40V80" stroke="url(#blueGrad)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
                <path d="M42 80V40C42 22 69 22 69 40V80" stroke="url(#greenGrad)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="42" cy="55" r="7" fill="#ffffff" stroke="#111827" strokeWidth={4} />
              </svg>
            </div>
            <div className="brand-copy">
              <strong>ViaMorelia</strong>
              <span>Movilidad urbana de Morelia</span>
            </div>
          </div>
          <div className="topbar-spacer" />
          <AuthMenu onMessage={setMessage} />
        </header>

        <section className="planner-panel desktop-only" aria-labelledby="planner-title">
          <div className="panel-title-row">
            <h1 id="planner-title">¿A dónde vas?</h1>
            <span className="status-badge"><span className="status-dot" /> Servicio activo</span>
          </div>

          <form className="journey-form" onSubmit={planJourney}>
            <label className="field">
              <span className="sr-only">Origen</span>
              <CrosshairIcon className="field-icon" size={19} aria-hidden="true" />
              <input
                value={origin}
                onChange={(event) => updateOrigin(event.target.value)}
                onFocus={() => setShowOriginSuggestions(true)}
                autoComplete="off"
                placeholder="Origen (ej. Mi ubicación)"
              />
              <button className="field-action" type="button" onClick={requestLocation} aria-label="Usar mi ubicación">
                <NavigationArrowIcon size={18} />
              </button>
            </label>
            {isSupabaseConfigured() && showOriginSuggestions && origin.trim().length >= 2 && origin !== "Mi ubicación" && (originSuggestions.length > 0 || originSearchStatus !== "idle") && (
              <div className="suggestion-list" aria-live="polite">
                {originSearchStatus === "loading" && <div className="suggestion-loading"><span /><span /><span /></div>}
                {originSearchStatus === "error" && <div className="suggestion-state">No pudimos consultar el índice. Intenta de nuevo.</div>}
                {originSearchStatus === "idle" && originSuggestions.map((suggestion) => (
                  <button key={`${suggestion.entity_type}-${suggestion.entity_id}`} className="suggestion-row" type="button" onClick={() => selectOriginSuggestion(suggestion)}>
                    <MapPinIcon size={18} aria-hidden="true" />
                    <span><strong>{suggestion.label}</strong><small>{suggestion.subtitle || "Morelia"}</small></span>
                  </button>
                ))}
              </div>
            )}

            <label className="field">
              <span className="sr-only">Destino</span>
              <MapPinIcon className="field-icon" size={19} aria-hidden="true" />
              <input
                value={destination}
                onChange={(event) => updateDestination(event.target.value)}
                onFocus={() => setShowDestinationSuggestions(true)}
                placeholder="Busca un lugar o colonia"
                autoComplete="off"
              />
              {/* Heart icon inside destination bar to save places/stops as favorites */}
              {destinationCoordinates && (
                <button className="field-action" style={{ right: "44px" }} type="button" onClick={toggleDestinationPlaceFavorite} aria-label="Favorito">
                  <HeartIcon size={18} weight={isDestinationFavorited ? "fill" : "regular"} color={isDestinationFavorited ? "var(--accent)" : "currentColor"} />
                </button>
              )}
              <button className="field-action" type="button" onClick={swapLocations} aria-label="Intercambiar origen y destino">
                <ArrowsDownUpIcon size={18} />
              </button>
            </label>
            
            {/* Quick favorites list dropdown on focus when empty */}
            {isSupabaseConfigured() && showDestinationSuggestions && destination.trim().length < 2 && favorites.some((f) => f.place_id || f.stop_id) && (
              <div className="suggestion-list" aria-live="polite">
                <div style={{ padding: "8px 12px", fontSize: "11px", fontWeight: "bold", color: "var(--muted)", borderBottom: "1px solid var(--line)" }}>
                  LUGARES FAVORITOS
                </div>
                {favorites.filter((f) => f.place_id || f.stop_id).map((fav) => (
                  <button
                    key={`fav-dest-dt-${fav.id}`}
                    className="suggestion-row"
                    type="button"
                    onClick={async () => {
                      const supabase = getSupabaseBrowserClient();
                      if (!supabase) return;
                      let label = fav.custom_name || "";
                      let lat: number | null = null;
                      let lon: number | null = null;
                      let entityType: "stop" | "place" = fav.stop_id ? "stop" : "place";
                      let entityId = fav.stop_id || fav.place_id;

                      if (fav.stop_id) {
                        const { data } = await supabase.from("stops").select("name, reference, location").eq("id", fav.stop_id).single();
                        if (data) {
                          label = fav.custom_name || data.name;
                          lat = (data.location as any)?.coordinates?.[1] || null;
                          lon = (data.location as any)?.coordinates?.[0] || null;
                        }
                      } else if (fav.place_id) {
                        const { data } = await supabase.from("places").select("name, address, location").eq("id", fav.place_id).single();
                        if (data) {
                          label = fav.custom_name || data.name;
                          lat = (data.location as any)?.coordinates?.[1] || null;
                          lon = (data.location as any)?.coordinates?.[0] || null;
                        }
                      }

                      selectDestinationSuggestion({
                        entity_type: entityType,
                        entity_id: entityId,
                        label: label,
                        subtitle: fav.stop_id ? "Parada favorita" : "Lugar favorito",
                        latitude: lat,
                        longitude: lon,
                      });
                    }}
                  >
                    <HeartIcon size={18} weight="fill" color="var(--accent)" aria-hidden="true" />
                    <span><strong>{fav.custom_name}</strong><small>{fav.stop_id ? "Parada favorita" : "Lugar favorito"}</small></span>
                  </button>
                ))}
              </div>
            )}

            {isSupabaseConfigured() && showDestinationSuggestions && destination.trim().length >= 2 && (destinationSuggestions.length > 0 || destinationSearchStatus !== "idle") && (
              <div className="suggestion-list" aria-live="polite">
                {destinationSearchStatus === "loading" && <div className="suggestion-loading"><span /><span /><span /></div>}
                {destinationSearchStatus === "error" && <div className="suggestion-state">No pudimos consultar el índice. Intenta de nuevo.</div>}
                {destinationSearchStatus === "idle" && destinationSuggestions.map((suggestion) => (
                  <button key={`${suggestion.entity_type}-${suggestion.entity_id}`} className="suggestion-row" type="button" onClick={() => selectDestinationSuggestion(suggestion)}>
                    <MapPinIcon size={18} aria-hidden="true" />
                    <span><strong>{suggestion.label}</strong><small>{suggestion.subtitle || "Morelia"}</small></span>
                  </button>
                ))}
              </div>
            )}
            <button className="primary-button" type="submit">
              <MagnifyingGlassIcon size={19} weight="bold" />
              Buscar ruta
            </button>
          </form>

          {renderedTabs}
          {renderedLists}
        </section>


        {/* ========================================================================= */}
        {/* MOBILE VIEW COMPONENT LAYOUT                                              */}
        {/* ========================================================================= */}
        
        {/* Floating Search Bar (Mobile Only) */}
        <div className="mobile-search-bar mobile-only">
          <button className="hamburger-button" type="button" onClick={() => setIsMenuOpen(true)} aria-label="Abrir menú">
            <List size={22} weight="bold" />
          </button>
          <form className="mobile-search-form" onSubmit={planJourney}>
            <div className="mobile-inputs-container">
              <div className="mobile-input-wrapper">
                <CrosshairIcon className="mobile-field-icon" size={16} />
                <input
                  value={origin}
                  onChange={(event) => updateOrigin(event.target.value)}
                  onFocus={() => setShowOriginSuggestions(true)}
                  autoComplete="off"
                  placeholder="Origen (ej. Mi ubicación)"
                />
                <button className="mobile-input-action" type="button" onClick={requestLocation} aria-label="Usar mi ubicación">
                  <NavigationArrowIcon size={14} />
                </button>
                {isSupabaseConfigured() && showOriginSuggestions && origin.trim().length >= 2 && origin !== "Mi ubicación" && (originSuggestions.length > 0 || originSearchStatus !== "idle") && (
                  <div className="suggestion-list mobile-suggestions" aria-live="polite">
                    {originSearchStatus === "loading" && <div className="suggestion-loading"><span /><span /><span /></div>}
                    {originSearchStatus === "error" && <div className="suggestion-state">No pudimos consultar el índice.</div>}
                    {originSearchStatus === "idle" && originSuggestions.map((suggestion) => (
                      <button key={`${suggestion.entity_type}-${suggestion.entity_id}`} className="suggestion-row" type="button" onClick={() => selectOriginSuggestion(suggestion)}>
                        <MapPinIcon size={16} />
                        <span><strong>{suggestion.label}</strong></span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mobile-input-wrapper">
                <MapPinIcon className="mobile-field-icon" size={16} />
                <input
                  value={destination}
                  onChange={(event) => updateDestination(event.target.value)}
                  onFocus={() => setShowDestinationSuggestions(true)}
                  placeholder="Busca un lugar o colonia"
                  autoComplete="off"
                />
                {destinationCoordinates && (
                  <button className="mobile-input-action" style={{ right: "32px" }} type="button" onClick={toggleDestinationPlaceFavorite} aria-label="Favorito">
                    <HeartIcon size={15} weight={isDestinationFavorited ? "fill" : "regular"} color={isDestinationFavorited ? "var(--accent)" : "currentColor"} />
                  </button>
                )}
                <button className="mobile-input-action" type="button" onClick={swapLocations} aria-label="Intercambiar">
                  <ArrowsDownUpIcon size={14} />
                </button>
              </div>
            </div>
            <button className="mobile-search-submit" type="submit" aria-label="Buscar">
              <MagnifyingGlassIcon size={18} weight="bold" />
            </button>
          </form>
        </div>

        {/* Mobile menu suggestions list dropdown */}
        {isSupabaseConfigured() && showDestinationSuggestions && destination.trim().length < 2 && favorites.some((f) => f.place_id || f.stop_id) && (
          <div className="suggestion-list mobile-suggestions mobile-only" style={{ top: "106px", left: "62px", right: "62px" }} aria-live="polite">
            <div style={{ padding: "6px 10px", fontSize: "10px", fontWeight: "bold", color: "var(--muted)", borderBottom: "1px solid var(--line)" }}>
              LUGARES FAVORITOS
            </div>
            {favorites.filter((f) => f.place_id || f.stop_id).map((fav) => (
              <button
                key={`fav-dest-mb-${fav.id}`}
                className="suggestion-row"
                type="button"
                onClick={async () => {
                  const supabase = getSupabaseBrowserClient();
                  if (!supabase) return;
                  let label = fav.custom_name || "";
                  let lat: number | null = null;
                  let lon: number | null = null;
                  let entityType: "stop" | "place" = fav.stop_id ? "stop" : "place";
                  let entityId = fav.stop_id || fav.place_id;

                  if (fav.stop_id) {
                    const { data } = await supabase.from("stops").select("name, reference, location").eq("id", fav.stop_id).single();
                    if (data) {
                      label = fav.custom_name || data.name;
                      lat = (data.location as any)?.coordinates?.[1] || null;
                      lon = (data.location as any)?.coordinates?.[0] || null;
                    }
                  } else if (fav.place_id) {
                    const { data } = await supabase.from("places").select("name, address, location").eq("id", fav.place_id).single();
                    if (data) {
                      label = fav.custom_name || data.name;
                      lat = (data.location as any)?.coordinates?.[1] || null;
                      lon = (data.location as any)?.coordinates?.[0] || null;
                    }
                  }

                  selectDestinationSuggestion({
                    entity_type: entityType,
                    entity_id: entityId,
                    label: label,
                    subtitle: fav.stop_id ? "Parada favorita" : "Lugar favorito",
                    latitude: lat,
                    longitude: lon,
                  });
                }}
              >
                <HeartIcon size={16} weight="fill" color="var(--accent)" aria-hidden="true" />
                <span><strong>{fav.custom_name}</strong><small>{fav.stop_id ? "Parada" : "Lugar"}</small></span>
              </button>
            ))}
          </div>
        )}

        {isSupabaseConfigured() && showDestinationSuggestions && destination.trim().length >= 2 && (destinationSuggestions.length > 0 || destinationSearchStatus !== "idle") && (
          <div className="suggestion-list mobile-suggestions mobile-only" style={{ top: "106px", left: "62px", right: "62px" }} aria-live="polite">
            {destinationSearchStatus === "loading" && <div className="suggestion-loading"><span /><span /><span /></div>}
            {destinationSearchStatus === "error" && <div className="suggestion-state">No pudimos consultar el índice.</div>}
            {destinationSearchStatus === "idle" && destinationSuggestions.map((suggestion) => (
              <button key={`${suggestion.entity_type}-${suggestion.entity_id}`} className="suggestion-row" type="button" onClick={() => selectDestinationSuggestion(suggestion)}>
                <MapPinIcon size={16} />
                <span><strong>{suggestion.label}</strong></span>
              </button>
            ))}
          </div>
        )}

        {/* Mobile Menu Drawer Overlay */}
        <AnimatePresence>
          {isMenuOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                className="mobile-drawer-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMenuOpen(false)}
              />
              {/* Drawer Content */}
              <motion.div
                className="mobile-drawer"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
              >
                <div className="mobile-drawer-header">
                  <div className="brand">
                    <div className="brand-mark" style={{ width: 28, height: 28, background: "transparent" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" fill="none">
                        <defs>
                          <linearGradient id="blueGradMobile" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#3b82f6" />
                            <stop offset="100%" stop-color="#1d4ed8" />
                          </linearGradient>
                          <linearGradient id="greenGradMobile" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#10b981" />
                            <stop offset="100%" stop-color="#047857" />
                          </linearGradient>
                        </defs>
                        <path d="M15 80V40C15 22 42 22 42 40V80" stroke="url(#blueGradMobile)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M42 80V40C42 22 69 22 69 40V80" stroke="url(#greenGradMobile)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="42" cy="55" r="7" fill="#ffffff" stroke="#111827" strokeWidth={4} />
                      </svg>
                    </div>
                    <strong>ViaMorelia</strong>
                  </div>
                  <button className="close-drawer-button" type="button" onClick={() => setIsMenuOpen(false)}>
                    ✕
                  </button>
                </div>

                <div className="mobile-drawer-content">
                  <div className="mobile-auth-container">
                    <AuthMenu onMessage={setMessage} />
                  </div>
                  {renderedTabs}
                  <div style={{ flex: 1, overflowY: "auto", marginTop: 4 }}>
                    {renderedLists}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>


        {/* ========================================================================= */}
        {/* SHARED CONTROLS                                                           */}
        {/* ========================================================================= */}
        <div className="map-actions" aria-label="Controles del mapa">
          <button className="icon-button floating-button" type="button" onClick={requestLocation} aria-label="Centrar mapa en mi ubicación">
            <CrosshairIcon size={21} weight="bold" />
          </button>
          <button className="icon-button floating-button" type="button" onClick={() => setMessage("Tus rutas favoritas aparecerán aquí.")} aria-label="Ver favoritos">
            <HeartIcon size={21} />
          </button>
          <button className="icon-button floating-button" type="button" onClick={() => setMessage("Mostrando todas las rutas disponibles.")} aria-label="Ver lista de rutas">
            <ListBulletsIcon size={21} />
          </button>
        </div>

        <AnimatePresence>
          {message && (
            <motion.div
              className="toast"
              role="status"
              aria-live="polite"
              initial={prefersReducedMotion ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              {message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
