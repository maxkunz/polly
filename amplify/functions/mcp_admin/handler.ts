/**
 * Gerüst der Lambda `mcp_admin` (M5): `GET`/`PUT`/`DELETE /mcp-settings`. Anders als `mcp` liefert sie bei
 * ausgeschaltetem Kill-Switch kein 404, weil `GET` den Status samt Kill-Switch melden soll (M6).
 */

type AnyApiGwEvent = any;
type AnyResult = { statusCode: number; headers: Record<string, string>; body: string };

export const handler = async (_event: AnyApiGwEvent): Promise<AnyResult> => ({
  statusCode: 501,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify({ error: "not_implemented" }),
});
