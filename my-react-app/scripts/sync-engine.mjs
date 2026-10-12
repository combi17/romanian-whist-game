/**
 * Copies the game engine from src/game into supabase/functions/_shared/game.
 *
 * The browser and the Edge Function run the same engine, but Vercel only
 * uploads my-react-app/ and the Supabase CLI only bundles supabase/functions/,
 * so the function gets a generated copy. shared-engine.test.js fails if the
 * two drift apart.
 *
 * Usage: npm run sync:engine
 */

import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '../src/game');
const dest = join(here, '../../supabase/functions/_shared/game');

const MODULES = ['deck.js', 'roundPlan.js', 'rules.js', 'scoring.js', 'engine.js', 'views.js', 'policy.js'];

mkdirSync(dest, { recursive: true });

for (const file of MODULES) {
  copyFileSync(join(src, file), join(dest, file));
  console.log(`synced ${file}`);
}

console.log(`\n${MODULES.length} modules copied to supabase/functions/_shared/game`);
