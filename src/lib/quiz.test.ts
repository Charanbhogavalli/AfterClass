import { describe, expect, it } from 'vitest';
import { computeMarks, scoreOf, type Answers } from './quiz';

const KEY: Answers = { q1: 'a', q2: 'b', q3: 'c', q4: 'd', q5: 'a' };

describe('computeMarks', () => {
  it('marks each question 1 when it matches the key and 0 otherwise', () => {
    const marks = computeMarks({ q1: 'a', q2: 'a', q3: 'c', q4: 'a', q5: 'b' }, KEY);
    expect(marks).toEqual({ q1: 1, q2: 0, q3: 1, q4: 0, q5: 0 });
    expect(scoreOf(marks)).toBe(2);
  });

  it('scores a perfect attempt as 5 and a fully wrong attempt as 0', () => {
    expect(scoreOf(computeMarks({ ...KEY }, KEY))).toBe(5);
    expect(scoreOf(computeMarks({ q1: 'b', q2: 'a', q3: 'd', q4: 'a', q5: 'b' }, KEY))).toBe(0);
  });
});
