/**
 * Gemeinsame HTTP-Bausteine der Kunden-API (`/ext/v1/…`), ohne Version und ohne AWS-SDK:
 * Fehlerformat `{ error, message }` und Routing nach `routeKey` über eine Routing-Tabelle.
 * Format: documentation/polly_customer_api.md, Abschnitt 3.
 */

export type ExtResult = { statusCode: number; headers: Record<string, string>; body: string };

export type ExtRoute<TContext = unknown> = (event: any, context?: TContext) => Promise<ExtResult>;

/** Antwort-Header einer Kunden-API-Lambda (CORS mit den Methoden ihrer Routen). */
export function extHeaders(methods: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": `OPTIONS,${methods}`,
  };
}

export function extJson(headers: Record<string, string>, statusCode: number, body: unknown): ExtResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}

export function extError(headers: Record<string, string>, statusCode: number, error: string, message: string): ExtResult {
  return extJson(headers, statusCode, { error, message });
}

/** true, wenn das Event zu einer Route der Kunden-API gehört (nur nach `routeKey`, wie beim Routing). */
export function isExtRouteKey(event: any): boolean {
  const routePath = String(event?.routeKey ?? "").split(" ")[1] ?? "";
  return routePath.startsWith("/ext/");
}

/** Sucht die Route nach `routeKey` (404 `not_found`) und fängt unerwartete Fehler ab (500 `internal_error`). */
export async function dispatchExtRoute<TContext>(
  routes: Record<string, ExtRoute<TContext>>,
  event: any,
  context: TContext | undefined,
  headers: Record<string, string>,
  logPrefix: string
): Promise<ExtResult> {
  const route = routes[event?.routeKey ?? ""];
  if (!route) return extError(headers, 404, "not_found", "Route not found");
  try {
    return await route(event, context);
  } catch (error) {
    console.error(`${logPrefix} Unhandled error`, error);
    return extError(headers, 500, "internal_error", "Internal error");
  }
}
