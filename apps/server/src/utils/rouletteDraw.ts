import { randomInt } from 'node:crypto';

// Each item has the same number of possible stopping positions.
const POSITION_STEPS = 1_000_000;

export function drawRoulette(itemCount: number, random: (max: number) => number = randomInt) {
  if (!Number.isSafeInteger(itemCount) || itemCount < 1) {
    throw new RangeError('A roulette draw requires at least one item');
  }

  const winnerIndex = random(itemCount);
  // Sample throughout the segment, including near its edges. Half a step keeps
  // the pointer off the exact boundary, where two items would be ambiguous.
  const position = (random(POSITION_STEPS) + 0.5) / POSITION_STEPS;
  const targetRotation = 360 - (winnerIndex + position) * (360 / itemCount);

  return { winnerIndex, targetRotation };
}
