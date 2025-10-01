-- =====================================================
-- 06_rollback.sql
-- Rollback skript pro vrácení migrace do původního stavu
-- =====================================================

-- VAROVÁNÍ: Tento skript vrátí tabulku reports do stavu před migrací
-- Všechny změny provedené po migraci budou ztraceny!
-- Spouštějte pouze v případě kritických problémů!

-- =====================================================
-- FÁZE 1: OVĚŘENÍ EXISTENCE ZÁLOH
-- =====================================================

-- Zkontrolujeme, že zálohy existují
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reports_backup_20240919') THEN
        RAISE EXCEPTION 'ROLLBACK FAILED: Backup table reports_backup_20240919 does not exist!';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reports_policies_backup_20240919') THEN
        RAISE EXCEPTION 'ROLLBACK FAILED: Policies backup table does not exist!';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reports_schema_backup_20240919') THEN
        RAISE EXCEPTION 'ROLLBACK FAILED: Schema backup table does not exist!';
    END IF;
    
    RAISE NOTICE 'All backup tables found. Rollback can proceed.';
END $$;

-- Zobrazíme statistiky před rollbackem
SELECT 'BEFORE ROLLBACK - Current state:' AS info;
SELECT 
    COUNT(*) AS current_reports_count,
    COUNT(DISTINCT user_id) AS unique_user_ids,
    pg_typeof(user_id) AS user_id_type
FROM reports
GROUP BY pg_typeof(user_id);

SELECT 
    COUNT(*) AS backup_reports_count,
    COUNT(DISTINCT user_id) AS unique_user_ids_backup
FROM reports_backup_20240919;

-- =====================================================
-- FÁZE 2: ODSTRANĚNÍ AKTUÁLNÍCH RLS POLICIES
-- =====================================================

SELECT 'Removing current RLS policies...' AS info;

-- Odstraníme všechny aktuální policies
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'reports' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.reports', policy_record.policyname);
        RAISE NOTICE 'Dropped policy: %', policy_record.policyname;
    END LOOP;
END $$;

-- =====================================================
-- FÁZE 3: ODSTRANĚNÍ FOREIGN KEY CONSTRAINTS
-- =====================================================

SELECT 'Removing foreign key constraints...' AS info;

-- Odstraníme foreign key constraint
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN 
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'reports' 
            AND tc.table_schema = 'public'
            AND tc.constraint_type = 'FOREIGN KEY'
            AND kcu.column_name = 'user_id'
    LOOP
        EXECUTE format('ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS %I', constraint_record.constraint_name);
        RAISE NOTICE 'Dropped constraint: %', constraint_record.constraint_name;
    END LOOP;
END $$;

-- =====================================================
-- FÁZE 4: ODSTRANĚNÍ INDEXŮ
-- =====================================================

SELECT 'Removing indexes on user_id...' AS info;

-- Odstraníme indexy na user_id (kromě primary key)
DO $$
DECLARE
    index_record RECORD;
BEGIN
    FOR index_record IN 
        SELECT i.relname AS index_name
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_attribute a ON t.oid = a.attrelid AND a.attnum = ANY(ix.indkey)
        WHERE t.relname = 'reports' 
            AND a.attname = 'user_id'
            AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
            AND NOT ix.indisprimary
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I', index_record.index_name);
        RAISE NOTICE 'Dropped index: %', index_record.index_name;
    END LOOP;
END $$;

-- =====================================================
-- FÁZE 5: OBNOVENÍ PŮVODNÍ STRUKTURY TABULKY
-- =====================================================

SELECT 'Restoring original table structure...' AS info;

-- Získáme původní typ sloupce ze zálohy
DO $$
DECLARE
    original_type TEXT;
    original_length INTEGER;
    original_nullable TEXT;
    original_default TEXT;
BEGIN
    SELECT 
        data_type,
        character_maximum_length,
        is_nullable,
        column_default
    INTO original_type, original_length, original_nullable, original_default
    FROM reports_schema_backup_20240919
    WHERE column_name = 'user_id';
    
    IF original_type IS NULL THEN
        RAISE EXCEPTION 'Could not find original user_id column definition in backup!';
    END IF;
    
    RAISE NOTICE 'Original type: %, length: %, nullable: %, default: %', 
                 original_type, original_length, original_nullable, original_default;
    
    -- Změníme typ sloupce zpět na původní
    IF original_length IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.reports ALTER COLUMN user_id TYPE %s(%s)', 
                      original_type, original_length);
    ELSE
        EXECUTE format('ALTER TABLE public.reports ALTER COLUMN user_id TYPE %s', 
                      original_type);
    END IF;
    
    -- Nastavíme nullable pokud bylo původně nullable
    IF original_nullable = 'YES' THEN
        EXECUTE 'ALTER TABLE public.reports ALTER COLUMN user_id DROP NOT NULL';
    ELSE
        EXECUTE 'ALTER TABLE public.reports ALTER COLUMN user_id SET NOT NULL';
    END IF;
    
    -- Nastavíme default hodnotu pokud existovala
    IF original_default IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.reports ALTER COLUMN user_id SET DEFAULT %s', 
                      original_default);
    END IF;
    
    RAISE NOTICE 'Column type successfully reverted to original';
END $$;

-- =====================================================
-- FÁZE 6: OBNOVENÍ PŮVODNÍCH DAT
-- =====================================================

SELECT 'Restoring original data...' AS info;

-- Smažeme aktuální data a obnovíme ze zálohy
TRUNCATE TABLE public.reports;

-- Obnovíme data ze zálohy
INSERT INTO public.reports 
SELECT * FROM reports_backup_20240919;

-- Ověříme obnovení dat
SELECT 
    COUNT(*) AS restored_records,
    COUNT(DISTINCT user_id) AS unique_user_ids
