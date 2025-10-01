# Supabase Migration: reports.user_id → UUID + Foreign Key

Kompletní a bezpečný postup pro změnu typu sloupce `reports.user_id` na `uuid` a nastavení foreign key na `profiles(id)`.

## 📋 Přehled problému

- **Chyba**: `ERROR: cannot alter type of a column used in a policy definition`
- **Cíl**: Změnit `reports.user_id` z `text` na `uuid` a přidat FK constraint
- **Požadavky**: Zachovat data, zachovat bezpečnost, možnost rollbacku

## 🗂️ Struktura souborů

```
sql-migration/
├── 01_inspect_dependencies.sql    # Inspekce závislostí
├── 02_backup_data.sql             # Záloha dat a policies
├── 03_data_migration_prep.sql     # Detekce a příprava dat
├── 04_main_migration.sql          # Hlavní migrační skript
├── 05_validation_tests.sql        # Validační testy
├── 06_rollback.sql               # Rollback skript
└── README.md                     # Tato dokumentace
```

## 🚀 Postup migrace

### Krok 1: Inspekce závislostí
```sql
-- Spusťte v Supabase SQL editoru
-- Soubor: 01_inspect_dependencies.sql
```

**Co dělá:**
- Zobrazí všechny RLS policies na tabulce `reports`
- Najde constraints, indexy a triggery na `reports.user_id`
- Detekuje views a funkce používající `reports.user_id`
- Analyzuje aktuální typ sloupce a sample data

**Očekávaný výstup:**
- Seznam policies (např. "Users can insert their own reports")
- Typ sloupce: pravděpodobně `text` nebo `character varying`
- Sample data: UUID, emaily nebo jiné formáty

### Krok 2: Záloha dat
```sql
-- Soubor: 02_backup_data.sql
-- POZOR: Nahraďte "20240919" aktuálním datem!
```

**Co dělá:**
- Vytvoří `reports_backup_YYYYMMDD` s kompletní kopií dat
- Vytvoří `reports_policies_backup_YYYYMMDD` se zálohou RLS policies
- Vytvoří `reports_schema_backup_YYYYMMDD` se zálohou struktury

**Validace:**
- Zkontrolujte, že počet řádků v záloze odpovídá originálu
- Ověřte, že policies byly správně uloženy

### Krok 3: Analýza a příprava dat
```sql
-- Soubor: 03_data_migration_prep.sql
```

**Co dělá:**
- Detekuje nevalidní UUID hodnoty
- Vytvoří mapování email → UUID (pokud `user_id` obsahuje emaily)
- Identifikuje problematické hodnoty vyžadující manuální řešení
- Připraví migrační mapování

**Důležité:**
- Pokud sekce 7 ukáže záznamy s `NEEDS_MANUAL_MAPPING`, musíte je vyřešit před migrací
- Možnosti: vytvořit chybějící profiles, smazat problematické záznamy, nebo upravit data

### Krok 4: Hlavní migrace
```sql
-- Soubor: 04_main_migration.sql
-- POZOR: Spouštějte postupně po sekcích!
```

**Postup:**
1. **Odstranění RLS policies** - odstraní všechny policies blokující změnu typu
2. **Odstranění indexů** - odstraní indexy na `user_id` (kromě PK)
3. **Migrace dat** - použije bezpečnou konverzní funkci
4. **Změna typu sloupce** - `ALTER COLUMN user_id TYPE uuid`
5. **Přidání FK constraint** - `FOREIGN KEY (user_id) REFERENCES profiles(id)`
6. **Vytvoření indexu** - pro performance
7. **Obnovení RLS policies** - vytvoří nové bezpečné policies

**Varianty:**
- **Varianta A**: Přímá změna typu pomocí `USING` klauzule
- **Varianta B**: Postupná migrace přes nový sloupec (pokud A selže)

### Krok 5: Validace
```sql
-- Soubor: 05_validation_tests.sql
```

