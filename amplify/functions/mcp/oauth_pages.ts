import { isLoopbackRedirect } from "./oauth";

/**
 * HTML der OAuth-Fassade (Zustimmungs- und Fehlerseite), rein und ohne Skript. Alle Werte werden escaped; Texte
 * Deutsch oder Englisch nach `Accept-Language`. Nicht einbettbar (`frame-ancestors 'none'`, `X-Frame-Options`).
 */

export type PageLang = "de" | "en";

export function pickLang(acceptLanguage: unknown): PageLang {
  return typeof acceptLanguage === "string" && acceptLanguage.trim().toLowerCase().startsWith("de") ? "de" : "en";
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Sicherheits-Header der Seiten. `formTarget`: Ursprung, zu dem das Formular nach dem Absenden weiterleitet. */
export function pageHeaders(formTarget?: string): Record<string, string> {
  const formAction = ["'self'", formTarget].filter(Boolean).join(" ");
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

const TEXTS = {
  de: {
    title: "Polly mit KI-Client verbinden",
    intro: "Ein KI-Client möchte in Ihrem Namen auf Polly zugreifen.",
    client: "Client (selbst angegeben)",
    redirect: "Weiterleitung an",
    loopback: "ein Programm auf diesem Rechner",
    installation: "Installation",
    user: "Angemeldet als",
    scope:
      "Der Client kann mit Ihren Polly-Rollen Umfragen lesen, bearbeiten, deployen und auswerten. Sie können die Verbindung jederzeit im Client trennen; Administratoren können MCP in den Polly-Einstellungen abschalten.",
    allow: "Zulassen",
    deny: "Ablehnen",
    errorTitle: "Anmeldung nicht möglich",
    unnamed: "(ohne Namen)",
  },
  en: {
    title: "Connect Polly to an AI client",
    intro: "An AI client wants to access Polly on your behalf.",
    client: "Client (self-declared)",
    redirect: "Redirects to",
    loopback: "a program on this computer",
    installation: "Installation",
    user: "Signed in as",
    scope:
      "The client can read, edit, deploy and analyse surveys with your Polly roles. You can disconnect it in the client at any time; administrators can switch MCP off in the Polly settings.",
    allow: "Allow",
    deny: "Deny",
    errorTitle: "Sign-in not possible",
    unnamed: "(unnamed)",
  },
} as const;

/** Fehlermeldungen der Seiten; die Schlüssel verwendet der Handler. */
export const PAGE_ERRORS = {
  invalid_request: {
    de: "Die Anfrage des KI-Clients ist ungültig. Starten Sie die Verbindung im Client neu.",
    en: "The request of the AI client is invalid. Start the connection again in the client.",
  },
  expired: {
    de: "Die Anmeldung ist abgelaufen oder wurde in einem anderen Browser begonnen. Starten Sie die Verbindung im Client neu.",
    en: "The sign-in has expired or was started in a different browser. Start the connection again in the client.",
  },
  wrong_org: {
    de: "Das Genesys-Konto gehört nicht zu dieser Polly-Installation.",
    en: "The Genesys account does not belong to this Polly installation.",
  },
  no_role: {
    de: "Ihnen fehlt eine Polly-Rolle (polly_write, polly_deploy oder polly_reporting).",
    en: "You do not have a Polly role (polly_write, polly_deploy or polly_reporting).",
  },
  genesys_error: {
    de: "Genesys Cloud hat die Anmeldung nicht bestätigt. Bitte versuchen Sie es erneut.",
    en: "Genesys Cloud did not confirm the sign-in. Please try again.",
  },
  internal: {
    de: "Ein interner Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.",
    en: "An internal error occurred. Please try again later.",
  },
} as const;

export type PageErrorKey = keyof typeof PAGE_ERRORS;

function layout(lang: PageLang, title: string, body: string): string {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f4f5f7;color:#1f2933}
main{max-width:480px;margin:48px auto;padding:24px;background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.12)}
h1{font-size:1.25rem;margin:0 0 16px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 16px;margin:16px 0}
dt{color:#52606d}dd{margin:0;word-break:break-word}
p{line-height:1.5}
.actions{display:flex;gap:12px;justify-content:flex-end;margin-top:24px}
button{font:inherit;padding:8px 20px;border-radius:6px;border:1px solid #9aa5b1;background:#fff;cursor:pointer}
button.primary{background:#1f6feb;border-color:#1f6feb;color:#fff}
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

export function renderErrorPage(lang: PageLang, key: PageErrorKey): string {
  const texts = TEXTS[lang];
  return layout(lang, texts.errorTitle, `<h1>${escapeHtml(texts.errorTitle)}</h1><p>${escapeHtml(PAGE_ERRORS[key][lang])}</p>`);
}

export interface ConsentView {
  clientName: string;
  redirectUri: string;
  installation: string;
  userName: string;
  /** ID der Anmeldeanfrage und CSRF-Nonce, beide im Formular zurückgeschickt */
  requestId: string;
  nonce: string;
  action: string;
}

export function renderConsentPage(lang: PageLang, view: ConsentView): string {
  const texts = TEXTS[lang];
  const redirect = isLoopbackRedirect(view.redirectUri) ? texts.loopback : new URL(view.redirectUri).host;
  const row = (label: string, value: string) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
  return layout(
    lang,
    texts.title,
    `<h1>${escapeHtml(texts.title)}</h1>
<p>${escapeHtml(texts.intro)}</p>
<dl>${row(texts.client, view.clientName || texts.unnamed)}${row(texts.redirect, redirect)}${row(texts.installation, view.installation)}${row(texts.user, view.userName)}</dl>
<p>${escapeHtml(texts.scope)}</p>
<form method="post" action="${escapeHtml(view.action)}">
<input type="hidden" name="request" value="${escapeHtml(view.requestId)}">
<input type="hidden" name="nonce" value="${escapeHtml(view.nonce)}">
<div class="actions">
<button type="submit" name="decision" value="deny">${escapeHtml(texts.deny)}</button>
<button type="submit" name="decision" value="allow" class="primary">${escapeHtml(texts.allow)}</button>
</div>
</form>`
  );
}
