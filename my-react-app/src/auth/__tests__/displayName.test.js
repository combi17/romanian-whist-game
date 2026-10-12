import { describe, expect, it } from 'vitest';
import { displayName } from '../displayName.js';

/** A space is only restored when the sign-up trigger is known to have removed it. */
describe('displayName', () => {
  it('restores the space a flattened Google name lost', () => {
    expect(displayName('VladCristian', { full_name: 'Vlad Cristian' })).toBe('Vlad Cristian');
  });

  it('falls back to `name` when the provider sends that instead', () => {
    expect(displayName('AnaMaria', { name: 'Ana Maria' })).toBe('Ana Maria');
  });

  it('leaves a chosen username alone even when a full name is present', () => {
    expect(displayName('whistlord', { full_name: 'Vlad Cristian' })).toBe('whistlord');
  });

  it('leaves a name alone when the flattened form does not match exactly', () => {
    // de-duplication appended a digit, so this row is no longer a pure flatten
    expect(displayName('VladCristian2', { full_name: 'Vlad Cristian' })).toBe('VladCristian2');
  });

  it('does not invent a space in a genuinely single-word name', () => {
    expect(displayName('Andrei', { full_name: 'Andrei' })).toBe('Andrei');
  });

  it('does not split a run-together handle that no provider name explains', () => {
    expect(displayName('McDonald', {})).toBe('McDonald');
    expect(displayName('McDonald', undefined)).toBe('McDonald');
  });

  it('matches after the punctuation the trigger also strips', () => {
    expect(displayName('MariaIonescu', { full_name: "Maria  Ionescu " })).toBe('Maria Ionescu');
  });
});
