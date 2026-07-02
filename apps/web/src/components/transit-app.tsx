"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRightIcon,
  ArrowsDownUpIcon,
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

type RouteData = {
  id: string;
  name: string;
  color: string;
  transportType: string;
  geojsonFile: string;
  colorName?: string;
  colorLetter?: string;
};

type Coordinates = { latitude: number; longitude: number };

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
  const theme = "light";

  const [origin, setOrigin] = useState("Mi ubicación");
  const [destination, setDestination] = useState("");
  const [activeRoute, setActiveRoute] = useState("");
  const [activeTab, setActiveTab] = useState<"combi" | "camion">("combi");
  const [message, setMessage] = useState<string | null>(null);
  const [originCoordinates, setOriginCoordinates] = useState<Coordinates | null>(null);
  const [destinationCoordinates, setDestinationCoordinates] = useState<Coordinates | null>(null);

  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(true);

  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number; timestamp: number } | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Load routes index
  useEffect(() => {
    async function loadRoutes() {
      try {
        const res = await fetch("/routes/index.json", { cache: "no-store" });
        if (!res.ok) throw new Error("No routes index found");
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          setRoutes(data.routes);
        }
      } catch (err) {
        console.error("Error loading routes index:", err);
      } finally {
        setIsLoadingRoutes(false);
      }
    }
    loadRoutes();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    window.localStorage.setItem("rutas-morelia-theme", "light");
  }, []);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [message]);

  // Listen to auth state (only if Supabase is configured)
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowserClient()!;

    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  function requestLocation() {
    if (!navigator.geolocation) { setMessage("Tu dispositivo no permite obtener la ubicación."); return; }
    setMessage("Buscando tu ubicación…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude, timestamp: Date.now() };
        setOrigin("Mi ubicación");
        setOriginCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
        setMapCenter(coords);
        setMessage("Ubicación actualizada.");
      },
      () => setMessage("No pudimos acceder a tu ubicación. Revisa los permisos."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function swapLocations() {
    setOrigin(destination || "Centro Histórico");
    setDestination(origin === "Mi ubicación" ? "" : origin);
    const tempCoords = originCoordinates;
    setOriginCoordinates(destinationCoordinates);
    setDestinationCoordinates(tempCoords);
  }

  async function planJourney(event: React.FormEvent) {
    event.preventDefault();
    if (!destination.trim()) { setMessage("Escribe un destino para encontrar tu mejor ruta."); return; }
    setMessage("Mostrando rutas relacionadas con " + destination.trim() + ".");
    if (window.innerWidth < 768) setIsMenuOpen(true);
  }

  function isCombi(route: RouteData): boolean {
    const t = route.transportType.toLowerCase();
    return t.includes("combi") || t.includes("microbús") || t.includes("microbus");
  }

  function routeTypeLabel(route: RouteData): string {
    return isCombi(route) ? "Combi" : "Camión";
  }

  const filteredRoutes = useMemo(() => {
    const query = destination.trim().toLocaleLowerCase("es-MX");
    const filtered = query
      ? routes.filter((r) => r.name.toLocaleLowerCase("es-MX").includes(query))
      : routes;
    // Sort: combi first, then camión
    return [...filtered].sort((a, b) => {
      const aIsCombi = isCombi(a) ? 0 : 1;
      const bIsCombi = isCombi(b) ? 0 : 1;
      return aIsCombi - bIsCombi || a.name.localeCompare(b.name, "es-MX");
    });
  }, [destination, routes]);

  const combiRoutes = useMemo(() => filteredRoutes.filter(isCombi), [filteredRoutes]);
  const camionRoutes = useMemo(() => filteredRoutes.filter((r) => !isCombi(r)), [filteredRoutes]);

  function renderRouteButton(route: RouteData) {
    return (
      <motion.button
        whileTap={{ scale: 0.98 }}
        whileHover={{ y: -1 }}
        key={route.id}
        type="button"
        className="route-row"
        aria-pressed={activeRoute === route.id}
        onClick={() => { setActiveRoute(route.id); setIsMenuOpen(false); }}
      >
        <span className="route-color-icon" style={{ background: route.color, color: getContrastTextColor(route.color) }}>
          {route.colorLetter || route.id.charAt(0).toUpperCase()}
        </span>
        <span className="route-copy">
          <strong>{route.name}</strong>
          <span>Ruta de {routeTypeLabel(route)}</span>
        </span>
        <span className="route-time">{routeTypeLabel(route)}</span>
      </motion.button>
    );
  }

  const renderedLists = (
    <div className="flex flex-col h-full min-h-0">
      <div className="tabs-container">
        <button
          type="button"
          className={`tab-button ${activeTab === "combi" ? "active" : ""}`}
          onClick={() => setActiveTab("combi")}
        >
          Combis ({isLoadingRoutes ? "..." : combiRoutes.length})
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "camion" ? "active" : ""}`}
          onClick={() => setActiveTab("camion")}
        >
          Camiones ({isLoadingRoutes ? "..." : camionRoutes.length})
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeTab}
          className="route-list"
          initial={prefersReducedMotion ? false : { opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0, x: -8 }}
          transition={{ duration: 0.18 }}
          role="tabpanel"
        >
          {isLoadingRoutes ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton-row" aria-hidden="true">
                <div className="skeleton-number" />
                <div className="skeleton-text"><div className="skeleton-title" /><div className="skeleton-subtitle" /></div>
                <div className="skeleton-number" style={{ width: 36, height: 16 }} />
              </div>
            ))
          ) : activeTab === "combi" ? (
            combiRoutes.length ? (
              combiRoutes.map(renderRouteButton)
            ) : (
              <div className="empty-state">No encontramos combis con ese destino.</div>
            )
          ) : (
            camionRoutes.length ? (
              camionRoutes.map(renderRouteButton)
            ) : (
              <div className="empty-state">No encontramos camiones con ese destino.</div>
            )
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );

  return (
    <main className="app-shell" data-theme={theme}>
      <div className="map-stage" aria-hidden="false">
        <MapCanvas activeRoute={activeRoute} theme={theme} mapCenter={mapCenter} />
      </div>

      <div className="map-overlay">
        {/* Desktop */}
        <header className="topbar desktop-only" aria-label="Navegación principal">
          <div className="brand" aria-label="ViaMorelia - Movilidad Urbana de Morelia">
            <div className="brand-mark" aria-hidden="true" style={{ background: "transparent", width: 28, height: 28, minWidth: 28 }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" fill="none">
                <defs>
                  <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#1d4ed8" />
                  </linearGradient>
                  <linearGradient id="greenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" /><stop offset="100%" stopColor="#047857" />
                  </linearGradient>
                </defs>
                <path d="M15 80V40C15 22 42 22 42 40V80" stroke="url(#blueGrad)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
                <path d="M42 80V40C42 22 69 22 69 40V80" stroke="url(#greenGrad)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="42" cy="55" r="7" fill="#ffffff" stroke="#111827" strokeWidth={4} />
              </svg>
            </div>
            <div className="brand-copy"><strong>ViaMorelia</strong><span>Movilidad urbana de Morelia</span></div>
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
              <input value={origin} onChange={(e) => setOrigin(e.target.value)} autoComplete="off" placeholder="Origen (ej. Mi ubicación)" />
              <button className="field-action" type="button" onClick={requestLocation} aria-label="Usar mi ubicación">
                <NavigationArrowIcon size={18} />
              </button>
            </label>

            <label className="field">
              <span className="sr-only">Destino</span>
              <MapPinIcon className="field-icon" size={19} aria-hidden="true" />
              <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Busca un lugar o colonia" autoComplete="off" />
              <button className="field-action" type="button" onClick={swapLocations} aria-label="Intercambiar origen y destino">
                <ArrowsDownUpIcon size={18} />
              </button>
            </label>

            <button className="primary-button" type="submit">
              <MagnifyingGlassIcon size={19} weight="bold" /> Buscar ruta
            </button>
          </form>

          {renderedLists}
        </section>

        {/* Mobile */}
        <div className="mobile-search-bar mobile-only">
          <button className="hamburger-button" type="button" onClick={() => setIsMenuOpen(true)} aria-label="Abrir menú">
            <List size={22} weight="bold" />
          </button>
          <form className="mobile-search-form" onSubmit={planJourney}>
            <div className="mobile-inputs-container">
              <div className="mobile-input-wrapper">
                <CrosshairIcon className="mobile-field-icon" size={16} />
                <input value={origin} onChange={(e) => setOrigin(e.target.value)} autoComplete="off" placeholder="Origen" />
                <button className="mobile-input-action" type="button" onClick={requestLocation} aria-label="Ubicación">
                  <NavigationArrowIcon size={14} />
                </button>
              </div>
              <div className="mobile-input-wrapper">
                <MapPinIcon className="mobile-field-icon" size={16} />
                <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Destino" autoComplete="off" />
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

        {/* Mobile Drawer */}
        <AnimatePresence>
          {isMenuOpen && (
            <>
              <motion.div className="mobile-drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMenuOpen(false)} />
              <motion.div className="mobile-drawer" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", damping: 25, stiffness: 220 }}>
                <div className="mobile-drawer-header">
                  <div className="brand">
                    <div className="brand-mark" style={{ width: 28, height: 28, background: "transparent" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" fill="none">
                        <path d="M15 80V40C15 22 42 22 42 40V80" stroke="url(#blueGrad)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M42 80V40C42 22 69 22 69 40V80" stroke="url(#greenGrad)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="42" cy="55" r="7" fill="#ffffff" stroke="#111827" strokeWidth={4} />
                      </svg>
                    </div>
                    <strong>ViaMorelia</strong>
                  </div>
                  <button className="close-drawer-button" type="button" onClick={() => setIsMenuOpen(false)}>✕</button>
                </div>
                <div className="mobile-drawer-content">
                  <div className="mobile-auth-container"><AuthMenu onMessage={setMessage} /></div>
                  <div style={{ flex: 1, overflowY: "auto", marginTop: 4 }}>{renderedLists}</div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Controls */}
        <div className="map-actions" aria-label="Controles del mapa">
          <button className="icon-button floating-button" type="button" onClick={requestLocation} aria-label="Centrar mapa en mi ubicación">
            <CrosshairIcon size={21} weight="bold" />
          </button>
          <button className="icon-button floating-button" type="button" onClick={() => setMessage("Selecciona una ruta de la lista.")} aria-label="Ver lista de rutas">
            <ListBulletsIcon size={21} />
          </button>
        </div>

        <AnimatePresence>
          {message && (
            <motion.div className="toast" role="status" aria-live="polite"
              initial={prefersReducedMotion ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}>
              {message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