**Testy:**
- Struktura tabulky (typ sloupce = `uuid`)
- Foreign key constraints
- RLS policies (minimálně 4 policies)
- Integrita dat (žádné orphaned záznamy)
- JOIN funkčnost
- Supabase client kompatibilita
- Performance (indexy)
- Bezpečnost (auth.uid() v policies)

**Všechny testy musí být "PASS"!**

### Krok 6: Rollback (pouze v případě problémů)
```sql
-- Soubor: 06_rollback.sql
-- POZOR: Vrátí vše do původního stavu!
```

## 🔒 Bezpečnostní policies

Po migraci budou vytvořeny tyto RLS policies:

```sql
-- Uživatelé mohou vkládat pouze své vlastní reports
CREATE POLICY "Users can insert their own reports" ON reports
    FOR INSERT TO authenticated 
    WITH CHECK (auth.uid() = user_id);

-- Uživatelé vidí pouze své vlastní reports
CREATE POLICY "Users can view their own reports" ON reports
    FOR SELECT TO authenticated 
    USING (auth.uid() = user_id);

-- Uživatelé mohou upravovat pouze své vlastní reports
CREATE POLICY "Users can update their own reports" ON reports
    FOR UPDATE TO authenticated 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Uživatelé mohou mazat pouze své vlastní reports
CREATE POLICY "Users can delete their own reports" ON reports
    FOR DELETE TO authenticated 
    USING (auth.uid() = user_id);
```

## 🧪 Testování Supabase JS klienta

Po migraci bude fungovat:

```javascript
// Základní select s expand
const { data, error } = await supabase
  .from('reports')
  .select('*, profiles(email, username)')
  .limit(10);

// Insert s automatickým user_id
const { data, error } = await supabase
  .from('reports')
  .insert({
    title: 'Test report',
    content: 'Test content'
    // user_id se nastaví automaticky z auth.uid()
  });

// Select pouze vlastních reports (díky RLS)
const { data, error } = await supabase
  .from('reports')
  .select('*');
```

## ⚠️ Důležité poznámky

### Transakce
- DDL operace (ALTER TABLE, DROP POLICY) **nelze** obalit do transakce
- Spouštějte migrační skript postupně po sekcích
- Kontrolujte výsledky každé sekce před pokračováním

### Časování
- Migrace může trvat několik minut u velkých tabulek
- Během migrace bude tabulka dočasně nedostupná
- Naplánujte migraci na období s nízkou aktivitou

### Rollback
- Rollback je možný pouze pokud existují zálohy
- Rollback **ztratí všechny změny** provedené po migraci
- Používejte pouze v kritických situacích

## 🔧 Řešení problémů

### "Policy depends on column user_id"
- **Řešení**: Spusťte sekci 1 z `04_main_migration.sql` pro odstranění policies

### "Invalid UUID format"
- **Řešení**: Zkontrolujte výstup z `03_data_migration_prep.sql` a vyřešte problematické hodnoty

### "Foreign key violation"
- **Řešení**: Ujistěte se, že všechny `user_id` hodnoty existují v `profiles.id`

### "RLS policies not working"
- **Řešení**: Zkontrolujte, že policies obsahují `auth.uid()` a jsou správně nastavené

## 📞 Podpora

Pokud narazíte na problémy:

1. **Zkontrolujte logy** v Supabase Dashboard
2. **Spusťte validační testy** (`05_validation_tests.sql`)
3. **Zkontrolujte zálohy** před rollbackem
4. **Dokumentujte chybu** a kontaktujte vývojáře

## ✅ Checklist

- [ ] Spuštěn `01_inspect_dependencies.sql`
- [ ] Spuštěn `02_backup_data.sql` (s aktuálním datem)
- [ ] Spuštěn `03_data_migration_prep.sql`
- [ ] Vyřešeny všechny problematické hodnoty
- [ ] Spuštěn `04_main_migration.sql` (postupně po sekcích)
- [ ] Spuštěn `05_validation_tests.sql`
- [ ] Všechny testy jsou "PASS"
- [ ] Otestován Supabase JS klient
- [ ] Aplikace funguje správně
- [ ] Zálohy můžou být smazány (volitelné)

---

**Úspěšnou migraci! 🎉**