FROM reports;

-- =====================================================
-- FÁZE 7: OBNOVENÍ PŮVODNÍCH RLS POLICIES
-- =====================================================

SELECT 'Restoring original RLS policies...' AS info;

-- Obnovíme původní policies ze zálohy
DO $$
DECLARE
    policy_record RECORD;
    policy_sql TEXT;
BEGIN
    FOR policy_record IN 
        SELECT 
            policy_name,
            policy_cmd,
            policy_qual,
            policy_with_check,
            policy_roles
        FROM reports_policies_backup_20240919
    LOOP
        -- Sestavíme CREATE POLICY příkaz
        policy_sql := format('CREATE POLICY %I ON public.reports FOR %s', 
                           policy_record.policy_name, 
                           policy_record.policy_cmd);
        
        -- Přidáme TO klauzuli pokud existuje
        IF policy_record.policy_roles IS NOT NULL THEN
            policy_sql := policy_sql || format(' TO %s', array_to_string(policy_record.policy_roles, ', '));
        END IF;
        
        -- Přidáme USING klauzuli pokud existuje
        IF policy_record.policy_qual IS NOT NULL THEN
            policy_sql := policy_sql || format(' USING (%s)', policy_record.policy_qual);
        END IF;
        
        -- Přidáme WITH CHECK klauzuli pokud existuje
        IF policy_record.policy_with_check IS NOT NULL THEN
            policy_sql := policy_sql || format(' WITH CHECK (%s)', policy_record.policy_with_check);
        END IF;
        
        -- Spustíme příkaz
        EXECUTE policy_sql;
        RAISE NOTICE 'Restored policy: %', policy_record.policy_name;
    END LOOP;
END $$;

-- =====================================================
-- FÁZE 8: FINÁLNÍ VALIDACE ROLLBACKU
-- =====================================================

SELECT 'ROLLBACK VALIDATION:' AS info;

-- Porovnáme aktuální stav s původní zálohou
SELECT 
    'Data comparison' AS check_type,
    CASE 
        WHEN (SELECT COUNT(*) FROM reports) = (SELECT COUNT(*) FROM reports_backup_20240919)
        THEN 'PASS'
        ELSE 'FAIL'
    END AS status,
    format('Current: %s, Backup: %s', 
           (SELECT COUNT(*) FROM reports),
           (SELECT COUNT(*) FROM reports_backup_20240919)) AS details;

-- Zkontrolujeme typ sloupce
SELECT 
    'Column type' AS check_type,
    CASE 
        WHEN data_type != 'uuid' THEN 'PASS'
        ELSE 'FAIL'
    END AS status,
    format('Current type: %s', data_type) AS details
FROM information_schema.columns
WHERE table_name = 'reports' AND column_name = 'user_id';

-- Zkontrolujeme policies
SELECT 
    'RLS policies' AS check_type,
    CASE 
        WHEN COUNT(*) > 0 THEN 'PASS'
        ELSE 'FAIL'
    END AS status,
    format('%s policies restored', COUNT(*)) AS details
FROM pg_policies 
WHERE tablename = 'reports' AND schemaname = 'public';

-- Zkontrolujeme, že foreign key constraint neexistuje
SELECT 
    'Foreign key removed' AS check_type,
    CASE 
        WHEN COUNT(*) = 0 THEN 'PASS'
        ELSE 'FAIL'
    END AS status,
    format('%s FK constraints found', COUNT(*)) AS details
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'reports' 
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'user_id';

-- =====================================================
-- FÁZE 9: CLEANUP (VOLITELNÉ)
-- =====================================================

-- POZOR: Odkomentujte pouze pokud jste si jisti, že rollback proběhl úspěšně
-- a už nebudete potřebovat zálohy

/*
SELECT 'Cleaning up backup tables...' AS info;

DROP TABLE IF EXISTS public.reports_backup_20240919;
DROP TABLE IF EXISTS public.reports_policies_backup_20240919;
DROP TABLE IF EXISTS public.reports_schema_backup_20240919;

SELECT 'Backup tables cleaned up.' AS info;
*/

-- =====================================================
-- ROLLBACK DOKONČEN
-- =====================================================

SELECT 'ROLLBACK COMPLETED!' AS status;
SELECT 'Please verify that your application works correctly with the original data structure.' AS instruction;

-- Zobrazíme finální stav
SELECT 'FINAL STATE:' AS info;
SELECT 
    COUNT(*) AS total_reports,
    COUNT(DISTINCT user_id) AS unique_user_ids,
    pg_typeof(user_id) AS user_id_type
FROM reports
GROUP BY pg_typeof(user_id);

-- =====================================================
-- INSTRUKCE PO ROLLBACKU
-- =====================================================
/*
PO DOKONČENÍ ROLLBACKU:

1. Zkontrolujte, že všechny validační testy ukázaly "PASS"
2. Otestujte svou aplikaci s původní strukturou dat
3. Pokud vše funguje správně, můžete smazat záložní tabulky (odkomentujte sekci CLEANUP)
4. Pokud stále máte problémy, kontaktujte vývojáře pro další pomoc

POZNÁMKY:
- Rollback vrátil user_id na původní typ (pravděpodobně TEXT)
- Všechny foreign key constraints byly odstraněny
- Původní RLS policies byly obnoveny
- Data byla obnovena ze zálohy (změny po migraci byly ztraceny)

DALŠÍ KROKY:
- Pokud chcete migraci opakovat, nejprve vyřešte problémy, které vedly k rollbacku
- Ujistěte se, že všechna data jsou správně mapována před další migrací
- Zvažte testování migrace na kopii databáze před aplikací na produkci
*/
