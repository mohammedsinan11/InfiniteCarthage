/** Spielerfarben und Jahreszeiten. Nur Darstellung, keine Regeln. */

import type { Season } from '../core/season';

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

/**
 * Farbstimmung je Jahreszeit.
 *
 * Wird als halbdurchsichtige Schicht ueber das Gelaende gelegt, nicht in die
 * Kacheln gerechnet: so bleibt eine Wiese als Wiese erkennbar, faerbt sich im
 * Herbst aber warm und im Winter kalt. Der Sommer bekommt bewusst fast
 * nichts - er ist der Normalzustand, gegen den die anderen wirken.
 *
 * mode 'multiply' dunkelt und saettigt, 'screen' hellt auf. Winter braucht
 * beides: erst kuehl abdunkeln waere falsch, Schnee ist hell.
 */
export const SEASON_TINT: Record<
  Season,
  { color: string; alpha: number; mode: 'multiply' | 'screen' }
> = {
  spring: { color: '#9fe08a', alpha: 0.14, mode: 'multiply' },
  summer: { color: '#ffe9a8', alpha: 0.06, mode: 'multiply' },
  autumn: { color: '#e08a3c', alpha: 0.2, mode: 'multiply' },
  winter: { color: '#bcd6f0', alpha: 0.26, mode: 'screen' },
};
