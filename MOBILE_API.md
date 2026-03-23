# SakeScan Mobile App — Database Reference

## Supabase Connection

```
URL:      https://qpsdebikkmcdzddhphlk.supabase.co
Anon Key: sb_publishable_2_EyN29uDqznDNteH_-DMA_hWZ46p-D
```

Use the Supabase client SDK for your platform (iOS/Android/Flutter). The anon key is a public key — Row Level Security protects the data.

---

## Tables

### `sake` — 35,961 sake products

| Column              | Type    | Example                          |
|---------------------|---------|----------------------------------|
| id                  | uuid    | `a1b2c3d4-...`                   |
| name                | text    | `Dassai 23`                      |
| name_japanese       | text    | `獺祭 二割三分`                    |
| brewery             | text    | `Asahi Shuzo`                    |
| type                | text    | `Junmai Daiginjo`                |
| subtype             | text    | `Muroka`                         |
| region              | text    | `Chugoku`                        |
| prefecture          | text    | `Yamaguchi`                      |
| description         | text    | Tasting notes and info           |
| rice_variety        | text    | `Yamada Nishiki`                 |
| polishing_ratio     | number  | `23` (percentage)                |
| alcohol_percentage  | number  | `16`                             |
| smv                 | number  | Sake Meter Value (sweetness)     |
| acidity             | number  |                                  |
| yeasts              | text    | `協会1801号` (yeast strains used)|
| water_source        | text    | `白神山系地下伏流水`               |
| filtration_method   | text    | `袋吊り` (e.g. bag-hang drip)    |
| base_ingredients    | text    | Additional ingredients            |
| image_url           | text    | URL to product photo (label or bottle) |
| gallery_images      | jsonb   | `["url1", "url2"]` extra photos  |
| external_id         | text    | Source ID (e.g. `TST0000047374`) |
| average_rating      | number  | `4.2` (out of 5)                 |
| total_ratings       | number  | `15`                             |
| created_at          | timestamp |                                |
| updated_at          | timestamp |                                |

**Mobile apps:** Use `image_url` for the main product photo. `label_image_url` and `bottle_image_url` are no longer present after the DB migration (data was merged into `image_url`, preferring bottle when both existed).

### `breweries` — 1,516 Japanese sake breweries

| Column         | Type    | Example                              |
|----------------|---------|--------------------------------------|
| id             | uuid    | `a1b2c3d4-...`                       |
| name           | text    | `Asahi Shuzo`                        |
| prefecture     | text    | `Yamaguchi`                          |
| region         | text    | `Chugoku`                            |
| address        | text    | Full Japanese address                |
| phone          | text    | `+81-82-...`                         |
| website        | text    | `https://www.asahishuzo.ne.jp`       |
| email          | text    |                                      |
| founded_year   | integer | `1948`                               |
| representative | text    | Company president name               |
| brands         | jsonb   | `["Dassai", "Dassai Beyond"]`        |
| description    | text    | About the brewery                    |
| visiting_info  | text    | Hours, tours, tasting info           |
| tour_available | boolean |                                      |
| image_url      | text    | Brewery photo URL                    |
| gallery_images | jsonb   | `["url1", "url2", "url3"]`           |
| source_url     | text    | JSS directory page                   |
| created_at     | timestamp |                                    |
| updated_at     | timestamp |                                    |

### `ratings` — User reviews

| Column      | Type    | Notes                     |
|-------------|---------|---------------------------|
| id          | uuid    | Primary key               |
| user_id     | uuid    | References `users.id`     |
| sake_id     | uuid    | References `sake.id`      |
| rating      | number  | 1–5 stars                 |
| review_text | text    | Optional written review   |
| created_at  | timestamp |                         |
| updated_at  | timestamp |                         |

### `users` — App users

| Column       | Type    | Notes                    |
|--------------|---------|--------------------------|
| id           | uuid    | Primary key              |
| email        | text    |                          |
| display_name | text    |                          |
| avatar_url   | text    |                          |
| location     | text    |                          |
| is_guest     | boolean | Guest vs registered user |
| created_at   | timestamp |                        |
| updated_at   | timestamp |                        |

### `scans` — Label scan history

| Column           | Type    | Notes                    |
|------------------|---------|--------------------------|
| id               | uuid    | Primary key              |
| user_id          | uuid    | References `users.id`    |
| sake_id          | uuid    | Matched sake (if found)  |
| scanned_image_url| text    | Photo the user scanned   |
| ocr_raw_text     | text    | Text extracted from scan |
| matched          | boolean | Whether a match was found|
| created_at       | timestamp |                        |

---

## Linking Sakes to Breweries

`sake.brewery` is a text field that matches `breweries.name`.

```javascript
// Get a sake with its brewery details
const { data } = await supabase
  .from('sake')
  .select('*, breweries!inner(image_url, prefecture, founded_year, website)')
  // Note: this requires a foreign key. Without it, use two queries:

// Alternative: two queries
const { data: sake } = await supabase.from('sake').select('*').eq('id', sakeId).single();
const { data: brewery } = await supabase.from('breweries').select('*').eq('name', sake.brewery).single();
```

---

## Image URLs

All image URLs are full HTTPS URLs ready to display. Two sources:

1. **Supabase Storage** — `https://qpsdebikkmcdzddhphlk.supabase.co/storage/v1/object/public/sake-images/...`
2. **External** — Some images still hosted externally (being migrated)

Just use the URL directly from the column — no transformation needed.

---

## Common Queries

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://qpsdebikkmcdzddhphlk.supabase.co',
  'sb_publishable_2_EyN29uDqznDNteH_-DMA_hWZ46p-D'
)

// Browse all sakes (paginated)
const { data } = await supabase
  .from('sake')
  .select('*')
  .order('average_rating', { ascending: false })
  .range(0, 19)

// Search sakes by name
const { data } = await supabase
  .from('sake')
  .select('*')
  .or('name.ilike.%dassai%,name_japanese.ilike.%dassai%,brewery.ilike.%dassai%')

// Get sake by ID
const { data } = await supabase
  .from('sake')
  .select('*')
  .eq('id', 'some-uuid')
  .single()

// Get brewery details
const { data } = await supabase
  .from('breweries')
  .select('*')
  .eq('name', 'Asahi Shuzo')
  .single()

// Browse breweries by prefecture
const { data } = await supabase
  .from('breweries')
  .select('*')
  .eq('prefecture', 'Niigata')
  .order('name')

// Get user's ratings
const { data } = await supabase
  .from('ratings')
  .select('*, sake(name, image_url, brewery)')
  .eq('user_id', userId)

// Submit a rating
const { data } = await supabase
  .from('ratings')
  .upsert({ user_id: userId, sake_id: sakeId, rating: 4, review_text: 'Great sake!' })
```

---

## Auth

Supabase Auth is enabled. Use `supabase.auth.signUp()`, `signInWithPassword()`, etc. User rows are created in the `users` table.

---

## Data Stats (as of Feb 2026)

- 35,961+ sakes; each row has a single optional `image_url` (replaces former `label_image_url` / `bottle_image_url`)
- 1,516 breweries (with images, contact info, descriptions)
- Breweries cover all 47 Japanese prefectures
- Oldest brewery: founded 1500s
- 8,156 sakes with yeast information
- 5,402 sakes with water source data
- 9,019 sakes with gallery images
