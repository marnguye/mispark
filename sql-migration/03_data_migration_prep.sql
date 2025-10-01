-- =====================================================
-- 03_data_migration_prep.sql
-- Detekce a příprava dat pro migraci user_id na UUID
-- =====================================================

-- 1. DETEKCE NEVALIDNÍCH UUID HODNOT
-- Zobrazí všechny user_id hodnoty, které nejsou ve formátu UUID
SELECT DISTINCT 
    user_id,
    CASE 
        WHEN user_id IS NULL THEN 'NULL_VALUE'
        WHEN user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'VALID_UUID'
        WHEN user_id ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN 'EMAIL_FORMAT'
        WHEN LENGTH(user_id) = 36 AND user_id LIKE '%-%-%-%-%' THEN 'UUID_LIKE_BUT_INVALID'
        ELSE 'OTHER_FORMAT'
    END AS format_type,
    LENGTH(user_id) AS length,
    COUNT(*) AS occurrence_count
FROM reports 
GROUP BY user_id
ORDER BY format_type, occurrence_count DESC;

-- 2. MAPOVÁNÍ EMAIL -> UUID (pokud user_id obsahuje emaily)
-- Vytvoří mapovací tabulku pro převod emailů na UUID z profiles
CREATE TEMP TABLE email_to_uuid_mapping AS
SELECT DISTINCT 
    r.user_id AS email_value,
    p.id AS profile_uuid,
    p.email AS profile_email
FROM reports r
JOIN profiles p ON r.user_id = p.email
WHERE r.user_id ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$';

-- Zobrazí mapování email -> UUID
SELECT 
    email_value,
    profile_uuid,
    profile_email
FROM email_to_uuid_mapping
ORDER BY email_value;

-- 3. DETEKCE PROBLEMATICKÝCH HODNOT
-- Hodnoty, které nelze automaticky mapovat
SELECT DISTINCT 
    user_id,
    COUNT(*) AS reports_count,
    'UNMAPPABLE' AS issue_type
FROM reports 
WHERE user_id IS NOT NULL
    AND NOT (user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    AND NOT EXISTS (
        SELECT 1 FROM profiles p WHERE p.email = reports.user_id
    )
GROUP BY user_id
ORDER BY reports_count DESC;

-- 4. VALIDACE EXISTUJÍCÍCH UUID
-- Ověří, že UUID hodnoty v reports odpovídají existujícím profiles
SELECT 
    r.user_id,
    COUNT(r.*) AS reports_count,
    CASE 
        WHEN p.id IS NOT NULL THEN 'VALID_PROFILE_EXISTS'
        ELSE 'ORPHANED_UUID'
    END AS validation_status
FROM reports r
LEFT JOIN profiles p ON r.user_id::uuid = p.id
WHERE r.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
GROUP BY r.user_id, p.id
ORDER BY validation_status, reports_count DESC;

-- 5. PŘÍPRAVA MIGRAČNÍCH DAT
-- Vytvoří dočasnou tabulku s mapovanými hodnotami
CREATE TEMP TABLE migration_mapping AS
SELECT 
    r.id AS report_id,
    r.user_id AS original_user_id,
    CASE 
        -- Pokud je už UUID a existuje v profiles
        WHEN r.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
             AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = r.user_id::uuid)
        THEN r.user_id::uuid
        
        -- Pokud je email a existuje mapování
        WHEN EXISTS (SELECT 1 FROM email_to_uuid_mapping m WHERE m.email_value = r.user_id)
        THEN (SELECT profile_uuid FROM email_to_uuid_mapping WHERE email_value = r.user_id)
        
        -- Jinak NULL (bude potřeba manuální řešení)
        ELSE NULL
    END AS target_uuid,
    
    CASE 
        WHEN r.user_id IS NULL THEN 'NULL_VALUE'
        WHEN r.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
             AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = r.user_id::uuid)
        THEN 'VALID_UUID'
        WHEN EXISTS (SELECT 1 FROM email_to_uuid_mapping m WHERE m.email_value = r.user_id)
        THEN 'EMAIL_MAPPED'
        ELSE 'NEEDS_MANUAL_MAPPING'
    END AS migration_status
FROM reports r;

-- 6. SOUHRN MIGRACE
SELECT 
    migration_status,
    COUNT(*) AS reports_count,
    COUNT(DISTINCT original_user_id) AS unique_user_ids
FROM migration_mapping
GROUP BY migration_status
ORDER BY reports_count DESC;

-- 7. SEZNAM PROBLEMATICKÝCH ZÁZNAMŮ
-- Záznamy, které budou potřebovat manuální řešení
SELECT 
    original_user_id,
    COUNT(*) AS reports_count,
    migration_status
FROM migration_mapping
WHERE migration_status = 'NEEDS_MANUAL_MAPPING'
GROUP BY original_user_id, migration_status
ORDER BY reports_count DESC;

-- 8. TESTOVACÍ DOTAZ PRO VALIDACI
-- Ověří, že všechny target_uuid existují v profiles
SELECT 
    'Valid mappings' AS check_type,
    COUNT(*) AS count
FROM migration_mapping m
JOIN profiles p ON m.target_uuid = p.id
WHERE m.target_uuid IS NOT NULL

UNION ALL

SELECT 
    'Invalid mappings' AS check_type,
    COUNT(*) AS count
FROM migration_mapping m
LEFT JOIN profiles p ON m.target_uuid = p.id
WHERE m.target_uuid IS NOT NULL AND p.id IS NULL;

-- =====================================================
-- MANUÁLNÍ KROKY (pokud jsou problematické hodnoty):
-- =====================================================
-- 1. Spusťte tento skript a zkontrolujte výstupy
-- 2. Pokud sekce 7 ukáže záznamy s 'NEEDS_MANUAL_MAPPING':
--    a) Identifikujte, co tyto hodnoty představují
--    b) Buď vytvořte odpovídající profiles záznamy
--    c) Nebo smažte/upravte problematické reports záznamy
-- 3. Pokud sekce 8 ukáže 'Invalid mappings' > 0:
--    - Zkontrolujte logiku mapování
--    - Možná budete muset vytvořit chybějící profiles
-- =====================================================
