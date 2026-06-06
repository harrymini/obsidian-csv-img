export interface CsvImgSettings {
	/** Max rendered width of each thumbnail, in px. */
	thumbSize: number;
	/** Column names to always treat as image columns (in generic mode), comma-separated in UI. */
	forcedImageColumns: string[];
	/** assets preset: which column holds image path(s). */
	assetsFileColumn: string;
	/** assets preset: caption column. */
	assetsCaptionColumn: string;
	/** assets preset: source column. */
	assetsSourceColumn: string;
	/** assets preset: license column. */
	assetsLicenseColumn: string;
	/** assets preset: columns that, when both empty, mark a row as gallery (vs linked illustration). */
	assetsLinkTableColumn: string;
	assetsLinkIdColumn: string;
}

export const DEFAULT_SETTINGS: CsvImgSettings = {
	thumbSize: 160,
	forcedImageColumns: [],
	// Defaults match ai-love-island docs/adr/0002 assets.csv schema.
	assetsFileColumn: "file",
	assetsCaptionColumn: "caption",
	assetsSourceColumn: "source",
	assetsLicenseColumn: "license",
	assetsLinkTableColumn: "linked_table",
	assetsLinkIdColumn: "linked_id",
};

/**
 * Per-block options parsed from the code-fence info line / first lines.
 *
 * Supported forms inside a ```csv-img block:
 *   path: <vault-relative path to a .csv>     (load file)
 *   preset: assets                            (use the assets renderer)
 *   images: colA, colB                        (force these columns as images)
 *   size: 200                                 (thumbnail px for this block)
 * Any remaining lines that are not key:value are treated as inline CSV.
 */
export interface BlockOptions {
	path?: string;
	preset?: string;
	images?: string[];
	size?: number;
	inlineCsv?: string;
}

const KNOWN_KEYS = new Set(["path", "preset", "images", "size", "src", "file"]);

export function parseBlockOptions(source: string): BlockOptions {
	const opts: BlockOptions = {};
	const inlineLines: string[] = [];
	const lines = source.split(/\r?\n/);

	for (const line of lines) {
		const trimmed = line.trim();
		const m = trimmed.match(/^([A-Za-z_]+)\s*:\s*(.*)$/);
		if (m && KNOWN_KEYS.has(m[1].toLowerCase())) {
			const key = m[1].toLowerCase();
			const val = m[2].trim();
			if (key === "path" || key === "src" || key === "file") {
				opts.path = stripQuotes(val);
			} else if (key === "preset") {
				opts.preset = val.toLowerCase();
			} else if (key === "images") {
				opts.images = val
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean);
			} else if (key === "size") {
				const num = parseInt(val, 10);
				if (!isNaN(num)) opts.size = num;
			}
			continue;
		}
		inlineLines.push(line);
	}

	const inline = inlineLines.join("\n").trim();
	if (inline.length > 0) opts.inlineCsv = inline;
	return opts;
}

function stripQuotes(s: string): string {
	if (
		(s.startsWith('"') && s.endsWith('"')) ||
		(s.startsWith("'") && s.endsWith("'"))
	) {
		return s.slice(1, -1);
	}
	return s;
}
