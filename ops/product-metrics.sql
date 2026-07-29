SELECT
  COUNT(DISTINCT CASE WHEN name = 'visited' THEN session_hash END) AS users,
  COUNT(DISTINCT CASE WHEN name = 'created' THEN session_hash END) AS creators,
  COUNT(DISTINCT CASE WHEN name = 'edited' THEN session_hash END) AS editors,
  COUNT(DISTINCT CASE WHEN name = 'shared' THEN session_hash END) AS sharers,
  COUNT(DISTINCT CASE WHEN name = 'printed' THEN session_hash END) AS printers,
  COUNT(DISTINCT CASE WHEN name = 'exported' THEN session_hash END) AS exporters,
  COUNT(DISTINCT CASE WHEN name IN ('printed', 'exported') THEN session_hash END) AS outputters,
  COUNT(DISTINCT CASE WHEN name = 'returned' THEN session_hash END) AS returned,
  COUNT(DISTINCT CASE WHEN name = 'visited' AND occurred_on >= date('now', '-6 days') THEN session_hash END) AS users_7d,
  COUNT(DISTINCT CASE WHEN name = 'created' AND occurred_on >= date('now', '-6 days') THEN session_hash END) AS creators_7d,
  (SELECT COUNT(*) FROM trips WHERE expires_at >= unixepoch()) AS active_trips,
  (SELECT COUNT(*) FROM trips WHERE revision >= 2 AND expires_at >= unixepoch()) AS edited_trips,
  (SELECT COUNT(*) FROM trips WHERE json_array_length(json_extract(plan_json, '$.travelers')) >= 2 AND expires_at >= unixepoch()) AS collaborative_trips,
  (SELECT COALESCE(SUM(revision - 1), 0) FROM trips WHERE expires_at >= unixepoch()) AS save_actions
FROM product_events;
