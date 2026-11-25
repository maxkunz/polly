// Redirect-URIs des Frontend-OAuth-Clients und URL der App-Integration bei Setup und Uninstall.
// Mehrere Installationen (z. B. Branches main, web) können sich einen Frontend-OAuth-Client teilen.
// Setup und Uninstall ändern deshalb nur die Einträge der eigenen Installation, nie die ganze Liste.
// Rein, ohne Vue/Store, damit testbar.

export interface InstallationScope {
	// Ursprung und Pfad der App, z. B. aus der Launch-URL der Installation
	appUrl: string;
	// Data Tables der Installation; Einträge mit anderer `datatable_id` gehören einer anderen Installation
	datatableIds: string[];
}

function parse(uri: string): URL | null {
	try {
		// Die URL der App-Integration darf ohne Schema eingetragen sein (wie in `resolveAppUrl`)
		return new URL(/^https?:\/\//i.test(uri) ? uri : `https://${uri}`);
	} catch {
		return null;
	}
}

function normalizedPath(url: URL): string {
	return url.pathname.replace(/\/+$/, "") || "/";
}

function sameApp(url: URL, appUrl: URL): boolean {
	return url.origin === appUrl.origin && normalizedPath(url) === normalizedPath(appUrl);
}

// Gehört der Eintrag zu dieser Installation? Gleiche App (Ursprung + Pfad) und entweder
// ein Setup-Link ohne `datatable_id` oder die `datatable_id` einer eigenen Tabelle.
// Einträge anderer Domains oder anderer Installationen derselben Domain bleiben unberührt.
export function belongsToInstallation(uri: string, scope: InstallationScope): boolean {
	const url = parse(uri);
	const appUrl = parse(scope.appUrl);
	if (!url || !appUrl || !sameApp(url, appUrl)) return false;
	const datatableId = url.searchParams.get("datatable_id")?.trim();
	if (!datatableId) return true;
	return scope.datatableIds.some(id => id && id === datatableId);
}

// Entfernt die Einträge dieser Installation und ergänzt `entry` (Setup: Launch-URL, Uninstall: Setup-Link).
// Reihenfolge der übrigen Einträge bleibt erhalten, exakte Dubletten fallen weg.
export function replaceInstallationRedirectUris(current: readonly string[] | undefined, entry: string, scope: InstallationScope): string[] {
	const kept = (current ?? []).filter(uri => typeof uri === "string" && uri && !belongsToInstallation(uri, scope));
	return [...new Set([...kept, entry])];
}

// Rollback: Einträge dieser Installation entfernen und nur ihre Einträge aus dem gesicherten Stand `original`
// zurückholen. Einträge, die andere Installationen inzwischen ergänzt haben, bleiben erhalten (kein Zurückschreiben
// der ganzen gesicherten Liste).
export function restoreInstallationRedirectUris(current: readonly string[] | undefined, original: readonly string[] | undefined, scope: InstallationScope): string[] {
	const kept = (current ?? []).filter(uri => typeof uri === "string" && uri && !belongsToInstallation(uri, scope));
	const ownOriginal = (original ?? []).filter(uri => typeof uri === "string" && uri && belongsToInstallation(uri, scope));
	return [...new Set([...kept, ...ownOriginal])];
}

// Einträge derselben App (Ursprung + Pfad) mit einer fremden `datatable_id`: entweder eine andere Installation
// derselben Domain oder Reste früherer Installationen (abgebrochener Uninstall, von Hand gelöschte Data Table).
// Nicht unterscheidbar, deshalb nur melden, nie automatisch entfernen.
export function otherInstallationRedirectUris(current: readonly string[] | undefined, scope: InstallationScope): string[] {
	const appUrl = parse(scope.appUrl);
	if (!appUrl) return [];
	return (current ?? []).filter(uri => {
		const url = typeof uri === "string" && uri ? parse(uri) : null;
		return Boolean(url && sameApp(url, appUrl) && !belongsToInstallation(uri, scope));
	});
}

// Datatable-IDs einer Installation aus `meta.setup` (Tabelle selbst und Launch-URL als Rückfall,
// falls die ID bei einem abgebrochenen Uninstall schon geleert wurde).
export function installationDatatableIds(setup: { dataTable?: { id?: string }; launchUrl?: string } | undefined): string[] {
	const ids = new Set<string>();
	if (setup?.dataTable?.id) ids.add(setup.dataTable.id);
	const fromLaunch = setup?.launchUrl ? parse(setup.launchUrl)?.searchParams.get("datatable_id")?.trim() : "";
	if (fromLaunch) ids.add(fromLaunch);
	return [...ids];
}
