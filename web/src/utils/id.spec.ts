import { describe, expect, it } from 'vitest';
import { newId } from '@/utils/id';

describe('newId', () => {
  it('uuid v4 格式', () => {
    expect(newId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('不重复', () => {
    expect(newId()).not.toBe(newId());
  });
});
