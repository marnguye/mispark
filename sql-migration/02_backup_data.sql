-- =====================================================
-- 02_backup_data.sql
-- Bezpečná záloha tabulky reports před migrací
-- =====================================================

-- Vytvoření záložní tabulky s aktuálním datem
-- POZOR: Nahraďte YYYYMMDD aktuálním datem (např. 20240919)
CREATE TABLE IF NOT EXISTS public.reports_backup_20240919 AS 
SELECT * FROM public.reports;

-- Ověření, že záloha byla vytvořena správně
SELECT 
    'Original table' AS source,
    COUNT(*) AS row_count,
    COUNT(DISTINCT user_id) AS unique_user_ids,
    MIN(created_at) AS oldest_record,
    MAX(created_at) AS newest_record
FROM public.reports
UNION ALL
SELECT 
    'Backup table' AS source,
    COUNT(*) AS row_count,
    COUNT(DISTINCT user_id) AS unique_user_ids,
    MIN(created_at) AS oldest_record,
    MAX(created_at) AS newest_record
FROM public.reports_backup_20240919;

-- Záloha RLS policies (pro pozdější obnovení)
-- Vytvoření tabulky pro uložení policy definic
CREATE TABLE IF NOT EXISTS public.reports_policies_backup_20240919 (
    policy_name TEXT,
    policy_cmd TEXT,
    policy_qual TEXT,
    policy_with_check TEXT,
    policy_roles TEXT[],
    backup_timestamp TIMESTAMP DEFAULT NOW()
);

-- Uložení aktuálních policies
INSERT INTO public.reports_policies_backup_20240919 (
    policy_name, 
    policy_cmd, 
    policy_qual, 
    policy_with_check, 
    policy_roles
)
SELECT 
    policyname,
    cmd,
    qual,
    with_check,
    roles
FROM pg_policies 
WHERE tablename = 'reports' AND schemaname = 'public';

-- Ověření zálohy policies
SELECT 
    policy_name,
    policy_cmd,
    backup_timestamp
FROM public.reports_policies_backup_20240919
ORDER BY policy_name;

-- Záloha struktury tabulky (pro rollback)
CREATE TABLE IF NOT EXISTS public.reports_schema_backup_20240919 AS
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default,
    ordinal_position
FROM information_schema.columns
WHERE table_name = 'reports' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- Zobrazení informací o zálohách
SELECT 
    schemaname,
    tablename,
    tableowner,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables 
WHERE tablename LIKE 'reports%backup%20240919'
ORDER BY tablename;

-- =====================================================
-- INSTRUKCE:
-- =====================================================
-- 1. Před spuštěním nahraďte "20240919" aktuálním datem
-- 2. Spusťte celý skript v Supabase SQL editoru
-- 3. Ověřte, že počet řádků v záloze odpovídá originálu
-- 4. Záloha bude obsahovat:
--    - reports_backup_YYYYMMDD: Kompletní kopie dat
--    - reports_policies_backup_YYYYMMDD: Záloha RLS policies
--    - reports_schema_backup_YYYYMMDD: Záloha struktury tabulky
-- =====================================================
