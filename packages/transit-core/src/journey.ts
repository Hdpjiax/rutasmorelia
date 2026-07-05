import type {JourneyOption} from './types';

export function hasTransfers(option: JourneyOption): boolean {
  return Number(option.transfers || 0) > 0;
}

export function filterJourneyOptions(options: JourneyOption[], tab: 'direct' | 'transfer'): JourneyOption[] {
  return options.filter(option => (tab === 'direct' ? !hasTransfers(option) : hasTransfers(option)));
}

export function countJourneyOptions(options: JourneyOption[], tab: 'direct' | 'transfer'): number {
  return filterJourneyOptions(options, tab).length;
}

export function formatJourneyDetail(option: JourneyOption): string {
  const walkOrigin = Math.round(Number(option.origin_walk_meters || 0));
  const walkDest = Math.round(Number(option.destination_walk_meters || 0));
  const boarding = option.boarding_stop_name || 'Parada cercana';
  const alighting = option.alighting_stop_name || 'Parada destino';

  if (hasTransfers(option)) {
    const walkTransfer = Math.round(Number(option.transfer_walk_meters || 0));
    return `🚶 Camina ${walkOrigin} m\n📥 Sube: ${boarding}\n🔄 Transbordo a ${option.second_route_name} (camina ${walkTransfer} m)\n🏁 Baja: ${alighting} · camina ${walkDest} m`;
  }
  return `🚶 Camina ${walkOrigin} m\n📥 Sube: ${boarding}\n🏁 Baja: ${alighting} · camina ${walkDest} m al destino`;
}

export function selectInitialJourneyTab(options: JourneyOption[]): 'direct' | 'transfer' {
  const hasDirect = options.some(option => !hasTransfers(option));
  return hasDirect ? 'direct' : 'transfer';
}

export function selectInitialJourneyRouteId(options: JourneyOption[]): string | null {
  const tab = selectInitialJourneyTab(options);
  const pool = filterJourneyOptions(options, tab);
  const first = pool[0];
  if (!first) return null;
  return String(first.route_code || first.route_id);
}