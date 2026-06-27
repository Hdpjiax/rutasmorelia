import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { corsHeaders } from "npm:@supabase/supabase-js@^2.95.0/cors";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const reportTypes = new Set([
  "incorrect_route", "incorrect_fare", "incorrect_path", "incorrect_stop",
  "outdated_information", "other",
]);

const handler = withSupabase({ auth: "user" }, async (req, ctx) => {
  try {
    const body = await req.json();
    const userId = ctx.userClaims?.id;
    const description = typeof body.description === "string" ? body.description.trim() : "";

    if (!userId || !reportTypes.has(body.reportType) || description.length < 10 || description.length > 2000) {
      return Response.json({ error: "El reporte contiene datos inválidos." }, { status: 400, headers: jsonHeaders });
    }

    const { data, error } = await ctx.supabase
      .from("reports")
      .insert({
        user_id: userId,
        report_type: body.reportType,
        route_id: Number.isSafeInteger(body.routeId) ? body.routeId : null,
        stop_id: Number.isSafeInteger(body.stopId) ? body.stopId : null,
        place_id: Number.isSafeInteger(body.placeId) ? body.placeId : null,
        description,
        attachment_path: typeof body.attachmentPath === "string" ? body.attachmentPath : null,
      })
      .select("id, status, created_at")
      .single();

    if (error) throw error;
    return Response.json({ data }, { status: 201, headers: jsonHeaders });
  } catch (error) {
    console.error("submit-report", error);
    return Response.json({ error: "No fue posible enviar el reporte." }, { status: 500, headers: jsonHeaders });
  }
});

export default {
  fetch(req: Request) {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return Response.json({ error: "Método no permitido." }, { status: 405, headers: jsonHeaders });
    return handler(req);
  },
};
