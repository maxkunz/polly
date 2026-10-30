import { isMcpEnabled } from "../shared/mcp_config";

/**
 * Gerüst der MCP-Lambda (M5). Alle MCP- und `.well-known`-Routen landen hier. Ist der globale Kill-Switch
 * `MCP_ENABLED` nicht `"true"`, antworten sie einheitlich mit 404 (keine Mandanten-Enumeration, siehe
 * `documentation/polly_mcp.md`, Abschnitt 2). Die OAuth-Fassade (M7) und der MCP-Server (M8) kommen danach.
 */

type AnyApiGwEvent = any;
type AnyResult = { statusCode: number; headers: Record<string, string>; body: string };

function jsonResponse(statusCode: number, body: Record<string, unknown>): AnyResult {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

export const handler = async (_event: AnyApiGwEvent): Promise<AnyResult> => {
  if (!isMcpEnabled()) {
    return jsonResponse(404, { error: "not_found" });
  }
  return jsonResponse(501, { error: "not_implemented" });
};
