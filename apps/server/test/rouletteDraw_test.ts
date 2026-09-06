import assert from 'node:assert/strict';
import { drawRoulette } from '../src/utils/rouletteDraw';

function drawAt(itemCount: number, winner: number, position: number) {
  let calls = 0;
  return drawRoulette(itemCount, max => {
    if (calls++ === 0) {
      assert.equal(max, itemCount);
      return winner;
    }
    return Math.floor(position * max);
  });
}

describe('random stopping positions', () => {
  it('can stop near both edges and inside the same winning item', () => {
    const positions = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999999];
    const rotations = positions.map(position => drawAt(7, 3, position).targetRotation);
    assert.equal(new Set(rotations).size, positions.length);
    const start = 3 * 360 / 7;
    const width = 360 / 7;
    const firstPosition = (360 - rotations[0] - start) / width;
    const lastPosition = (360 - rotations[rotations.length - 1] - start) / width;
    assert.ok(firstPosition > 0 && firstPosition < 0.000001);
    assert.ok(lastPosition < 1 && lastPosition > 0.999999);
  });

  it('keeps the pointer within every selected item, including wraparound and narrow segments', () => {
    for (const count of [1, 2, 3, 7, 12, 360, 1000]) {
      for (let winner = 0; winner < count; winner++) {
        for (const position of [0, 0.25, 0.5, 0.75, 0.999999]) {
          const draw = drawAt(count, winner, position);
          assert.ok(draw.targetRotation > 0 && draw.targetRotation < 360);
          const pointerAngle = 360 - draw.targetRotation;
          assert.equal(Math.floor(pointerAngle / (360 / count)), winner);
          assert.equal(draw.winnerIndex, winner);
        }
      }
    }
  });

  it('does not change the winning item when only the within-item position changes', () => {
    const counts = Array(7).fill(0);
    for (let winner = 0; winner < 7; winner++) {
      for (const position of [0, 0.2, 0.4, 0.6, 0.8, 0.999999]) {
        counts[drawAt(7, winner, position).winnerIndex]++;
      }
    }
    assert.deepEqual(counts, Array(7).fill(6));
  });

  it('rejects empty and invalid item counts', () => {
    for (const count of [0, -1, 1.5, NaN, Infinity]) {
      assert.throws(() => drawRoulette(count), RangeError);
    }
  });
});
