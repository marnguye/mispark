-- =====================================================
-- 04_main_migration.sql
-- Hlavní migrační skript pro změnu user_id na UUID
-- =====================================================

-- DŮLEŽITÉ: Tento skript obsahuje kroky, které NELZE obalit do jedné transakce
-- kvůli DDL operacím (ALTER TABLE, DROP POLICY, CREATE POLICY)
-- Spouštějte postupně po sekcích a kontrolujte výsledky!

-- =====================================================
-- FÁZE 1: ODSTRANĚNÍ RLS POLICIES
-- =====================================================

-- Nejprve získáme seznam všech policies (pro debugging)
SELECT 'Current policies before removal:' AS info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'reports' AND schemaname = 'public';

-- Odstraníme všechny RLS policies na tabulce reports
-- POZOR: Upravte názvy policies podle výstupu z 01_inspect_dependencies.sql
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

-- Ověření, že policies byly odstraněny
SELECT 'Policies after removal:' AS info;
SELECT COUNT(*) AS remaining_policies FROM pg_policies WHERE tablename = 'reports' AND schemaname = 'public';

-- =====================================================
-- FÁZE 2: ODSTRANĚNÍ INDEXŮ A CONSTRAINTS
-- =====================================================

-- Odstraníme indexy na user_id (pokud existují)
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
            AND NOT ix.indisprimary  -- Neodstraňujeme primary key
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I', index_record.index_name);
        RAISE NOTICE 'Dropped index: %', index_record.index_name;
    END LOOP;
END $$;

-- =====================================================
-- FÁZE 3: MIGRACE DAT - VARIANTA A (Přímá změna typu)
-- =====================================================

-- POZOR: Tato varianta funguje pouze pokud všechny hodnoty jsou již validní UUID
-- nebo pokud můžeme použít USING klauzuli pro konverzi

-- Pokusíme se o přímou změnu typu s USING klauzulí
-- Nejprve vytvoříme mapovací funkci pro bezpečnou konverzi

CREATE OR REPLACE FUNCTION safe_uuid_conversion(input_text TEXT)
RETURNS UUID AS $$
BEGIN
    -- Pokud je vstup NULL, vrátíme NULL
    IF input_text IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Pokud je vstup již validní UUID
    IF input_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN input_text::UUID;
    END IF;
    
    -- Pokud je vstup email, pokusíme se najít odpovídající profile
    IF input_text ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN
        RETURN (SELECT id FROM profiles WHERE email = input_text LIMIT 1);
    END IF;
    
    -- Jinak vrátíme NULL (bude potřeba manuální řešení)
    RETURN NULL;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Testujeme konverzní funkci
SELECT 'Testing conversion function:' AS info;
SELECT DISTINCT 
    user_id,
    safe_uuid_conversion(user_id) AS converted_uuid,
    CASE 
        WHEN safe_uuid_conversion(user_id) IS NOT NULL THEN 'SUCCESS'
        ELSE 'FAILED'
    END AS conversion_status
FROM reports 
WHERE user_id IS NOT NULL
LIMIT 10;

-- Spočítáme, kolik záznamů se nepodaří převést
SELECT 
    COUNT(*) AS total_records,
    COUNT(CASE WHEN safe_uuid_conversion(user_id) IS NOT NULL THEN 1 END) AS convertible_records,
    COUNT(CASE WHEN safe_uuid_conversion(user_id) IS NULL AND user_id IS NOT NULL THEN 1 END) AS problematic_records
FROM reports;

-- =====================================================
-- FÁZE 4: ZMĚNA TYPU SLOUPCE
-- =====================================================

-- VARIANTA A: Přímá změna typu (použijte pokud všechny hodnoty jsou konvertibilní)
ALTER TABLE public.reports 
ALTER COLUMN user_id TYPE UUID 
USING safe_uuid_conversion(user_id);

-- VARIANTA B: Pokud varianta A selže, použijte postupnou migraci
-- (Odkomentujte následující sekci a zakomentujte variantu A)

