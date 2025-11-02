import { describe, it, expect } from 'vitest';
import { cn } from '../utils';

describe('cn utility', () => {
  it('should merge class names', () => {
    expect(cn('px-2 py-1', 'px-3')).toBe('py-1 px-3');
  });

  it('should handle conditional classes', () => {
    expect(cn('base-class', true && 'conditional-class', false && 'hidden-class')).toBe(
      'base-class conditional-class'
    );
  });

  it('should handle arrays of classes', () => {
    expect(cn(['class-1', 'class-2'], 'class-3')).toBe('class-1 class-2 class-3');
  });

  it('should handle objects with boolean values', () => {
    expect(
      cn({
        'class-1': true,
        'class-2': false,
        'class-3': true,
      })
    ).toBe('class-1 class-3');
  });

  it('should merge conflicting Tailwind classes', () => {
    // The latter class should override the former
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
    expect(cn('p-4', 'p-2')).toBe('p-2');
  });

  it('should handle empty or undefined inputs', () => {
    expect(cn()).toBe('');
    expect(cn(undefined, null, '')).toBe('');
  });
});
