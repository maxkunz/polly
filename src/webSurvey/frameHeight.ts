/**
 * Meldet der einbettenden Seite die Höhe der Umfrage, wenn sie in einem iframe läuft:
 * `postMessage({ type: "polly:height", height })` (Snippet in `documentation/polly_web.md`).
 * Die Nachricht enthält nur die Höhe, deshalb Ziel-Origin `*`. Die Seite empfängt selbst keine Nachrichten.
 */
export function startFrameHeightReporting(element: HTMLElement): void {
	if (window.parent === window || typeof ResizeObserver === "undefined") return;

	let lastHeight = 0;
	let scheduled = false;

	const report = () => {
		scheduled = false;
		const height = Math.ceil(element.getBoundingClientRect().height);
		if (height === lastHeight) return;
		lastHeight = height;
		window.parent.postMessage({ type: "polly:height", height }, "*");
	};

	new ResizeObserver(() => {
		if (scheduled) return;
		scheduled = true;
		requestAnimationFrame(report);
	}).observe(element);
}
