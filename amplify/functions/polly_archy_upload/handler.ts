import type { APIGatewayProxyResult, APIGatewayProxyResultV2 } from "aws-lambda";
import { resolveTenantContext } from "../shared/tenant_auth";

type AnyApiGwEvent = any;
type AnyResult = APIGatewayProxyResult | APIGatewayProxyResultV2;
const TEMPLATE_API_BASE = process.env.TEMPLATE_API_BASE ?? "";

function json(statusCode: number, body: unknown): AnyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  } as AnyResult;
}

function text(
  statusCode: number,
  body: string,
  headers?: Record<string, string>
): AnyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
      ...headers,
    },
    body,
  } as AnyResult;
}

function getMethod(event: AnyApiGwEvent): string {
  const v2 = event?.requestContext?.http?.method;
  if (typeof v2 === "string") return v2;

  const v1 = event?.httpMethod;
  if (typeof v1 === "string") return v1;

  return "";
}

function safeParse<T>(raw?: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getTemplateAuthHeaders(event: AnyApiGwEvent): Record<string, string> {
  const headers = event?.headers ?? {};
  const authorization = headers.authorization ?? headers.Authorization;
  const genesysRegion = headers["x-genesys-region"] ?? headers["X-Genesys-Region"];

  return {
    ...(typeof authorization === "string" && authorization.trim() ? { Authorization: authorization } : {}),
    ...(typeof genesysRegion === "string" && genesysRegion.trim() ? { "x-genesys-region": genesysRegion } : {}),
  };
}

type UploadBody = {
  url: string;
  headers?: Record<string, string>;
  contentType?: string;
  body?: string;
  bodyBase64?: string;
  templateName?: string;
  domain?: string;
  domainVersion?: string;
  replacements?: Record<string, string>;
};

type RouteHandler = (event: AnyApiGwEvent, requestId: string) => Promise<AnyResult>;

const TEMPLATE_ALLOWLIST = new Set([
  "botFlowStructure.yaml",
  "commonModuleStructure.yaml",
  "inboundFlowStructure.yaml",
  "messengerFlowStructure.yaml",
  "workFlowStructure.yaml",
  "guideBotFlow.yaml"
]);

function applyReplacements(
  template: string,
  replacements?: Record<string, string>
): string {
  if (!replacements) return template;
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    const token = `{{${key}}}`;
    result = result.split(token).join(value);
  }
  return result;
}

async function loadTemplateFromApi(
  templateName: string,
  domain: string | undefined,
  domainVersion: string | undefined,
  authHeaders: Record<string, string>
): Promise<string> {
  if (!TEMPLATE_API_BASE) throw new Error("TEMPLATE_API_BASE missing");
  if (!domain) throw new Error("Missing domain");
  const query = new URLSearchParams({
    theme: domain,
    filePath: `flows/${templateName}`,
  });
  if (domainVersion) query.set("version", domainVersion);
  const url = `${TEMPLATE_API_BASE}?${query.toString()}`;
  const response = await fetch(url, { headers: authHeaders });
  if (!response.ok) throw new Error(`Template fetch failed: ${response.status} ${response.statusText}`);
  return await response.text();
}

export const handler = async (event: AnyApiGwEvent): Promise<AnyResult> => {
  const requestId =
    event?.requestContext?.requestId ??
    event?.requestContext?.http?.requestId ??
    "unknown";
  console.debug("Archy upload request received", { requestId, isBase64Encoded: Boolean(event?.isBase64Encoded), hasBody: Boolean(event?.body), bodyLength: typeof event?.body === "string" ? event.body.length : 0, methodV2: event?.requestContext?.http?.method, methodV1: event?.httpMethod });

  const method = getMethod(event);
  console.debug("Archy upload method resolved", { requestId, method });
  if (method === "OPTIONS") return json(204, "");

  const tenantResult = await resolveTenantContext(event, { skipTenantLookup: true });
  if (!tenantResult.context || tenantResult.context.source !== "genesys") {
    console.warn("Archy upload authorization failed", {
      requestId,
      error: tenantResult.error ?? "Genesys token required",
    });
    return json(403, { message: tenantResult.error ?? "Genesys token required" });
  }

  const routes: Record<string, RouteHandler> = {
    GET: handleDownload,
    POST: handleUpload,
  };

  const route = routes[method];
  if (!route) return json(405, { message: "Method not allowed" });
  return route(event, requestId);
};

