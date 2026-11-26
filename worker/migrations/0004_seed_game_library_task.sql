-- Add a third self-confirmed community task. This is a normal contact-page visit, not an ad view/click.
-- Never make ad impressions or clicks a condition for task completion.
INSERT OR IGNORE INTO tasks
  (id, kind, title, description, url, enabled, reward, reset_mode, sort_order, created_at, updated_at)
VALUES
  ('seed-game-library', 'custom', 'Visit the GameVerse community page',
   'Explore the GameVerse contact and community information, then return here to confirm.',
   'https://gameverse-kzyp.onrender.com/#contact', 1, 'access', 'inherit', 30,
   strftime('%s','now'), strftime('%s','now'));
