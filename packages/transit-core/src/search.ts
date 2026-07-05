export function normalizeString(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function editDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

export function stringSimilarity(s1: string, s2: string): number {
  let longer = s1;
  let shorter = s2;
  if (s1.length < s2.length) {
    longer = s2;
    shorter = s1;
  }
  if (!longer.length) return 1.0;
  return (longer.length - editDistance(longer, shorter)) / longer.length;
}

export function expandSearchQuery(query: string): string[] {
  const expanded = query.replace(/\bblvd\.?\b/gi, 'boulevard').replace(/\bav\.?\b/gi, 'avenida');
  return [...new Set([query, expanded])];
}

type ScoredRoute<T extends {name: string; id?: string}> = {route: T; score: number};

export function scoreRoutesByQuery<T extends {name: string; id?: string}>(
  routes: T[],
  query: string,
  minScore = 0.35,
): T[] {
  const normQuery = normalizeString(query);
  return routes
    .map(route => {
      const normName = normalizeString(route.name);
      const normCode = normalizeString(route.id || '');
      let score = 0;
      if (normName.includes(normQuery) || normCode.includes(normQuery)) {
        score = 1.0;
      } else {
        score = Math.max(stringSimilarity(normName, normQuery), stringSimilarity(normCode, normQuery));
      }
      return {route, score} as ScoredRoute<T>;
    })
    .filter(item => item.score > minScore)
    .sort((a, b) => b.score - a.score || a.route.name.localeCompare(b.route.name, 'es-MX'))
    .map(item => item.route);
}