const DURATION_BY_CATEGORY: Array<[RegExp, number]> = [
  [/theme park|amusement/, 360],
  [/museum|gallery|art/, 120],
  [/zoo|aquarium|water park/, 180],
  [/shopping|mall/, 120],
  [/market/, 75],
  [/temple|shrine|mosque|church|cathedral/, 75],
  [/park|garden|nature|reserve/, 90],
  [/historic|heritage|old town|castle|palace|fort/, 90],
  [/beach/, 120],
  [/observation|tower|viewpoint|lookout/, 60],
  [/landmark|monument|square|plaza/, 45],
  [/bakery|dessert|ice cream|cafe|café|coffee/, 45],
  [/bar|pub|lounge|nightlife|club/, 90],
  [/fast food|street food|hawker|ramen/, 45],
  [/restaurant|food|dining|kitchen|grill|bistro/, 60],
];

/** Planning estimate only; provider data does not confirm dwell time. */
export function estimateVisitDuration(category: string): number {
  const value = category.toLowerCase();
  return DURATION_BY_CATEGORY.find(([pattern]) => pattern.test(value))?.[1] ?? 75;
}
