// Fallback, wenn beim Build keine Umgebungsvariable GENESYS_REGION gesetzt ist.
export const DEFAULT_GENESYS_REGION = "mypurecloud.de";

// Genesys-Region (Login, Header x-genesys-region, Onboarding, Host-Origin-Fallback).
// Wird beim Build aus GENESYS_REGION übernommen (`define` in vite.config.ts).
export const GENESYS_REGION: string =
	(typeof __GENESYS_REGION__ === "string" && __GENESYS_REGION__) || DEFAULT_GENESYS_REGION;
