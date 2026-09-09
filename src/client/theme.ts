/** Spielerfarben. Nur Darstellung, keine Regeln. */

/**
 * Sechs Spielerfarben, abgestimmt auf die Kachelgrafik.
 *
 * Kraeftig genug, um sich auf jedem Gelaende abzuheben, aber nicht so grell,
 * dass sie neben der gedaempften Pixel-Art wie Fremdkoerper wirken. Die
 * Reihenfolge ist so gewaehlt, dass die ersten beiden - Rot und Blau - auch
 * bei Rot-Gruen-Schwaeche klar auseinandergehen.
 */
export const PLAYER_COLORS = [
  '#c8402f', // Rot
  '#3a7ac2', // Blau
  '#e2a730', // Gold
  '#4f9e5c', // Gruen
  '#8f5bb0', // Violett
  '#efe3c8', // Elfenbein
];

export const playerColor = (i: number): string =>
  PLAYER_COLORS[i % PLAYER_COLORS.length]!;
