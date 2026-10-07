// Genesys-Cloud-Rollennamen, die Polly-Funktionen im Frontend freischalten.
// Reine Bedienschutz-Prüfung im Client, keine serverseitige Absicherung.
export const POLLY_ROLE_WRITE = "polly_write";
export const POLLY_ROLE_DEPLOY = "polly_deploy";
export const POLLY_ROLE_REPORTING = "polly_reporting";

// Nach dieser Zeit werden die Rollen bei Bedarf neu aus Genesys gelesen
export const ROLE_CACHE_TTL_MINUTES = 5;
