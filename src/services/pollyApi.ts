import { useAppStore } from "@/stores/appStore";
import { getGenesysRegion } from "@/services/genesysRegion";
import { API_PREFIX } from "@/constants/apiConstants";

export class PollyApiError extends Error {
	constructor(
		message: string,
		public readonly status: number
	) {
		super(message);
		this.name = "PollyApiError";
	}
}

export class MissingTokenError extends Error {
	constructor() {
		super("Missing Genesys access token.");
		this.name = "MissingTokenError";
	}
}

/**
 * fetch gegen das eigene Backend (API_PREFIX, Default /api) mit Genesys-Bearer und Region.
 * Wirft PollyApiError bei Status >= 400.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
	const { accessToken, region } = useAppStore().genesys;
	if (!accessToken) throw new MissingTokenError();

	const response = await fetch(`${API_PREFIX}${path}`, {
		...init,
		headers: {
			...(init.headers ?? {}),
			Authorization: `Bearer ${accessToken}`,
			// Region des Logins (appStore, aus gcHostOrigin der gemerkten Start-URL) – passt garantiert zum Token.
			// getGenesysRegion() liest nur die aktuelle URL/sessionStorage und fällt nach dem PKCE-Redirect
			// bzw. auf internen Routen ohne gcHostOrigin auf den Build-Default zurück.
			"x-genesys-region": region || getGenesysRegion()
		}
	});

	if (!response.ok) {
		let message = `HTTP ${response.status}`;
		try {
			const body = await response.json();
			if (body?.message) message = String(body.message);
		} catch {
			// Antwort ohne JSON-Body
		}
		throw new PollyApiError(message, response.status);
	}
	return response;
}
