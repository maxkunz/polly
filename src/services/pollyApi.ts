import { useAppStore } from "@/stores/appStore";
import { getGenesysRegion } from "@/services/genesysRegion";

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
 * fetch gegen das eigene Backend (/api) mit Genesys-Bearer und Region.
 * Wirft PollyApiError bei Status >= 400.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
	const accessToken = useAppStore().genesys.accessToken;
	if (!accessToken) throw new MissingTokenError();

	const response = await fetch(`/api${path}`, {
		...init,
		headers: {
			...(init.headers ?? {}),
			Authorization: `Bearer ${accessToken}`,
			"x-genesys-region": getGenesysRegion()
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