/*
-- Přidáme nový sloupec
ALTER TABLE public.reports ADD COLUMN user_uuid UUID;

-- Naplníme nový sloupec
UPDATE public.reports 
SET user_uuid = safe_uuid_conversion(user_id);

-- Zkontrolujeme, že migrace proběhla správně
SELECT 
    COUNT(*) AS total_records,
    COUNT(user_id) AS old_column_filled,
    COUNT(user_uuid) AS new_column_filled,
    COUNT(CASE WHEN user_id IS NOT NULL AND user_uuid IS NULL THEN 1 END) AS failed_conversions
FROM reports;

-- Pokud je vše v pořádku, odstraníme starý sloupec a přejmenujeme nový
ALTER TABLE public.reports DROP COLUMN user_id;
ALTER TABLE public.reports RENAME COLUMN user_uuid TO user_id;
*/

-- Vyčistíme pomocnou funkci
DROP FUNCTION IF EXISTS safe_uuid_conversion(TEXT);

-- =====================================================
-- FÁZE 5: PŘIDÁNÍ FOREIGN KEY CONSTRAINT
-- =====================================================

-- Přidáme foreign key constraint
ALTER TABLE public.reports 
ADD CONSTRAINT fk_reports_user_id 
FOREIGN KEY (user_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;

-- Ověříme, že constraint byl přidán
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
WHERE tc.table_name = 'reports' AND tc.constraint_type = 'FOREIGN KEY';

-- =====================================================
-- FÁZE 6: VYTVOŘENÍ INDEXU PRO PERFORMANCE
-- =====================================================

-- Vytvoříme index na user_id pro lepší performance
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON public.reports(user_id);

-- =====================================================
-- FÁZE 7: OBNOVENÍ RLS POLICIES
-- =====================================================

-- Povolíme RLS na tabulce (pokud nebyl povolen)
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Vytvoříme bezpečné RLS policies

-- Policy 1: Authenticated users can insert their own reports
CREATE POLICY "Users can insert their own reports" ON public.reports
    FOR INSERT 
    TO authenticated 
    WITH CHECK (auth.uid() = user_id);

-- Policy 2: Users can view their own reports
CREATE POLICY "Users can view their own reports" ON public.reports
    FOR SELECT 
    TO authenticated 
    USING (auth.uid() = user_id);

-- Policy 3: Users can update their own reports
CREATE POLICY "Users can update their own reports" ON public.reports
    FOR UPDATE 
    TO authenticated 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy 4: Users can delete their own reports
CREATE POLICY "Users can delete their own reports" ON public.reports
    FOR DELETE 
    TO authenticated 
    USING (auth.uid() = user_id);

-- Policy 5: Public read access (odkomentujte pokud potřebujete)
-- CREATE POLICY "Public can view reports" ON public.reports
--     FOR SELECT 
--     TO public 
--     USING (true);

-- Ověříme, že policies byly vytvořeny
SELECT 'New policies created:' AS info;
SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'reports' AND schemaname = 'public';

-- =====================================================
-- FÁZE 8: FINÁLNÍ VALIDACE
-- =====================================================

-- Zkontrolujeme typ sloupce
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'reports' AND column_name = 'user_id';

-- Zkontrolujeme, že všechny user_id mají odpovídající profile
SELECT 
    'Valid foreign keys' AS check_type,
    COUNT(*) AS count
FROM reports r
JOIN profiles p ON r.user_id = p.id

UNION ALL

SELECT 
    'Invalid foreign keys' AS check_type,
    COUNT(*) AS count
FROM reports r
LEFT JOIN profiles p ON r.user_id = p.id
WHERE r.user_id IS NOT NULL AND p.id IS NULL;

-- Testovací JOIN dotaz
SELECT 
    r.id,
    r.user_id,
    p.email,
    p.id AS profile_id
FROM reports r
JOIN profiles p ON r.user_id = p.id
LIMIT 5;

SELECT 'Migration completed successfully!' AS status;
