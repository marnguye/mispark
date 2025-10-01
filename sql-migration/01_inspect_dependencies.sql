-- =====================================================
-- 01_inspect_dependencies.sql
-- Inspekce všech závislostí na reports.user_id
-- =====================================================

-- 1. Zobrazit všechny RLS policies pro tabulku reports
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'reports' AND schemaname = 'public'
ORDER BY policyname;

-- 2. Zobrazit všechny constraints týkající se reports.user_id
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    tc.table_name,
    kcu.column_name,
    tc.is_deferrable,
    tc.initially_deferred,
    rc.match_option AS match_type,
    rc.update_rule,
    rc.delete_rule,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
    AND tc.table_schema = rc.constraint_schema
LEFT JOIN information_schema.constraint_column_usage ccu
    ON rc.unique_constraint_name = ccu.constraint_name
    AND rc.unique_constraint_schema = ccu.constraint_schema
WHERE tc.table_name = 'reports' 
    AND tc.table_schema = 'public'
    AND kcu.column_name = 'user_id';

-- 3. Zobrazit všechny indexy na reports.user_id
SELECT 
    i.relname AS index_name,
    t.relname AS table_name,
    a.attname AS column_name,
    ix.indisunique AS is_unique,
    ix.indisprimary AS is_primary,
    am.amname AS index_type
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON t.oid = a.attrelid AND a.attnum = ANY(ix.indkey)
JOIN pg_am am ON i.relam = am.oid
WHERE t.relname = 'reports' 
    AND a.attname = 'user_id'
    AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 4. Zobrazit všechny triggery na tabulce reports
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'reports' 
    AND event_object_schema = 'public';

-- 5. Zobrazit views, které referencují reports.user_id
SELECT DISTINCT
    v.table_name AS view_name,
    v.view_definition
FROM information_schema.views v
WHERE v.table_schema = 'public'
    AND v.view_definition ILIKE '%reports%user_id%';

-- 6. Zobrazit funkce, které mohou referencovat reports.user_id
SELECT 
    p.proname AS function_name,
    pg_get_function_result(p.oid) AS return_type,
    pg_get_function_arguments(p.oid) AS arguments,
    p.prosrc AS source_code
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND (p.prosrc ILIKE '%reports%' AND p.prosrc ILIKE '%user_id%');

-- 7. Zobrazit aktuální typ sloupce user_id
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'reports' 
    AND table_schema = 'public' 
    AND column_name = 'user_id';

-- 8. Zobrazit sample dat z reports.user_id (prvních 10 různých hodnot)
SELECT DISTINCT 
    user_id,
    CASE 
        WHEN user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
        THEN 'VALID_UUID'
        WHEN user_id ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' 
        THEN 'EMAIL'
        ELSE 'OTHER'
    END AS data_type_detected
FROM reports 
WHERE user_id IS NOT NULL
ORDER BY user_id
LIMIT 10;

-- 9. Statistiky dat
SELECT 
    COUNT(*) AS total_reports,
    COUNT(DISTINCT user_id) AS unique_user_ids,
    COUNT(CASE WHEN user_id IS NULL THEN 1 END) AS null_user_ids,
    COUNT(CASE WHEN user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 1 END) AS valid_uuid_count,
    COUNT(CASE WHEN user_id ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN 1 END) AS email_count
FROM reports;

-- =====================================================
-- OČEKÁVANÝ VÝSTUP:
-- =====================================================
-- 1. RLS policies: Měly by se zobrazit všechny policies na reports tabulce
-- 2. Constraints: Pravděpodobně žádné FK constraints na user_id
-- 3. Indexy: Možné indexy na user_id pro performance
-- 4. Triggery: Supabase může mít auth triggery
-- 5. Views: Žádné nebo views používající reports
-- 6. Funkce: RLS funkce nebo custom funkce
-- 7. Typ sloupce: Pravděpodobně 'text' nebo 'character varying'
-- 8. Sample data: Ukáže, jestli jsou to UUID, emaily nebo jiné hodnoty
-- 9. Statistiky: Celkový přehled dat pro plánování migrace
