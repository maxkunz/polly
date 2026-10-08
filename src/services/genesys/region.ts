/** Liest die Genesys-Region aus gcHostOrigin, z. B. apps.mypurecloud.de. */
export function getGenesysRegion(currentUrl: string): string {
	const hostOrigin = new URL(currentUrl).searchParams.get("gcHostOrigin");
	if (!hostOrigin) {
		throw new Error("Missing required gcHostOrigin URL parameter.");
	}

	const hostname = new URL(hostOrigin).hostname.toLowerCase();
	if (!hostname.startsWith("apps.")) {
		throw new Error(`Invalid Genesys gcHostOrigin: ${hostOrigin}`);
	}

	return hostname.slice("apps.".length);
}

export function genesysAuthStoragePrefix(clientId: string, region: string): string {
	const regionKey = region.toLowerCase().replace(/[^a-z0-9]+/g, "_");
	return `polly_genesys_${clientId}_${regionKey}`;
}
