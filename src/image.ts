import { App, normalizePath, TFile } from "obsidian";

export const IMAGE_EXTENSIONS = [
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"svg",
	"bmp",
	"avif",
];

const IMG_EXT_RE = new RegExp(`\\.(${IMAGE_EXTENSIONS.join("|")})$`, "i");

/** A cell value may hold several image paths joined by ';' (ai-love-island convention). */
export function splitImages(cell: string): string[] {
	return cell
		.split(";")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/** True if a single path string looks like an image file. */
export function looksLikeImagePath(value: string): boolean {
	return IMG_EXT_RE.test(value.trim());
}

/** True if a cell value contains at least one image-looking path (handles ';' multi). */
export function cellHasImage(cell: string): boolean {
	return splitImages(cell).some(looksLikeImagePath);
}

/**
 * Decide which columns should render as images.
 *
 * forced: column names the user explicitly marked as image columns (highest priority).
 * Otherwise auto-detect: a column is an image column if a majority of its
 * non-empty cells look like image paths.
 */
export function detectImageColumns(
	headers: string[],
	rows: Record<string, string>[],
	forced?: string[]
): Set<string> {
	if (forced && forced.length > 0) {
		return new Set(forced);
	}
	const result = new Set<string>();
	for (const h of headers) {
		let nonEmpty = 0;
		let imageLike = 0;
		for (const row of rows) {
			const v = (row[h] ?? "").trim();
			if (v === "") continue;
			nonEmpty++;
			if (cellHasImage(v)) imageLike++;
		}
		if (nonEmpty > 0 && imageLike / nonEmpty >= 0.5) {
			result.add(h);
		}
	}
	return result;
}

/** Return the folder part of a vault path ("" for a root-level file). */
export function dirOf(filePath: string): string {
	return filePath.includes("/")
		? filePath.slice(0, filePath.lastIndexOf("/"))
		: "";
}

/**
 * Resolve an image path to a displayable resource URL.
 *
 * `baseDirs` are tried in order. For a file-backed CSV we pass BOTH the note's
 * folder and the CSV's folder, because a relative path in the CSV may be
 * written relative to either:
 *   - relative to the note (how the reader thinks), or
 *   - relative to the CSV/character folder (how ai-love-island assets.csv is
 *     authored: `assets/x.png` is relative to the character dir, i.e. the
 *     parent of tables/, which the note also lives in).
 *
 * Resolution order:
 *   1. Absolute URL (http/https/data/file) — returned as-is.
 *   2. Each base dir + path.
 *   3. Exact vault-root path.
 *   4. Obsidian link resolution (filename-only links, shortest-path).
 *
 * Returns null when nothing resolves, so the caller can show a "missing" chip.
 */
export function resolveImageSrc(
	app: App,
	rawPath: string,
	baseDirs: string[],
	linkSourcePath: string
): string | null {
	const path = rawPath.trim();
	if (path === "") return null;

	if (/^(https?:|data:|file:)/i.test(path)) {
		return path;
	}

	const candidates: string[] = [];
	for (const dir of baseDirs) {
		candidates.push(dir ? normalizePath(`${dir}/${path}`) : normalizePath(path));
	}
	candidates.push(normalizePath(path));

	const seen = new Set<string>();
	for (const c of candidates) {
		if (seen.has(c)) continue;
		seen.add(c);
		const file = app.vault.getAbstractFileByPath(c);
		if (file instanceof TFile) {
			return app.vault.getResourcePath(file);
		}
	}

	// Fall back to Obsidian's own link resolver (filename-only links, etc.)
	const linked = app.metadataCache.getFirstLinkpathDest(path, linkSourcePath);
	if (linked instanceof TFile) {
		return app.vault.getResourcePath(linked);
	}

	return null;
}
