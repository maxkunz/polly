// Erlaubte Genesys-Cloud-Regionen (Hosts ohne "api."/"apps."-Präfix).
// Quelle: PureCloudRegionHosts aus purecloud-platform-client-v2 – bei neuen Genesys-Regionen hier ergänzen.
// Nur diese Hosts dürfen für Token-Prüfung und API-Aufrufe verwendet werden, sonst könnte ein
// Aufrufer über x-genesys-region einen eigenen Server als "Genesys" unterschieben.
export const GENESYS_REGIONS: readonly string[] = [
  "mypurecloud.com",
  "mypurecloud.ie",
  "mypurecloud.com.au",
  "mypurecloud.jp",
  "mypurecloud.de",
  "usw2.pure.cloud",
  "cac1.pure.cloud",
  "apne2.pure.cloud",
  "euw2.pure.cloud",
  "aps1.pure.cloud",
  "use2.us-gov-pure.cloud",
  "sae1.pure.cloud",
  "mec1.pure.cloud",
  "apne3.pure.cloud",
  "euc2.pure.cloud",
  "mxc1.pure.cloud",
  "apse1.pure.cloud",
  "edee1.eusc-pure.cloud",
];

/** Normalisiert eine Regionsangabe (trim, lowercase); leerer String bei ungültigem Typ. */
export function normalizeGenesysRegion(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isGenesysRegion(value: unknown): boolean {
  return GENESYS_REGIONS.includes(normalizeGenesysRegion(value));
}
