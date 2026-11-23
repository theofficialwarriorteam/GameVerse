-- Starter tasks carried over from the previous community settings.
-- Edit or delete them in Admin → Tasks & Access. INSERT OR IGNORE keeps re-runs safe.
INSERT OR IGNORE INTO tasks (id, kind, title, description, url, enabled, reward, reset_mode, sort_order, created_at, updated_at) VALUES
 ('seed-youtube', 'youtube_visit', 'Visit our YouTube channel', 'Open the Winjo Gamerz channel on YouTube.', 'https://www.youtube.com/@Winjo_Gamerz', 1, 'access', 'inherit', 10, strftime('%s','now'), strftime('%s','now')),
 ('seed-discord', 'discord', 'Join our Discord server', 'Meet the GAMEVERSE community and get help from other players.', 'https://discord.gg/srtJVaprYj', 1, 'access', 'inherit', 20, strftime('%s','now'), strftime('%s','now'));
