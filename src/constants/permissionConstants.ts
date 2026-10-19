// Genesys-Cloud-Rollennamen, die Polly-Funktionen im Frontend freischalten.
// Bedienschutz-Prüfung im Client; einzige serverseitige Prüfung: polly_deploy bei POST /invitations.
// Ohne Imports, weil die Lambda `invitations` die Datei bündelt.
export const POLLY_ROLE_WRITE = "polly_write";
export const POLLY_ROLE_DEPLOY = "polly_deploy";
export const POLLY_ROLE_REPORTING = "polly_reporting";

// Nach dieser Zeit werden die Rollen bei Bedarf neu aus Genesys gelesen
export const ROLE_CACHE_TTL_MINUTES = 5;
