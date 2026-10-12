import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * The Edge Function uses a copy of the engine in
 * `supabase/functions/_shared/game/`. This fails if the copy is out of date.
 *
 * Run `npm run sync:engine` after changing anything in src/game.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..');
const shared = join(here, '../../../../supabase/functions/_shared/game');

const MODULES = ['deck.js', 'roundPlan.js', 'rules.js', 'scoring.js', 'engine.js', 'views.js', 'policy.js'];

describe('the Edge Function copy of the engine', () => {
  it('exists', () => {
    expect(existsSync(shared)).toBe(true);
  });

  it.each(MODULES)('%s is byte-for-byte identical to the source', (file) => {
    const a = readFileSync(join(src, file), 'utf8');
    const b = readFileSync(join(shared, file), 'utf8');

    expect(
      b,
      `supabase/functions/_shared/game/${file} has drifted from src/game/${file}. ` +
        'Run: npm run sync:engine',
    ).toBe(a);
  });
});
