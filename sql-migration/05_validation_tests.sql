-- =====================================================
-- 05_validation_tests.sql
-- Validační testy po migraci
-- =====================================================

-- =====================================================
-- TEST 1: ZÁKLADNÍ VALIDACE STRUKTURY
-- =====================================================

SELECT '=== TEST 1: STRUKTURA TABULKY ===' AS test_section;

-- Ověření typu sloupce user_id
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'reports' 
    AND table_schema = 'public' 
    AND column_name = 'user_id';

-- =====================================================
-- TEST 2: FOREIGN KEY CONSTRAINTS
-- =====================================================

SELECT '=== TEST 2: FOREIGN KEY CONSTRAINTS ===' AS test_section;

-- Ověření existence foreign key constraint
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS references_table,
    ccu.column_name AS references_column,
    rc.delete_rule,
    rc.update_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu 
    ON tc.constraint_name = ccu.constraint_name
    AND tc.table_schema = ccu.constraint_schema
JOIN information_schema.referential_constraints rc 
    ON tc.constraint_name = rc.constraint_name
    AND tc.table_schema = rc.constraint_schema
WHERE tc.table_name = 'reports' 
    AND tc.table_schema = 'public'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'user_id';

-- =====================================================
-- TEST 3: RLS POLICIES
-- =====================================================

SELECT '=== TEST 3: RLS POLICIES ===' AS test_section;

-- Ověření RLS policies
SELECT 
    policyname,
    cmd,
    permissive,
    roles,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'reports' 
    AND schemaname = 'public'
ORDER BY policyname;

-- Ověření, že RLS je povoleno
SELECT 
    schemaname,
    tablename,
    rowsecurity,
    forcerowsecurity
FROM pg_tables 
WHERE tablename = 'reports' 
    AND schemaname = 'public';

-- =====================================================
-- TEST 4: DATA INTEGRITY
-- =====================================================

SELECT '=== TEST 4: DATA INTEGRITY ===' AS test_section;

-- Počet záznamů před a po migraci
SELECT 
    'Original backup' AS source,
    COUNT(*) AS total_records,
    COUNT(DISTINCT user_id) AS unique_user_ids
FROM reports_backup_20240919
UNION ALL
SELECT 
    'Migrated table' AS source,
    COUNT(*) AS total_records,
    COUNT(DISTINCT user_id) AS unique_user_ids
FROM reports;

-- Ověření, že všechny user_id mají odpovídající profily
SELECT 
    'Valid references' AS check_type,
    COUNT(*) AS count
FROM reports r
JOIN profiles p ON r.user_id = p.id
UNION ALL
SELECT 
    'Orphaned records' AS check_type,
    COUNT(*) AS count
FROM reports r
LEFT JOIN profiles p ON r.user_id = p.id
WHERE r.user_id IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 
    'NULL user_id' AS check_type,
    COUNT(*) AS count
FROM reports r
WHERE r.user_id IS NULL;

-- =====================================================
-- TEST 5: JOIN FUNKČNOST
-- =====================================================

SELECT '=== TEST 5: JOIN TESTS ===' AS test_section;

-- Test základního JOIN
SELECT 
    r.id AS report_id,
    r.user_id,
    p.email,
    p.id AS profile_id,
    CASE 
        WHEN p.id IS NOT NULL THEN 'JOIN_SUCCESS'
        ELSE 'JOIN_FAILED'
    END AS join_status
FROM reports r
LEFT JOIN profiles p ON r.user_id = p.id
LIMIT 10;

-- Test agregace s JOIN
SELECT 
    p.email,
    p.id AS profile_id,
    COUNT(r.id) AS reports_count
FROM profiles p
LEFT JOIN reports r ON p.id = r.user_id
GROUP BY p.id, p.email
HAVING COUNT(r.id) > 0
ORDER BY reports_count DESC
LIMIT 10;

-- =====================================================
-- TEST 6: SUPABASE CLIENT COMPATIBILITY
-- =====================================================

SELECT '=== TEST 6: SUPABASE CLIENT TESTS ===' AS test_section;

-- Simulace Supabase select s expand
-- Test, že tento dotaz bude fungovat v Supabase JS:
-- supabase.from('reports').select('*, profiles(email, username)')

SELECT 
    r.id,
    r.created_at,
    r.user_id,
    json_build_object(
        'id', p.id,
        'email', p.email,
        'username', COALESCE(p.username, p.email)
    ) AS profile_data
FROM reports r
JOIN profiles p ON r.user_id = p.id
LIMIT 5;

-- =====================================================
-- TEST 7: PERFORMANCE TESTY
-- =====================================================

SELECT '=== TEST 7: PERFORMANCE ===' AS test_section;

