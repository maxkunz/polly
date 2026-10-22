import { apiFetch } from "@/services/pollyApi";

/** Anfrage an `POST /invitations` (siehe `documentation/polly_web.md`). */
export interface InvitationRequest {
	surveyId: string;
	count: number;
	multi: boolean;
	/** Ablaufdatum (Epoch-Sekunden); fehlt = läuft nie ab. */
	exp?: number;
}

export interface InvitationToken {
	jwt: string;
	exp?: number;
	multi: boolean;
}

/** Antwort von `POST /invitations/preview`: Webvorschau-Link auf den Stage-Stand. */
export interface PreviewInvitation {
	jwt: string;
	/** Ablaufdatum (Epoch-Sekunden), vom Server fest auf 7 Tage gesetzt. */
	exp: number;
}

/** Lässt einen Webvorschau-JWT (Stage-Stand) im Backend signieren. Wirft PollyApiError bzw. MissingTokenError. */
export async function createPreviewInvitation(surveyId: string): Promise<PreviewInvitation> {
	const response = await apiFetch("/invitations/preview", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ surveyId })
	});
	const body = await response.json();
	if (typeof body?.jwt !== "string" || !body.jwt) throw new Error("Missing jwt in response");
	return { jwt: body.jwt, exp: Number(body.exp) };
}

/** Lässt die Einladungs-JWTs im Backend signieren. Wirft PollyApiError bzw. MissingTokenError. */
export async function createInvitations(request: InvitationRequest, signal?: AbortSignal): Promise<InvitationToken[]> {
	const response = await apiFetch("/invitations", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(request),
		signal
	});
	const body = await response.json();
	return Array.isArray(body?.tokens) ? (body.tokens as InvitationToken[]) : [];
}
