import type { NextConfig } from "next";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(appDir, "../..");

function resolvePackageDir(pkg: string): string {
  const candidates = [
    path.join(appDir, "node_modules", pkg),
    path.join(monorepoRoot, "node_modules", pkg),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(appDir, "node_modules", pkg);
}

function toTurbopackAlias(absPath: string): string {
  const rel = path.relative(monorepoRoot, absPath).replace(/\\/g, "/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

const nextPkg = resolvePackageDir("next");
const maplibreGl = resolvePackageDir("maplibre-gl");
const swcHelpers = resolvePackageDir("@swc/helpers");
const framerMotion = resolvePackageDir("framer-motion");
const motion = resolvePackageDir("motion");

const nextConfig: NextConfig = {
  transpilePackages: ["@rutas-morelia/transit-core"],
  turbopack: {
    root: monorepoRoot,
    resolveAlias: {
      next: toTurbopackAlias(nextPkg),
      "maplibre-gl": toTurbopackAlias(maplibreGl),
      "@swc/helpers": toTurbopackAlias(swcHelpers),
      "@swc/helpers/_": toTurbopackAlias(path.join(swcHelpers, "_")),
      "framer-motion": toTurbopackAlias(framerMotion),
      motion: toTurbopackAlias(motion),
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      next: nextPkg,
      "maplibre-gl": maplibreGl,
      "@swc/helpers": swcHelpers,
      "framer-motion": framerMotion,
      motion,
    };
    return config;
  },
};

export default nextConfig;