# Rutas Morelia Design System

## Product register

Product UI. The interface serves a time-sensitive mobility task and must disappear behind the journey decision.

## Scene and strategy

Daylight at a busy Morelia bus stop: readable at arm's length, usable with one hand, calm under time pressure. The color strategy is restrained. Neutral map and surfaces carry the information; olive identifies primary actions and active transport state, while terracotta is reserved for route distinction.

## Color

All application colors are defined as OKLCH tokens in `src/app/globals.css`.

- `--bg`: primary canvas and panel surface.
- `--surface`: grouped controls and hover states.
- `--ink`: primary text with enhanced contrast.
- `--muted`: supporting text that remains WCAG AA compliant.
- `--primary`: seed-derived olive for active state and brand recognition.
- `--accent`: terracotta for route differentiation, never a competing CTA.
- Light and dark themes preserve the same semantic roles.

## Typography

Geist Sans is the sole interface family. The product uses a compact fixed scale, sentence case and strong weight contrast. Headings use balanced wrapping; labels remain familiar and direct.

## Shape and elevation

- Controls: 12 px radius.
- Large panels: 16 px radius.
- Status badges: full pill only when the content is compact and stateful.
- Elevation is reserved for floating navigation, map controls and the planning sheet.

## Layout

- Mobile: full map with fixed top bar and reachable bottom planning sheet.
- Desktop: floating top bar and 380 px planning rail over a full-bleed map.
- Minimum interactive target: 44 by 44 px.
- The document never scrolls horizontally; long panel content scrolls within its own region.

## Motion

Motion communicates state changes only. Tab contents and transient messages use short 180-250 ms fades/translations. All effects obey `prefers-reduced-motion` and content remains visible without animation.

## Accessibility

WCAG 2.2 AA is the minimum. Every control has an accessible name, visible keyboard focus, non-color state indicator and sufficient touch area. Geospatial information must also be represented as searchable text or lists.
