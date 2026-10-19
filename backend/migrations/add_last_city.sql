-- Remembers the last city per conversation. (The app also runs this automatically on first chat request.)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_city TEXT;