-- Ověření indexů
SELECT 
    i.relname AS index_name,
    t.relname AS table_name,
    a.attname AS column_name,
    ix.indisunique AS is_unique,
    ix.indisprimary AS is_primary
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON t.oid = a.attrelid AND a.attnum = ANY(ix.indkey)
WHERE t.relname = 'reports' 
    AND a.attname = 'user_id'
    AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Test rychlosti dotazu s WHERE klauzulí
EXPLAIN (ANALYZE, BUFFERS) 
SELECT COUNT(*) 
FROM reports r 
JOIN profiles p ON r.user_id = p.id 
WHERE r.user_id = (SELECT id FROM profiles LIMIT 1);

-- =====================================================
-- TEST 8: BEZPEČNOSTNÍ TESTY
-- =====================================================

SELECT '=== TEST 8: SECURITY TESTS ===' AS test_section;

-- Test RLS - simulace různých rolí
-- POZOR: Tyto testy budou fungovat pouze pokud máte nastavenou autentifikaci

-- Zkontrolujeme, že policies obsahují správné podmínky
SELECT 
    policyname,
    CASE 
        WHEN qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%' THEN 'USES_AUTH_UID'
        ELSE 'NO_AUTH_CHECK'
    END AS security_check,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'reports' 
    AND schemaname = 'public';

-- =====================================================
-- TEST 9: ROLLBACK READINESS
-- =====================================================

SELECT '=== TEST 9: ROLLBACK READINESS ===' AS test_section;

-- Ověření, že zálohy existují a jsou kompletní
SELECT 
    'Backup table exists' AS check_type,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reports_backup_20240919')
        THEN 'PASS'
        ELSE 'FAIL'
    END AS status
UNION ALL
SELECT 
    'Policies backup exists' AS check_type,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reports_policies_backup_20240919')
        THEN 'PASS'
        ELSE 'FAIL'
    END AS status
UNION ALL
SELECT 
    'Schema backup exists' AS check_type,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reports_schema_backup_20240919')
        THEN 'PASS'
        ELSE 'FAIL'
    END AS status;

-- =====================================================
-- SOUHRN VŠECH TESTŮ
-- =====================================================

SELECT '=== MIGRATION SUMMARY ===' AS test_section;

-- Celkový souhrn migrace
WITH migration_stats AS (
    SELECT 
        (SELECT COUNT(*) FROM reports_backup_20240919) AS original_count,
        (SELECT COUNT(*) FROM reports) AS current_count,
        (SELECT COUNT(*) FROM reports r JOIN profiles p ON r.user_id = p.id) AS valid_references,
        (SELECT COUNT(*) FROM reports WHERE user_id IS NULL) AS null_values,
        (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'reports') AS policies_count
)
SELECT 
    'Data preservation' AS metric,
    CASE 
        WHEN original_count = current_count THEN 'PASS'
        ELSE 'FAIL'
    END AS status,
    format('%s -> %s records', original_count, current_count) AS details
FROM migration_stats
UNION ALL
SELECT 
    'Foreign key integrity' AS metric,
    CASE 
        WHEN valid_references + null_values = current_count THEN 'PASS'
        ELSE 'FAIL'
    END AS status,
    format('%s valid refs, %s nulls, %s total', valid_references, null_values, current_count) AS details
FROM migration_stats
UNION ALL
SELECT 
    'Security policies' AS metric,
    CASE 
        WHEN policies_count >= 4 THEN 'PASS'
        ELSE 'FAIL'
    END AS status,
    format('%s policies created', policies_count) AS details
FROM migration_stats;

-- =====================================================
-- INSTRUKCE PRO POUŽITÍ
-- =====================================================
/*
POSTUP SPUŠTĚNÍ TESTŮ:

1. Spusťte celý tento skript v Supabase SQL editoru
2. Zkontrolujte všechny výstupy - všechny testy by měly být "PASS"
3. Pokud nějaký test selže:
   - TEST 1-2: Problém se strukturou - zkontrolujte migrační skript
   - TEST 3: Problém s policies - zkontrolujte RLS nastavení
   - TEST 4: Problém s daty - možná ztráta dat během migrace
   - TEST 5-6: Problém s JOIN - možná špatné mapování UUID
   - TEST 7: Performance problémy - možná chybí indexy
   - TEST 8: Bezpečnostní problémy - zkontrolujte policies
   - TEST 9: Rollback není možný - chybí zálohy

4. Pro testování Supabase JS klienta použijte:
   ```javascript
   const { data, error } = await supabase
     .from('reports')
     .select('*, profiles(email, username)')
     .limit(5);
   ```

5. Pokud všechny testy projdou, migrace byla úspěšná!
*/
