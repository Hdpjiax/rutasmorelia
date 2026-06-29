import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiHost = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${apiHost}/v1/traffic`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to fetch traffic from NestJS: ${res.statusText}`);
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Traffic API Proxy error:", error);
    // Return empty GeoJSON collection as fallback to prevent client errors
    return NextResponse.json(
      { type: "FeatureCollection", features: [] },
      { status: 200 }
    );
  }
}
