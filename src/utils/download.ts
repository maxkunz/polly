/**
 * Löst im Browser den Download eines Blobs aus.
 */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	// Verzögert freigeben, damit der Download sicher gestartet ist.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
