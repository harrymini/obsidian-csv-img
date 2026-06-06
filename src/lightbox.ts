/**
 * A minimal full-screen image lightbox.
 *
 * Clicking a thumbnail opens the image at (up to) its natural size centered on
 * a dimmed overlay. Click the overlay/image or press Escape to close. One
 * overlay is reused across opens.
 */

let overlay: HTMLDivElement | null = null;
let imgEl: HTMLImageElement | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;

function ensureOverlay(): HTMLDivElement {
	if (overlay) return overlay;
	const o = document.createElement("div");
	o.className = "csv-img-lightbox";
	const img = document.createElement("img");
	img.className = "csv-img-lightbox-img";
	o.appendChild(img);
	o.addEventListener("click", () => closeLightbox());
	document.body.appendChild(o);
	overlay = o;
	imgEl = img;
	return o;
}

export function openLightbox(src: string, alt?: string): void {
	const o = ensureOverlay();
	if (imgEl) {
		imgEl.src = src;
		imgEl.alt = alt ?? "";
	}
	o.addClass("is-open");
	keyHandler = (e: KeyboardEvent) => {
		if (e.key === "Escape") closeLightbox();
	};
	document.addEventListener("keydown", keyHandler);
}

export function closeLightbox(): void {
	if (overlay) overlay.removeClass("is-open");
	if (keyHandler) {
		document.removeEventListener("keydown", keyHandler);
		keyHandler = null;
	}
}

/** Attach lightbox-on-click to a thumbnail <img>. */
export function makeThumbClickable(thumb: HTMLImageElement, src: string): void {
	thumb.addClass("csv-img-clickable");
	thumb.addEventListener("click", (ev) => {
		ev.stopPropagation();
		openLightbox(src, thumb.alt);
	});
}
