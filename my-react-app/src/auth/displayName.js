/**
 * The name to show for a player.
 *
 * Older profile rows stored Google names with the spaces stripped ("Ana
 * Maria" became "AnaMaria"). The provider's `full_name` is used instead
 * only when removing its spaces gives back the stored username exactly, so a
 * name someone chose at sign-up is never changed.
 */
export function displayName(username, userMetadata) {
  if (!username) return username;

  const provided =
    firstNonEmpty(userMetadata?.full_name, userMetadata?.name) ?? null;
  if (!provided) return username;

  const spaced = provided.replace(/\s+/g, ' ').trim();
  if (!spaced.includes(' ')) return username;

  const flattened = spaced.replace(/[^a-zA-Z0-9_]/g, '');
  return flattened === username ? spaced : username;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}