async function handleDownload(
  event: AnyApiGwEvent,
  requestId: string
): Promise<AnyResult> {
  const url =
    event?.queryStringParameters?.url ??
    new URLSearchParams(event?.rawQueryString ?? "").get("url") ??
    "";
  if (!url) return json(400, { message: "Missing url" });

  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    console.warn("Archy download invalid url", { requestId, url });
    return json(400, { message: "Invalid download url" });
  }

  const isAllowed = /^api-downloads\.(?:mypurecloud\.[a-z.]+|[a-z0-9-]+\.(?:pure\.cloud|us-gov-pure\.cloud|eusc-pure\.cloud))$/i.test(hostname);

  if (!isAllowed) {
    console.warn("Archy download host rejected", { requestId, hostname });
    return json(400, { message: "Invalid download host" });
  }

  try {
    console.debug("Archy download fetch started", { requestId, url });
    const res = await fetch(url, { method: "GET" });
    const textBody = await res.text();
    console.debug("Archy download fetch completed", { requestId, status: res.status, ok: res.ok, responseBodyLength: textBody.length });
    if (!res.ok) {
      console.error("Archy download failed", { requestId, status: res.status, responseBodyLength: textBody.length });
      return json(res.status, {
        message: "Download failed",
        status: res.status,
        body: textBody,
      });
    }

    const fileName = new URL(url).pathname.split("/").pop() || "botflow.yaml";
    console.info("Archy download completed", { requestId, status: res.status, fileName, responseBodyLength: textBody.length });
    return text(200, textBody, {
      "Content-Type": "text/yaml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    });
  } catch (err: any) {
    console.error("Archy download fetch error", { requestId, error: err?.message ?? String(err) });
    return json(500, {
      message: "Download error",
      error: err?.message ?? String(err),
    });
  }
}

async function handleUpload(
  event: AnyApiGwEvent,
  requestId: string
): Promise<AnyResult> {
  const rawBody = event?.body ?? "";
  const decodedBody = event?.isBase64Encoded
    ? Buffer.from(rawBody, "base64").toString("utf-8")
    : rawBody;

  const payload = safeParse<UploadBody>(decodedBody);
  console.debug("Archy upload payload parsed", { requestId, ok: Boolean(payload), hasUrl: Boolean(payload?.url), headerKeys: payload?.headers ? Object.keys(payload.headers) : [], contentType: payload?.contentType ?? null, bodyLength: payload?.body ? payload.body.length : 0, bodyBase64Length: payload?.bodyBase64 ? payload.bodyBase64.length : 0, templateName: payload?.templateName ?? null, domain: payload?.domain ?? null, domainVersion: payload?.domainVersion ?? null });
  if (!payload?.url) {
    return json(400, { message: "Missing url" });
  }

  const url = payload.url;
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    console.warn("Archy upload invalid url", { requestId, url });
    return json(400, { message: "Invalid upload url" });
  }
  console.debug("Archy upload url parsed", { requestId, hostname });

  const isAllowed =
    /^fileupload\.(?:mypurecloud\.[a-z.]+|[a-z0-9-]+\.(?:pure\.cloud|us-gov-pure\.cloud|eusc-pure\.cloud))$/i.test(hostname) ||
    /^(?:prod(?:-[a-z0-9-]+)?|fedramp-[a-z0-9-]+-core|eusc-[a-z0-9-]+)-archy-jobs\.s3\.[a-z0-9-]+\.amazonaws\.(?:com|eu)$/i.test(hostname);

  if (!isAllowed) {
    console.warn("Archy upload host rejected", { requestId, hostname });
    return json(400, { message: "Invalid upload host" });
  }
  console.debug("Archy upload host allowed", { requestId, hostname });

  const headers = { ...(payload.headers ?? {}) } as Record<string, string>;
  const contentType = payload.contentType || headers["Content-Type"] || "application/octet-stream";
  headers["Content-Type"] = contentType;

  let bodyBuffer: Buffer;
  if (payload.bodyBase64) {
    bodyBuffer = Buffer.from(payload.bodyBase64, "base64");
  } else if (payload.templateName) {
    if (!TEMPLATE_ALLOWLIST.has(payload.templateName)) {
      return json(400, { message: "Invalid templateName" });
    }
    const templateRaw = await loadTemplateFromApi(
      payload.templateName,
      payload.domain,
      payload.domainVersion,
      getTemplateAuthHeaders(event)
    );
    const rendered = applyReplacements(templateRaw, payload.replacements);
    console.debug("Archy upload template rendered", { requestId, templateName: payload.templateName, domain: payload.domain ?? "default", domainVersion: payload.domainVersion ?? "draft", bodyBytes: Buffer.byteLength(rendered, "utf-8") });
    bodyBuffer = Buffer.from(rendered, "utf-8");
  } else {
    bodyBuffer = Buffer.from(payload.body ?? "", "utf-8");
  }
  console.debug("Archy upload request prepared", { requestId, contentType, headerKeys: Object.keys(headers), bodyBytes: bodyBuffer.byteLength });

  const body = new Uint8Array(bodyBuffer);

  try {
    console.debug("Archy upload fetch started", { requestId, url });
    const res = await fetch(url, {
      method: "PUT",
      headers,
      body,
    });

    const text = await res.text();
    console.debug("Archy upload fetch completed", { requestId, status: res.status, ok: res.ok, responseBodyLength: text.length });
    if (!res.ok) {
      console.error("Archy upload failed", { requestId, status: res.status, statusText: res.statusText, responseBodyLength: text.length });
      return json(res.status, {
        message: "Upload failed",
        status: res.status,
        body: text,
      });
    }

    console.info("Archy upload completed", { requestId, status: res.status, contentType, bodyBytes: bodyBuffer.byteLength, templateName: payload.templateName ?? null, domain: payload.domain ?? null });
    return json(200, { message: "Upload ok", status: res.status });
  } catch (err: any) {
    console.error("Archy upload fetch error", { requestId, error: err?.message ?? String(err) });
    return json(500, {
      message: "Upload error",
      error: err?.message ?? String(err),
    });
  }
}
