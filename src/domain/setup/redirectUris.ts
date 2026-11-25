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

// Datatable-IDs einer Installation aus `meta.setup` (Tabelle selbst und Launch-URL als Rückfall,
// falls die ID bei einem abgebrochenen Uninstall schon geleert wurde).
export function installationDatatableIds(setup: { dataTable?: { id?: string }; launchUrl?: string } | undefined): string[] {
	const ids = new Set<string>();
	if (setup?.dataTable?.id) ids.add(setup.dataTable.id);
	const fromLaunch = setup?.launchUrl ? parse(setup.launchUrl)?.searchParams.get("datatable_id")?.trim() : "";
	if (fromLaunch) ids.add(fromLaunch);
	return [...ids];
}
