-- Supabase Database Fixes for Mispark App
-- Run this script in your Supabase SQL Editor

-- 1. First, check if foreign key constraint exists and add it if missing
DO $$
BEGIN
    -- Check if the foreign key constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_reports_user_id' 
        AND table_name = 'reports'
    ) THEN
        -- Add the foreign key constraint
        ALTER TABLE reports 
        ADD CONSTRAINT fk_reports_user_id 
        FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
        
        RAISE NOTICE 'Foreign key constraint added successfully';
    ELSE
        RAISE NOTICE 'Foreign key constraint already exists';
    END IF;
END $$;

-- 2. Create the get_leaderboard() function
CREATE OR REPLACE FUNCTION get_leaderboard()
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  profile_photo_url TEXT,
  total_reports BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as user_id,
    p.username,
    p.profile_photo_url,
    COUNT(r.id) as total_reports
  FROM profiles p
  LEFT JOIN reports r ON p.id = r.user_id
  GROUP BY p.id, p.username, p.profile_photo_url
  HAVING COUNT(r.id) > 0
  ORDER BY total_reports DESC;
END;
$$ LANGUAGE plpgsql;

-- 3. Create the get_user_ranking() function
CREATE OR REPLACE FUNCTION get_user_ranking(target_user_id UUID)
RETURNS TABLE (
  rank BIGINT,
  total_reports BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH leaderboard AS (
    SELECT 
      p.id as user_id,
      COUNT(r.id) as total_reports,
      ROW_NUMBER() OVER (ORDER BY COUNT(r.id) DESC) as rank
    FROM profiles p
    LEFT JOIN reports r ON p.id = r.user_id
    GROUP BY p.id
    ORDER BY total_reports DESC
  )
  SELECT leaderboard.rank, leaderboard.total_reports 
  FROM leaderboard 
  WHERE leaderboard.user_id = target_user_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- 5. Test the functions (optional - you can run these to verify)
-- SELECT * FROM get_leaderboard() LIMIT 10;
-- SELECT * FROM get_user_ranking('your-user-id-here');

-- 6. Verify the foreign key relationship works
-- SELECT r.*, p.username, p.profile_photo_url 
-- FROM reports r 
-- JOIN profiles p ON r.user_id = p.id 
-- LIMIT 5;

RAISE NOTICE 'All database fixes applied successfully!';
