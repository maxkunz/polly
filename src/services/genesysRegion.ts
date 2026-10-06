import platformClient from "purecloud-platform-client-v2";
import { BUILD_GENESYS_REGION, DEFAULT_GENESYS_REGION } from "@/constants/genesysConstants";

// Merkt sich die Region über den Login-Redirect (Implicit Grant) hinweg
const REGION_STORAGE_KEY = "gc_region";

const KNOWN_REGIONS = new Set<string>(
	Object.values((platformClient as any).PureCloudRegionHosts ?? {}) as string[]
);

let activeRegion: string | null = null;

function normalizeRegion(value: string | null | undefined): string | undefined {
	const region = (value ?? "").trim().toLowerCase();
	return KNOWN_REGIONS.has(region) ? region : undefined;
}

/** Region aus gcHostOrigin, z. B. https://apps.usw2.pure.cloud → usw2.pure.cloud (nur bekannte Regionen). */
export function regionFromHostOrigin(origin: string | null | undefined): string | undefined {
	if (!origin) return undefined;
	try {
		const url = new URL(origin.startsWith("http") ? origin : `https://${origin}`);
		return normalizeRegion(url.hostname.replace(/^apps\./, ""));
	} catch {
		return undefined;
	}
}

function readStoredRegion(): string | undefined {
	try {
		return normalizeRegion(sessionStorage.getItem(REGION_STORAGE_KEY));
	} catch {
		return undefined;
	}
}

function storeRegion(region: string): void {
	try {
		sessionStorage.setItem(REGION_STORAGE_KEY, region);
	} catch {
		// sessionStorage nicht verfügbar – Region gilt dann nur für diesen Seitenaufruf
	}
}

/**
 * Aktive Genesys-Region: gcHostOrigin aus der Start-URL (Genesys-App-Integration),
 * sonst die zuletzt gemerkte Region, sonst der Build-Wert (GENESYS_REGION / Default).
 */
export function getGenesysRegion(): string {
	if (activeRegion) return activeRegion;

	const fromUrl = regionFromHostOrigin(new URLSearchParams(window.location.search).get("gcHostOrigin"));
	if (fromUrl) {
		storeRegion(fromUrl);
		activeRegion = fromUrl;
		return fromUrl;
	}

	activeRegion = readStoredRegion() ?? normalizeRegion(BUILD_GENESYS_REGION) ?? DEFAULT_GENESYS_REGION;
	return activeRegion;
}
