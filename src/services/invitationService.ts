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
