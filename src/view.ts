import { TextFileView, WorkspaceLeaf, setIcon, Menu } from "obsidian";
import { ParsedCsv, parseCsv, stringifyCsv } from "./csv";
import {
	cellHasImage,
	detectImageColumns,
	dirOf,
	resolveImageSrc,
	splitImages,
} from "./image";
import { RenderContext, renderAssetsGallery } from "./render";
import { CsvImgSettings } from "./settings";

export const CSV_VIEW_TYPE = "csv-img-view";

type Mode = "table" | "gallery" | "source";

/**
 * An editable file view for `.csv` files (a csv-lite-style spreadsheet, plus
 * inline image rendering).
 *
 * Modes:
 *   - TABLE (default): editable grid. Each cell is contenteditable; edits are
 *     serialized back to CSV and saved. Image-path cells additionally show a
 *     thumbnail above the editable path. Add/remove rows from the toolbar.
 *   - GALLERY: read-only assets.csv card view (only offered when the header
 *     matches the assets schema).
 *   - SOURCE: raw <textarea> for power editing.
 *
 * Registered for the "csv" extension so .csv files appear in the file explorer
 * and open here. Only one plugin may own the extension — disable other CSV
 * file-view plugins (CSV Lite / CSV Editor) to avoid a conflict.
 */
export class CsvImgView extends TextFileView {
	private getSettings: () => CsvImgSettings;
	private mode: Mode = "table";
	private matrix: string[][] = [];
	private headers: string[] = [];
	private textarea: HTMLTextAreaElement | null = null;
	private modeActions: HTMLElement[] = [];

	constructor(leaf: WorkspaceLeaf, getSettings: () => CsvImgSettings) {
		super(leaf);
		this.getSettings = getSettings;
	}

	getViewType(): string {
		return CSV_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file ? this.file.basename : "CSV";
	}

	getIcon(): string {
		return "table";
	}

	/** TextFileView contract: the file's current text. */
	getViewData(): string {
		if (this.mode === "source" && this.textarea) {
			return this.textarea.value;
		}
		return stringifyCsv(this.matrix);
	}

	/** TextFileView contract: load (or reload) file content. */
	setViewData(data: string, clear: boolean): void {
		this.data = data;
		const parsed = parseCsv(data);
		this.headers = parsed.headers;
		this.matrix = parsed.matrix.length
			? parsed.matrix.map((r) => r.slice())
			: [[]];
		if (clear && this.mode === "gallery" && !this.isAssets()) {
			this.mode = "table";
		}
		this.render();
	}

	clear(): void {
		this.data = "";
		this.matrix = [];
		this.headers = [];
		this.textarea = null;
		this.contentEl.empty();
	}

	async onOpen(): Promise<void> {
		this.modeActions.push(
			this.addAction("table", "표 편집", () => this.switchMode("table"))
		);
		this.modeActions.push(
			this.addAction("images", "assets 갤러리", () =>
				this.switchMode("gallery")
			)
		);
		this.modeActions.push(
			this.addAction("code", "원본 CSV", () => this.switchMode("source"))
		);
		this.addAction("plus", "행 추가", () => this.addRow());
	}

	private switchMode(mode: Mode): void {
		if (this.mode === mode) return;
		this.commitPendingSource();
		this.mode = mode;
		this.render();
	}

	/** If leaving source mode, re-parse the textarea into the matrix. */
	private commitPendingSource(): void {
		if (this.mode === "source" && this.textarea) {
			const parsed = parseCsv(this.textarea.value);
			this.headers = parsed.headers;
			this.matrix = parsed.matrix.length ? parsed.matrix : [[]];
			this.data = this.textarea.value;
		}
	}

	/** Persist the current matrix and trigger TextFileView's save. */
	private persist(): void {
		this.data = stringifyCsv(this.matrix);
		this.requestSave();
	}

	private isAssets(): boolean {
		const s = this.getSettings();
		const has = (c: string) => this.headers.includes(c);
		return (
			has(s.assetsFileColumn) &&
			(has(s.assetsCaptionColumn) ||
				has(s.assetsLinkTableColumn) ||
				has(s.assetsLicenseColumn))
		);
	}

	private render(): void {
		const c = this.contentEl;
		c.empty();
		c.addClass("csv-img-fileview");

		// The gallery action only makes sense for assets-shaped files.
		const galleryAction = this.modeActions[1];
		if (galleryAction) {
			galleryAction.toggleClass("csv-img-hidden", !this.isAssets());
		}

		if (this.mode === "source") return this.renderSource(c);
		if (this.mode === "gallery") return this.renderGallery(c);
		return this.renderTable(c);
	}

	// ---- SOURCE ----------------------------------------------------------

	private renderSource(container: HTMLElement): void {
		const ta = container.createEl("textarea", { cls: "csv-img-source" });
		ta.value = stringifyCsv(this.matrix);
		ta.spellcheck = false;
		ta.addEventListener("input", () => {
			this.data = ta.value;
			this.requestSave();
		});
		this.textarea = ta;
	}

	// ---- GALLERY ---------------------------------------------------------

	private renderGallery(container: HTMLElement): void {
		this.textarea = null;
		const wrap = container.createDiv({ cls: "csv-img-fileview-inner" });
		const csv: ParsedCsv = parseCsv(stringifyCsv(this.matrix));
		const s = this.getSettings();
		const ctx: RenderContext = {
			app: this.app,
			baseDirs: [this.file ? dirOf(this.file.path) : ""],
			linkSourcePath: this.file ? this.file.path : "",
			settings: s,
			thumbSize: s.thumbSize,
		};
		renderAssetsGallery(wrap, csv, ctx);
	}

