import {
	App,
	MarkdownPostProcessorContext,
	normalizePath,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";
import { parseCsv } from "./csv";
import { dirOf } from "./image";
import { renderAssetsGallery, renderGenericTable } from "./render";
import {
	BlockOptions,
	CsvImgSettings,
	DEFAULT_SETTINGS,
	parseBlockOptions,
} from "./settings";
import { CSV_VIEW_TYPE, CsvImgView } from "./view";

export default class CsvImgPlugin extends Plugin {
	settings: CsvImgSettings;

	async onload() {
		await this.loadSettings();

		this.registerMarkdownCodeBlockProcessor(
			"csv-img",
			(source, el, ctx) => this.processBlock(source, el, ctx)
		);

		// Open .csv files in our image-aware view. registerExtensions makes
		// Obsidian show .csv in the file explorer AND route clicks here.
		// (Only one plugin may claim the "csv" extension — disable other CSV
		// file-view plugins to avoid a conflict.)
		this.registerView(
			CSV_VIEW_TYPE,
			(leaf) => new CsvImgView(leaf, () => this.settings)
		);
		try {
			this.registerExtensions(["csv"], CSV_VIEW_TYPE);
		} catch (e) {
			// Another plugin already claimed .csv — surface a one-time notice
			// rather than failing the whole plugin load.
			console.warn(
				"obsidian-csv-img: could not register .csv extension (another CSV plugin may own it).",
				e
			);
		}

		this.addSettingTab(new CsvImgSettingTab(this.app, this));
	}

	async processBlock(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	) {
		const opts = parseBlockOptions(source);

		let csvText: string | null = null;
		try {
			csvText = await this.loadCsvText(opts, ctx.sourcePath);
		} catch (e) {
			this.renderError(el, String(e?.message ?? e));
			return;
		}

		if (csvText == null) {
			this.renderError(
				el,
				"CSV 소스가 없음. `path: <파일.csv>` 를 주거나 블록 안에 CSV 를 직접 붙여넣으세요."
			);
			return;
		}

		const csv = parseCsv(csvText);
		if (csv.headers.length === 0) {
			this.renderError(el, "CSV 가 비어 있거나 헤더가 없음.");
			return;
		}

		// Image paths in a CSV may be written relative to the note OR relative
		// to the CSV file's own folder. Try both (note dir first). For inline
		// CSV there is no CSV file, so only the note dir applies.
		const noteDir = dirOf(ctx.sourcePath);
		const baseDirs = [noteDir];
		if (opts.path) {
			const csvFile = this.resolveCsvPath(opts.path, ctx.sourcePath);
			if (csvFile) {
				const csvDir = dirOf(csvFile.path);
				if (!baseDirs.includes(csvDir)) baseDirs.push(csvDir);
			}
		}

		const renderCtx = {
			app: this.app,
			baseDirs,
			linkSourcePath: ctx.sourcePath,
			settings: this.settings,
			thumbSize: opts.size ?? this.settings.thumbSize,
		};

		if (opts.preset === "assets") {
			renderAssetsGallery(el, csv, renderCtx);
		} else {
			renderGenericTable(
				el,
				csv,
				renderCtx,
				opts.images ?? this.settings.forcedImageColumns
			);
		}
	}

	/**
	 * Load CSV text either from a referenced vault file or from inline content.
	 * When a file is referenced, image paths in that CSV are resolved relative
	 * to the CSV file's own folder (so a tables/*.csv pointing at ../assets/x.png
	 * works). That is why renderCtx.sourcePath becomes opts.path above.
	 */
	async loadCsvText(
		opts: BlockOptions,
		notePath: string
	): Promise<string | null> {
		if (opts.path) {
			const resolved = this.resolveCsvPath(opts.path, notePath);
			if (!resolved) {
				throw new Error(`CSV 파일을 찾을 수 없음: ${opts.path}`);
			}
			return await this.app.vault.read(resolved);
		}
		if (opts.inlineCsv) {
			return opts.inlineCsv;
		}
		return null;
	}

	resolveCsvPath(path: string, notePath: string): TFile | null {
		const noteDir = notePath.includes("/")
			? notePath.slice(0, notePath.lastIndexOf("/"))
			: "";
		const candidates: string[] = [];
		if (noteDir) candidates.push(normalizePath(`${noteDir}/${path}`));
		candidates.push(normalizePath(path));

		for (const c of candidates) {
			const f = this.app.vault.getAbstractFileByPath(c);
			if (f instanceof TFile) return f;
		}
		const linked = this.app.metadataCache.getFirstLinkpathDest(
			path,
			notePath
		);
		return linked instanceof TFile ? linked : null;
	}

	renderError(el: HTMLElement, msg: string) {
		const div = el.createDiv({ cls: "csv-img-error" });
		div.setText(`csv-img: ${msg}`);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class CsvImgSettingTab extends PluginSettingTab {
	plugin: CsvImgPlugin;

	constructor(app: App, plugin: CsvImgPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("썸네일 크기 (px)")
			.setDesc("이미지 셀/카드 썸네일의 최대 폭·높이. 블록에서 `size:` 로 덮어쓸 수 있음.")
			.addText((t) =>
				t
					.setValue(String(this.plugin.settings.thumbSize))
					.onChange(async (v) => {
						const n = parseInt(v, 10);
						if (!isNaN(n) && n > 0) {
							this.plugin.settings.thumbSize = n;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("강제 이미지 컬럼 (범용 모드)")
			.setDesc(
				"콤마로 구분. 자동 감지 대신 이 컬럼들을 항상 이미지로 렌더. 블록의 `images:` 가 우선."
			)
			.addText((t) =>
				t
					.setValue(this.plugin.settings.forcedImageColumns.join(", "))
					.setPlaceholder("예: file, thumbnail")
					.onChange(async (v) => {
						this.plugin.settings.forcedImageColumns = v
							.split(",")
							.map((s) => s.trim())
							.filter(Boolean);
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "assets 프리셋 컬럼 매핑" });
		containerEl.createEl("p", {
			text: "preset: assets 갤러리에서 각 정보를 어느 컬럼에서 읽을지 (ai-love-island assets.csv 기본값).",
			cls: "setting-item-description",
		});

		const colSetting = (
			name: string,
			desc: string,
			get: () => string,
			set: (v: string) => void
		) =>
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addText((t) =>
					t.setValue(get()).onChange(async (v) => {
						set(v.trim());
						await this.plugin.saveSettings();
					})
				);

		colSetting(
			"이미지 경로 컬럼",
			"세미콜론(;) 다중 경로 지원",
			() => this.plugin.settings.assetsFileColumn,
			(v) => (this.plugin.settings.assetsFileColumn = v)
		);
		colSetting(
			"캡션 컬럼",
			"",
			() => this.plugin.settings.assetsCaptionColumn,
			(v) => (this.plugin.settings.assetsCaptionColumn = v)
		);
		colSetting(
			"출처 컬럼",
			"",
			() => this.plugin.settings.assetsSourceColumn,
			(v) => (this.plugin.settings.assetsSourceColumn = v)
		);
		colSetting(
			"라이선스 컬럼",
			"",
			() => this.plugin.settings.assetsLicenseColumn,
			(v) => (this.plugin.settings.assetsLicenseColumn = v)
		);
		colSetting(
			"연결 표 컬럼",
			"linked_table — 채워지면 삽화, 비면 갤러리",
			() => this.plugin.settings.assetsLinkTableColumn,
			(v) => (this.plugin.settings.assetsLinkTableColumn = v)
		);
		colSetting(
			"연결 행 ID 컬럼",
			"linked_id",
			() => this.plugin.settings.assetsLinkIdColumn,
			(v) => (this.plugin.settings.assetsLinkIdColumn = v)
		);
	}
}
