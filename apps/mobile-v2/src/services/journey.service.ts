import type {Coordinates, JourneyOption} from '@rutas-morelia/transit-core';
import type {SupabaseClient} from '@supabase/supabase-js';

export type JourneyClient = Pick<SupabaseClient, 'functions'>;

export async function planJourney(
  client: JourneyClient | null,
  origin: Coordinates,
  destination: Coordinates,
): Promise<{options: JourneyOption[]; error: string | null}> {
  if (!client) {
    return {options: [], error: 'Supabase no configurado'};
  }

  try {
    const {data, error} = await client.functions.invoke('plan-journey', {
      body: {origin, destination},
    });
    const options = (data?.data ?? []) as JourneyOption[];
    if (error) return {options: [], error: 'No pudimos calcular el viaje'};
    if (!options.length) return {options: [], error: 'Aún no hay una ruta directa'};
    return {options, error: null};
  } catch {
    return {options: [], error: 'Error de red al calcular el viaje'};
  }
}