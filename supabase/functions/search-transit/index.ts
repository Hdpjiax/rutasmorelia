import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    
    const authHeader = req.headers.get("Authorization");
    
    // Create Supabase client forwarding authorization header for security context
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });

    const body = await req.json();
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const limit = typeof body.limit === "number" ? body.limit : 8;

    if (query.length < 2) {
      return new Response(JSON.stringify({ data: [] }), { headers: jsonHeaders });
    }

    // Resolve authenticated user ID from JWT if logged in
    let userId: string | null = null;
    if (authHeader) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (!userError && user) {
          userId = user.id;
        }
      } catch (err) {
        console.error("Error resolving user from token:", err);
      }
    }

    // 1. Query Supabase local routes, stops and places via RPC, passing user ID for favorites prioritization
    let dbResults: any[] = [];
    try {
      const { data, error } = await supabase.rpc("search_transit", {
        p_query: query,
        p_city_id: null,
        p_limit: limit,
        p_user_id: userId,
      });
      if (!error && data) {
        // Exclude routes since they are handled separately on the client's sidebar lists
        dbResults = data.filter((item: any) => item.entity_type !== "route");
      } else if (error) {
        console.error("search_transit RPC error:", error);
      }
    } catch (dbErr) {
      console.error("Local DB query failed:", dbErr);
    }

    // 2. Query Nominatim OpenStreetMap for streets and addresses in Morelia
    let geoResults: any[] = [];
    try {
      const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}+Morelia&format=json&limit=5&addressdetails=1&accept-language=es`;
      
      const geoRes = await fetch(geocodeUrl, {
        headers: {
          "User-Agent": "SIMUM-Morelia-Transit-App (antogar89.b@gmail.com)",
        },
      });

      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (Array.isArray(geoData)) {
          geoResults = geoData.map((item: any, idx: number) => {
            const parts = item.display_name.split(",");
            const label = parts[0].trim();
            const subtitle = parts.slice(1, 4).join(",").trim(); // E.g. "Morelia, Michoacán, México"
            
            return {
              entity_type: "place",
              entity_id: 900000 + idx,
              label: label,
              subtitle: subtitle || "Morelia, Michoacán",
              latitude: parseFloat(item.lat),
              longitude: parseFloat(item.lon),
            };
          });
        }
      }
    } catch (geoErr) {
      console.error("Nominatim geocoding failed:", geoErr);
    }

    // 3. Merge and return results
    const combined = [...dbResults, ...geoResults];
    return new Response(JSON.stringify({ data: combined }), { headers: jsonHeaders });

  } catch (error) {
    console.error("search-transit error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to process search" }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
