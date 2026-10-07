// Fallback, wenn beim Build keine Umgebungsvariable GENESYS_REGION gesetzt ist.
export const DEFAULT_GENESYS_REGION = "mypurecloud.de";

// Region aus GENESYS_REGION beim Build (`define` in vite.config.ts). Nur Fallback, wenn die App
// ohne gcHostOrigin gestartet wird – die aktive Region liefert getGenesysRegion() in services/genesysRegion.ts.
export const BUILD_GENESYS_REGION: string =
	(typeof __GENESYS_REGION__ === "string" && __GENESYS_REGION__) || DEFAULT_GENESYS_REGION;
