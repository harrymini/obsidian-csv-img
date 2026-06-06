# Obsidian CSV Image Table

Render a CSV as a table inside Obsidian — and **embed image cells as inline
images** instead of showing raw paths. Includes an `assets` preset tuned for the
[ai-love-island](https://github.com/harrymini/ai-love-island) `assets.csv`
schema (multi-image cells, caption/source/license, linked rows).

Existing CSV viewers render every cell as text. This one detects image columns
and draws thumbnails, so an image-index CSV becomes a real gallery.

## Usage

Put a `csv-img` code block in any note. In **reading/preview mode** it renders.

### Load a CSV file

````markdown
```csv-img
path: tables/assets.csv
```
````

### Inline CSV (no file)

````markdown
```csv-img
name,thumb,note
front,assets/ref-front.png,neutral
date,assets/concept-date.webp,webp works too
debut,assets/debut-1.png;assets/debut-2.png,";" = multiple images
```
````

### assets preset (gallery cards)

````markdown
```csv-img
preset: assets
path: tables/assets.csv
```
````

Renders each row as a card: image(s) + caption + `source · license` meta +
a badge (`갤러리` when `linked_table`/`linked_id` are empty, `삽화 → table/id`
when set).

## Block options

| key | example | meaning |
|---|---|---|
| `path:` | `tables/assets.csv` | load CSV from a vault file (relative to the note) |
| `preset:` | `assets` | use the assets gallery renderer |
| `images:` | `file, thumbnail` | force these columns to render as images (generic mode) |
| `size:` | `120` | thumbnail max px for this block |

Any non-`key: value` lines in the block are treated as **inline CSV**.

## Image path resolution

A relative path in the CSV is resolved against, in order: the note's folder,
then the CSV file's folder, then the vault root, then Obsidian's link resolver.
This matches the ai-love-island convention where `assets/x.png` in
`tables/assets.csv` is relative to the **character folder** (parent of `tables/`).
Absolute `http(s):`/`data:`/`file:` URLs are used as-is. Unresolvable paths show
a `⚠ path` chip instead of a broken image.

Multiple images in one cell are separated by `;` (so a CSV comma never collides).

Detected image extensions: `png jpg jpeg gif webp svg bmp avif`.

## Settings

- **Thumbnail size** — default thumbnail px (block `size:` overrides).
- **Forced image columns** — always-image columns in generic mode.
- **assets preset column mapping** — which columns hold file/caption/source/
  license/linked_table/linked_id (defaults match ai-love-island's schema).

## Build

```bash
npm install
npm run build      # tsc check + esbuild -> main.js
npm run dev        # watch mode
```

## License

MIT
