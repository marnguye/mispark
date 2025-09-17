# Supabase Database Schema

## Required Tables

### 1. profiles
```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  username TEXT UNIQUE,
  birthdate DATE,
  profile_photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view all profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
```

### 2. reports
```sql
CREATE TABLE reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  license_plate TEXT,
  photo_url TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'active'
);

-- Enable RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view all reports" ON reports FOR SELECT USING (true);
CREATE POLICY "Users can insert their own reports" ON reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own reports" ON reports FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reports" ON reports FOR DELETE USING (auth.uid() = user_id);
```

### Foreign Key Setup
```sql
-- If tables already exist, add the foreign key constraint:
ALTER TABLE reports 
ADD CONSTRAINT fk_reports_user_id 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
```

## Required Storage Buckets

### 1. report-photos
```sql
-- Create bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('report-photos', 'report-photos', true);

-- Policies
CREATE POLICY "Anyone can view report photos" ON storage.objects FOR SELECT USING (bucket_id = 'report-photos');
CREATE POLICY "Authenticated users can upload report photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'report-photos' AND auth.role() = 'authenticated');
CREATE POLICY "Users can update their own report photos" ON storage.objects FOR UPDATE USING (bucket_id = 'report-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own report photos" ON storage.objects FOR DELETE USING (bucket_id = 'report-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
```

### 2. profile-photos (if not exists)
```sql
-- Create bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('profile-photos', 'profile-photos', true);

-- Policies
CREATE POLICY "Anyone can view profile photos" ON storage.objects FOR SELECT USING (bucket_id = 'profile-photos');
CREATE POLICY "Authenticated users can upload profile photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'profile-photos' AND auth.role() = 'authenticated');
CREATE POLICY "Users can update their own profile photos" ON storage.objects FOR UPDATE USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own profile photos" ON storage.objects FOR DELETE USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
```

## Realtime Configuration

Enable realtime for the reports table:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE reports;
```

## Foreign Key Constraints

### Add Foreign Key Relationship
```sql
-- Add foreign key constraint if it doesn't exist
ALTER TABLE reports 
ADD CONSTRAINT fk_reports_user_id 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
```

## RPC Functions

### Function to Get Leaderboard Data
```sql
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
```

### Function to Get User Ranking
```sql
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
```

## Indexes for Performance

```sql
-- Index for faster queries by user
CREATE INDEX idx_reports_user_id ON reports(user_id);

-- Index for faster queries by creation date
CREATE INDEX idx_reports_created_at ON reports(created_at DESC);

-- Index for location-based queries
CREATE INDEX idx_reports_location ON reports(latitude, longitude);

-- Index for leaderboard performance
CREATE INDEX idx_profiles_username ON profiles(username);
```
