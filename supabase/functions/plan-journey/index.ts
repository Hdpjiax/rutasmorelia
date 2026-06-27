import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

type Coordinate = { latitude: number; longitude: number };

function validCoordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== "object") return false;
  const coordinate = value as Coordinate;
  return Number.isFinite(coordinate.latitude) && Number.isFinite(coordinate.longitude) &&
    coordinate.latitude >= -90 && coordinate.latitude <= 90 &&
    coordinate.longitude >= -180 && coordinate.longitude <= 180;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const body = await req.json();
    if (!validCoordinate(body.origin) || !validCoordinate(body.destination)) {
      return new Response(
        JSON.stringify({ error: "Origen o destino inválido." }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // 1. Fetch direct options (0 transfers, close to both origin and destination)
    let directOptions: any[] = [];
    try {
      const { data, error } = await supabase.rpc("direct_journey_options", {
        p_origin_latitude: body.origin.latitude,
        p_origin_longitude: body.origin.longitude,
        p_destination_latitude: body.destination.latitude,
        p_destination_longitude: body.destination.longitude,
        p_max_walk_meters: 1500,
      });
      if (!error && data) {
        directOptions = data.map((option: any) => ({
          ...option,
          transfers: 0,
          type: "direct",
          estimatedMinutes: Math.max(
            8,
            Math.round((Number(option.origin_walk_meters ?? 0) + Number(option.destination_walk_meters ?? 0)) / 75 + Number(option.stops_count ?? 0) * 2.2),
          ),
        }));
      }
    } catch (err) {
      console.error("Direct journey options query failed:", err);
    }

    // 2. Fetch routes near origin (within 1.5km)
    let originRoutes: any[] = [];
    try {
      const { data, error } = await supabase.rpc("nearby_routes", {
        p_lat: body.origin.latitude,
        p_lng: body.origin.longitude,
        p_max_dist: 1500,
      });
      if (!error && data) {
        originRoutes = data;
      }
    } catch (err) {
      console.error("Origin nearby routes query failed:", err);
    }

    // 3. Fetch routes near destination (within 1.5km)
    let destRoutes: any[] = [];
    try {
      const { data, error } = await supabase.rpc("nearby_routes", {
        p_lat: body.destination.latitude,
        p_lng: body.destination.longitude,
        p_max_dist: 1500,
      });
      if (!error && data) {
        destRoutes = data;
      }
    } catch (err) {
      console.error("Destination nearby routes query failed:", err);
    }

    // 4. Combine results: direct options first, then unique nearby options
    const directRouteIds = new Set(directOptions.map((o) => o.route_id));
    const combinedOptions = [...directOptions];

    // Add unique routes near origin
    for (const r of originRoutes) {
      if (!directRouteIds.has(r.route_id)) {
        combinedOptions.push({
          route_id: r.route_id,
          route_name: r.route_name,
          route_code: r.route_code,
          route_color: r.route_color,
          origin_walk_meters: r.distance_meters,
          destination_walk_meters: 2200, // generic longer distance
          stops_count: 5,
          transfers: 1,
          type: "nearby_origin",
          estimatedMinutes: Math.max(12, Math.round(r.distance_meters / 75 + 10)),
        });
      }
    }

    // Add unique routes near destination
    for (const r of destRoutes) {
      const alreadyAdded = combinedOptions.some((o) => o.route_id === r.route_id);
      if (!alreadyAdded) {
        combinedOptions.push({
          route_id: r.route_id,
          route_name: r.route_name,
          route_code: r.route_code,
          route_color: r.route_color,
          origin_walk_meters: 2200, // generic longer distance
          destination_walk_meters: r.distance_meters,
          stops_count: 5,
          transfers: 1,
          type: "nearby_destination",
          estimatedMinutes: Math.max(12, Math.round(r.distance_meters / 75 + 10)),
        });
      }
    }

    return new Response(JSON.stringify({ data: combinedOptions }), { headers: jsonHeaders });

  } catch (error) {
    console.error("plan-journey error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to calculate journey" }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