	// ---- TABLE (editable) ------------------------------------------------

	private renderTable(container: HTMLElement): void {
		this.textarea = null;
		if (this.headers.length === 0) {
			container
				.createDiv({ cls: "csv-img-fileview-inner" })
				.createDiv({ cls: "csv-img-error", text: "csv-img: 빈 CSV." });
			return;
		}

		const s = this.getSettings();
		const rowObjs = this.matrix.slice(1).map((cells) => {
			const o: Record<string, string> = {};
			this.headers.forEach((h, i) => (o[h] = cells[i] ?? ""));
			return o;
		});
		const imageCols = detectImageColumns(
			this.headers,
			rowObjs,
			s.forcedImageColumns.length ? s.forcedImageColumns : undefined
		);
		const baseDirs = [this.file ? dirOf(this.file.path) : ""];

		const scroll = container.createDiv({ cls: "csv-img-fileview-inner" });
		const table = scroll.createEl("table", {
			cls: "csv-img-table csv-img-editable",
		});

		// header row (editable header text + per-column delete)
		const thead = table.createEl("thead");
		const htr = thead.createEl("tr");
		htr.createEl("th", { cls: "csv-img-rowhandle" }); // corner
		this.headers.forEach((h, ci) => {
			const th = htr.createEl("th");
			if (imageCols.has(h)) th.addClass("csv-img-col");
			const input = th.createEl("input", {
				cls: "csv-img-cellinput csv-img-headinput",
				attr: { type: "text", value: h },
			});
			input.addEventListener("change", () => {
				this.headers[ci] = input.value;
				this.matrix[0][ci] = input.value;
				this.persist();
			});
		});

		// body
		const tbody = table.createEl("tbody");
		for (let r = 1; r < this.matrix.length; r++) {
			const tr = tbody.createEl("tr");
			const handle = tr.createEl("td", { cls: "csv-img-rowhandle" });
			handle.setText(String(r));
			handle.addEventListener("click", (ev) =>
				this.rowMenu(ev, r)
			);

			for (let ci = 0; ci < this.headers.length; ci++) {
				const td = tr.createEl("td");
				const value = this.matrix[r][ci] ?? "";
				const header = this.headers[ci];
				const isImg = imageCols.has(header) && cellHasImage(value);

				if (isImg) {
					const imgs = td.createDiv({ cls: "csv-img-cellimgs" });
					for (const p of splitImages(value)) {
						const src = resolveImageSrc(
							this.app,
							p,
							baseDirs,
							this.file ? this.file.path : ""
						);
						if (src) {
							const im = imgs.createEl("img", {
								cls: "csv-img-thumb",
							});
							im.src = src;
							im.style.maxWidth = `${s.thumbSize}px`;
							im.style.maxHeight = `${s.thumbSize}px`;
							im.title = p;
						} else {
							imgs.createSpan({
								cls: "csv-img-missing",
								text: `⚠ ${p}`,
							});
						}
					}
				}

				const input = td.createEl("input", {
					cls: "csv-img-cellinput",
					attr: { type: "text", value },
				});
				this.bindCell(input, r, ci);
			}
		}
	}

	private bindCell(el: HTMLInputElement, r: number, ci: number): void {
		const commit = () => {
			const v = el.value;
			if (this.matrix[r][ci] !== v) {
				// pad short rows so the column index is valid
				while (this.matrix[r].length <= ci) this.matrix[r].push("");
				this.matrix[r][ci] = v;
				this.persist();
			}
		};
		el.addEventListener("change", commit);
		el.addEventListener("blur", commit);
		// Enter commits + moves focus to the same column in the next row,
		// like a spreadsheet.
		el.addEventListener("keydown", (ev) => {
			if (ev.key === "Enter") {
				ev.preventDefault();
				commit();
				const inputs = this.contentEl.querySelectorAll<HTMLInputElement>(
					"tbody tr td input.csv-img-cellinput"
				);
				const cols = this.headers.length;
				const flatIdx = (r - 1) * cols + ci;
				const next = inputs[flatIdx + cols];
				if (next) next.focus();
				else el.blur();
			}
		});
	}

	private rowMenu(ev: MouseEvent, r: number): void {
		const menu = new Menu();
		menu.addItem((i) =>
			i
				.setTitle("위에 행 추가")
				.setIcon("arrow-up")
				.onClick(() => this.insertRow(r))
		);
		menu.addItem((i) =>
			i
				.setTitle("아래에 행 추가")
				.setIcon("arrow-down")
				.onClick(() => this.insertRow(r + 1))
		);
		menu.addItem((i) =>
			i
				.setTitle("행 삭제")
				.setIcon("trash")
				.onClick(() => this.deleteRow(r))
		);
		menu.showAtMouseEvent(ev);
	}

	private addRow(): void {
		if (this.mode === "source") return;
		this.insertRow(this.matrix.length);
	}

	private insertRow(at: number): void {
		const width = this.headers.length || 1;
		const blank = new Array(width).fill("");
		const idx = Math.max(1, Math.min(at, this.matrix.length));
		this.matrix.splice(idx, 0, blank);
		this.persist();
		this.render();
	}

	private deleteRow(r: number): void {
		if (r <= 0 || r >= this.matrix.length) return;
		this.matrix.splice(r, 1);
		this.persist();
		this.render();
	}
}
