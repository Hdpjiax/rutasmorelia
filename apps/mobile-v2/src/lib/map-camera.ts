export type MapFitPadding = {top: number; right: number; bottom: number; left: number};

/** Padding for fitBounds — accounts for sheet height and floating chrome. */
export function mapFitPadding(sheetSnapIndex: number, routeView = false): MapFitPadding {
  if (routeView || sheetSnapIndex === 0) {
    return {top: 96, right: 24, bottom: 108, left: 24};
  }
  if (sheetSnapIndex === 1) {
    return {top: 120, right: 28, bottom: 168, left: 28};
  }
  return {top: 140, right: 28, bottom: 220, left: 28};
}

export function mapFitDuration(cached: boolean): number {
  return cached ? 140 : 260;
}