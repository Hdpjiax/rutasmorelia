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

    // Run independent spatial lookups concurrently. They previously executed
    // sequentially, making every request pay three network/database round trips.
    let directOptions: any[] = [];
    let transferOptions: any[] = [];
    let originRoutes: any[] = [];
    let destRoutes: any[] = [];
    try {
      const [directResult, transferResult, originResult, destinationResult] = await Promise.all([
        supabase.rpc("direct_journey_options", {
        p_origin_latitude: body.origin.latitude,
        p_origin_longitude: body.origin.longitude,
        p_destination_latitude: body.destination.latitude,
        p_destination_longitude: body.destination.longitude,
        p_max_walk_meters: 1500,
        }),
        supabase.rpc("transfer_journey_options", {
          p_origin_latitude: body.origin.latitude,
          p_origin_longitude: body.origin.longitude,
          p_destination_latitude: body.destination.latitude,
          p_destination_longitude: body.destination.longitude,
          p_max_walk_meters: 1500,
          p_max_transfer_meters: 300,
        }),
        supabase.rpc("nearby_routes", {
          p_lat: body.origin.latitude,
          p_lng: body.origin.longitude,
          p_max_dist: 1500,
        }),
        supabase.rpc("nearby_routes", {
          p_lat: body.destination.latitude,
          p_lng: body.destination.longitude,
          p_max_dist: 1500,
        }),
      ]);

      if (!directResult.error && directResult.data) {
        directOptions = directResult.data.map((option: any) => ({
          ...option,
          transfers: 0,
          type: "direct",
          estimatedMinutes: Math.max(
            8,
            Math.round((Number(option.origin_walk_meters ?? 0) + Number(option.destination_walk_meters ?? 0)) / 75 + Number(option.stops_count ?? 0) * 2.2),
          ),
        }));
      }
      if (!transferResult.error && transferResult.data) {
        transferOptions = transferResult.data.map((option: any) => ({
          route_id: option.first_route_id,
          route_code: option.first_route_code,
          route_name: `${option.first_route_name} → ${option.second_route_name}`,
          route_color: option.first_route_color,
          second_route_id: option.second_route_id,
          second_route_code: option.second_route_code,
          second_route_name: option.second_route_name,
          second_route_color: option.second_route_color,
          origin_walk_meters: option.origin_walk_meters,
          destination_walk_meters: option.destination_walk_meters,
          transfer_walk_meters: option.transfer_walk_meters,
          transfers: 1,
          type: "transfer",
          estimatedMinutes: Math.max(18, Math.round((option.origin_walk_meters + option.destination_walk_meters + option.transfer_walk_meters) / 75 + 16)),
        }));
      }
      if (!originResult.error && originResult.data) originRoutes = originResult.data;
      if (!destinationResult.error && destinationResult.data) destRoutes = destinationResult.data;
      if (directResult.error) console.error("Direct journey options query failed:", directResult.error);
      if (originResult.error) console.error("Origin nearby routes query failed:", originResult.error);
      if (destinationResult.error) console.error("Destination nearby routes query failed:", destinationResult.error);
    } catch (err) {
      console.error("Journey lookup failed:", err);
    }

    // Filter out transfer options that are unnecessary.
    // A transfer option is unnecessary if either of its routes is already available as a direct option.
    const directRouteIds = new Set(directOptions.map((opt) => String(opt.route_code || opt.route_id)));
    const filteredTransferOptions = transferOptions.filter((opt) => {
      return !directRouteIds.has(String(opt.route_code || opt.route_id)) &&
             !directRouteIds.has(String(opt.second_route_code || opt.second_route_id));
    });

    // Combine results: direct options first, then unique nearby options
    const combinedOptions = [...directOptions, ...filteredTransferOptions];


    const rankedOptions = combinedOptions
      .sort((a, b) => Number(a.transfers) - Number(b.transfers) || Number(a.estimatedMinutes) - Number(b.estimatedMinutes))
      .slice(0, 20);

    return new Response(JSON.stringify({ data: rankedOptions }), { headers: jsonHeaders });

  } catch (error) {
    console.error("plan-journey error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to calculate journey" }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
