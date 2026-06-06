import { App } from "obsidian";
import { ParsedCsv } from "./csv";
import {
	cellHasImage,
	detectImageColumns,
	resolveImageSrc,
	splitImages,
} from "./image";
import { CsvImgSettings } from "./settings";

interface RenderContext {
	app: App;
	/** Folders (vault-relative) to try when resolving relative image paths. */
	baseDirs: string[];
	/** Note path used for Obsidian's link resolver fallback. */
	linkSourcePath: string;
	settings: CsvImgSettings;
	thumbSize: number;
}

/** Append a single image, or a "missing file" chip if it cannot be resolved. */
function appendImage(
	parent: HTMLElement,
	ctx: RenderContext,
	rawPath: string
): void {
	const src = resolveImageSrc(
		ctx.app,
		rawPath,
		ctx.baseDirs,
		ctx.linkSourcePath
	);
	if (src) {
		const img = parent.createEl("img", { cls: "csv-img-thumb" });
		img.src = src;
		img.alt = rawPath;
		img.style.maxWidth = `${ctx.thumbSize}px`;
		img.style.maxHeight = `${ctx.thumbSize}px`;
		img.title = rawPath;
	} else {
		const chip = parent.createSpan({ cls: "csv-img-missing" });
		chip.setText(`⚠ ${rawPath}`);
		chip.title = "이미지를 찾을 수 없음 (경로 확인)";
	}
}

/** Render all images in a cell (handles ';' multi-image). */
function appendCellImages(
	parent: HTMLElement,
	ctx: RenderContext,
	cell: string
): void {
	const wrap = parent.createDiv({ cls: "csv-img-cellimgs" });
	for (const p of splitImages(cell)) {
		appendImage(wrap, ctx, p);
	}
}

/**
 * GENERIC MODE: render the CSV as an HTML table. Cells in detected image
 * columns become inline thumbnails; everything else is text.
 */
export function renderGenericTable(
	el: HTMLElement,
	csv: ParsedCsv,
	ctx: RenderContext,
	forcedImages?: string[]
): void {
	const imageCols = detectImageColumns(csv.headers, csv.rows, forcedImages);

	const container = el.createDiv({ cls: "csv-img-container" });
	const table = container.createEl("table", { cls: "csv-img-table" });

	const thead = table.createEl("thead");
	const headRow = thead.createEl("tr");
	for (const h of csv.headers) {
		const th = headRow.createEl("th");
		th.setText(h);
		if (imageCols.has(h)) th.addClass("csv-img-col");
	}

	const tbody = table.createEl("tbody");
	for (const row of csv.rows) {
		const tr = tbody.createEl("tr");
		for (const h of csv.headers) {
			const td = tr.createEl("td");
			const val = row[h] ?? "";
			if (imageCols.has(h) && cellHasImage(val)) {
				appendCellImages(td, ctx, val);
			} else {
				td.setText(val);
			}
		}
	}
}

/**
 * ASSETS PRESET: render the ai-love-island assets.csv as a gallery of cards.
 * Each card shows the image(s) plus caption and a meta line (source · license).
 * Rows with linked_table/linked_id set are labelled as illustrations; rows
 * with both empty are gallery items. (See docs/adr/0002.)
 */
export function renderAssetsGallery(
	el: HTMLElement,
	csv: ParsedCsv,
	ctx: RenderContext
): void {
	const s = ctx.settings;
	const fileCol = pickCol(csv.headers, s.assetsFileColumn, "file");
	const capCol = pickCol(csv.headers, s.assetsCaptionColumn, "caption");
	const srcCol = pickCol(csv.headers, s.assetsSourceColumn, "source");
	const licCol = pickCol(csv.headers, s.assetsLicenseColumn, "license");
	const linkTblCol = pickCol(csv.headers, s.assetsLinkTableColumn, "linked_table");
	const linkIdCol = pickCol(csv.headers, s.assetsLinkIdColumn, "linked_id");

	const grid = el.createDiv({ cls: "csv-img-gallery" });

	for (const row of csv.rows) {
		const filesRaw = fileCol ? row[fileCol] ?? "" : "";
		if (filesRaw.trim() === "") continue;

		const card = grid.createDiv({ cls: "csv-img-card" });

		const imgsWrap = card.createDiv({ cls: "csv-img-card-imgs" });
		for (const p of splitImages(filesRaw)) {
			appendImage(imgsWrap, ctx, p);
		}

		const caption = capCol ? row[capCol] ?? "" : "";
		if (caption.trim()) {
			card.createDiv({ cls: "csv-img-card-caption", text: caption });
		}

		const metaBits: string[] = [];
		const source = srcCol ? row[srcCol] ?? "" : "";
		const license = licCol ? row[licCol] ?? "" : "";
		if (source.trim()) metaBits.push(source.trim());
		if (license.trim()) metaBits.push(license.trim());
		if (metaBits.length) {
			card.createDiv({
				cls: "csv-img-card-meta",
				text: metaBits.join(" · "),
			});
		}

		const linkTbl = linkTblCol ? (row[linkTblCol] ?? "").trim() : "";
		const linkId = linkIdCol ? (row[linkIdCol] ?? "").trim() : "";
		const badge = card.createDiv({ cls: "csv-img-card-badge" });
		if (linkTbl || linkId) {
			badge.addClass("is-linked");
			badge.setText(`삽화 → ${linkTbl}${linkId ? "/" + linkId : ""}`);
		} else {
			badge.addClass("is-gallery");
			badge.setText("갤러리");
		}
	}
}

/** Resolve a configured column name against actual headers, falling back to a default. */
function pickCol(
	headers: string[],
	configured: string,
	fallback: string
): string | null {
	if (configured && headers.includes(configured)) return configured;
	if (headers.includes(fallback)) return fallback;
	return null;
}
