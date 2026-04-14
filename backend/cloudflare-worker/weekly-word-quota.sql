-- VoltType — Weekly word quota for Free tier
-- Apply this migration in the Supabase SQL editor.
--
-- Adds a `words` column to volttype_usage and helper RPC to return
-- the rolling 7-day word count for a user.

-- 1) Add word counter column
ALTER TABLE volttype_usage
  ADD COLUMN IF NOT EXISTS words INT NOT NULL DEFAULT 0;

-- 2) Weekly word usage RPC (rolling 7-day window)
CREATE OR REPLACE FUNCTION volttype_get_weekly_words(p_user_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(words), 0)::INT
  FROM volttype_usage
  WHERE user_id = p_user_id
    AND created_at >= NOW() - INTERVAL '7 days';
$$;

-- 3) Update log-usage RPC to also accept words count
-- Drop and recreate so we can change the signature.
DROP FUNCTION IF EXISTS volttype_log_usage(UUID, INT, TEXT, TEXT);
DROP FUNCTION IF EXISTS volttype_log_usage(UUID, INT, TEXT, TEXT, INT);

CREATE OR REPLACE FUNCTION volttype_log_usage(
  p_user_id UUID,
  p_audio_seconds INT,
  p_model TEXT,
  p_request_type TEXT,
  p_words INT DEFAULT 0
) RETURNS VOID
LANGUAGE sql
AS $$
  INSERT INTO volttype_usage (user_id, audio_seconds, model, request_type, words)
  VALUES (p_user_id, p_audio_seconds, p_model, p_request_type, p_words);
$$;
