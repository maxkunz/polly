import { normalizeFeatures, type FeatureFlags } from "./features/featureFlags";

export class Meta {
	appTitle: string;
	setup: Record<string, any> | null;
	/** Feature Flags der Installation (siehe domain/features/featureFlags.ts) */
	features: FeatureFlags;
	/** Web-Einstellungen des Mandanten: Standard-Basis-URL für Einladungslinks (leer = keine) */
	web: { defaultBaseUrl: string };
	private extras: Record<string, unknown>;

	constructor(init?: Record<string, unknown>) {
		this.appTitle = typeof init?.appTitle === "string" ? init.appTitle : "";
		this.setup =
			init?.setup && typeof init.setup === "object"
				? (init.setup as Record<string, any>)
				: null;
		this.features = normalizeFeatures(init?.features);
		const web = init?.web as { defaultBaseUrl?: unknown } | undefined;
		this.web = {
			defaultBaseUrl: typeof web?.defaultBaseUrl === "string" ? web.defaultBaseUrl.trim() : ""
		};

		const extras = { ...(init ?? {}) };
		delete extras.appTitle;
		delete extras.setup;
		delete extras.features;
		delete extras.web;
		this.extras = extras;
	}

	static fromJSON(json: unknown): Meta {
		if (!json || typeof json !== "object") {
			return new Meta();
		}
		return new Meta(json as Record<string, unknown>);
	}

	toJSON(): Record<string, unknown> {
		return {
			...this.extras,
			appTitle: this.appTitle,
			setup: this.setup,
			features: this.features,
			// Nur mit Wert schreiben, damit bestehende Installationen unverändert bleiben
			...(this.web.defaultBaseUrl ? { web: this.web } : {})
		};
	}
}
