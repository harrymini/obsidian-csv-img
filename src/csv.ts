/**
 * Minimal RFC-4180-ish CSV parser.
 *
 * Handles: quoted fields, embedded commas/newlines inside quotes, "" escapes,
 * leading UTF-8 BOM, and CRLF. Good enough for the hand-edited CSVs this plugin
 * targets (see ai-love-island docs/characters/{code}/tables/*.csv).
 *
 * NOTE: the ai-love-island assets.csv convention puts MULTIPLE image paths in
 * one field separated by ';' (semicolon) precisely so the CSV comma never
 * collides. We do not split on ';' here — that is the caller's concern
 * (see splitImages in image.ts).
 */

export interface ParsedCsv {
	headers: string[];
	/** Each row is an object keyed by header. Extra columns beyond the header are dropped. */
	rows: Record<string, string>[];
	/** Raw row arrays, aligned to headers (useful when there is no header). */
	matrix: string[][];
}

export function parseCsv(input: string): ParsedCsv {
	const text = stripBom(input);
	const matrix = parseToMatrix(text);

	if (matrix.length === 0) {
		return { headers: [], rows: [], matrix: [] };
	}

	const headers = matrix[0].map((h) => h.trim());
	const rows: Record<string, string>[] = [];

	for (let r = 1; r < matrix.length; r++) {
		const cells = matrix[r];
		// Skip fully-empty trailing lines.
		if (cells.length === 1 && cells[0].trim() === "") continue;

		const obj: Record<string, string> = {};
		for (let c = 0; c < headers.length; c++) {
			obj[headers[c]] = c < cells.length ? cells[c] : "";
		}
		rows.push(obj);
	}

	return { headers, rows, matrix };
}

function stripBom(s: string): string {
	return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function parseToMatrix(text: string): string[][] {
	const out: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;
	let i = 0;
	const n = text.length;

	const pushField = () => {
		row.push(field);
		field = "";
	};
	const pushRow = () => {
		pushField();
		out.push(row);
		row = [];
	};

	while (i < n) {
		const ch = text[i];

		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i++;
				continue;
			}
			field += ch;
			i++;
			continue;
		}

		if (ch === '"') {
			inQuotes = true;
			i++;
			continue;
		}
		if (ch === ",") {
			pushField();
			i++;
			continue;
		}
		if (ch === "\r") {
			// swallow; handle the \n (or lone \r) below
			if (text[i + 1] === "\n") {
				pushRow();
				i += 2;
				continue;
			}
			pushRow();
			i++;
			continue;
		}
		if (ch === "\n") {
			pushRow();
			i++;
			continue;
		}
		field += ch;
		i++;
	}

	// flush last field/row if any content remains
	if (field.length > 0 || row.length > 0) {
		pushRow();
	}

	return out;
}
