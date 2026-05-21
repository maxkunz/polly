import { defineStore } from "pinia";
import platformClient from "purecloud-platform-client-v2";
import * as genesysHelper from "@/services/genesys_helper";

import { Domain } from "@/domain/Domain";
import type { QuestionAnswerStats } from "@/services/genesys_helper";

export type CurrentUser = { id: string; name: string; email?: string };

const SESSION_ID_KEY = "app.sessionId";
function loadSessionId(): string {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return crypto.randomUUID();
    }
    const existing = window.localStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(SESSION_ID_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export const useAppStore = defineStore("app", {
	state: () => ({
		initialized: false,
		editMode: false,
		sessionId: loadSessionId(),
		currentUser: null as CurrentUser | null,

		domain: new Domain(),
		questionAnswers: {} as Record<string, QuestionAnswerStats>,

		dropdowns: {} as Record<string, { selected: any }>,

		genesys: {
			client: null as any,
			architectApi: null as any,
			authorizationApi: null as any,
			groupsApi: null as any,
			integrationsApi: null as any,
			oAuthApi: null as any,
			objectsApi: null as any,
			usersApi: null as any,
			accessToken: null as string | null,
		},

		clientId: null as string | null,
		datatableId: null as string | null,
		devView: false,

	}),
	getters: {

	},
	actions: {
		initGenesysClients(): void {
			if (!this.genesys.client) {
				this.genesys.client = (platformClient as any).ApiClient.instance;
			}
			if (!this.genesys.architectApi) {
				this.genesys.architectApi = new (platformClient as any).ArchitectApi();
			}
			if (!this.genesys.authorizationApi) {
				this.genesys.authorizationApi = new (platformClient as any).AuthorizationApi();
			}
			if (!this.genesys.groupsApi) {
				this.genesys.groupsApi = new (platformClient as any).GroupsApi();
			}
			if (!this.genesys.integrationsApi) {
				this.genesys.integrationsApi = new (platformClient as any).IntegrationsApi();
			}
			if (!this.genesys.oAuthApi) {
				this.genesys.oAuthApi = new (platformClient as any).OAuthApi();
			}
			if (!this.genesys.objectsApi) {
				this.genesys.objectsApi = new (platformClient as any).ObjectsApi();
			}
			if (!this.genesys.usersApi) {
				this.genesys.usersApi = new (platformClient as any).UsersApi();
			}
		},

		async save(): Promise<string> {
			await genesysHelper.syncConfigurationToGenesys(this.datatableId);
			return "";
		},

		async loadQuestionAnswers(): Promise<void> {
			const items = await genesysHelper.getQuestionAnswers();
			this.questionAnswers = Object.fromEntries(
				items.map(item => [item.questionId, item])
			);
		},
		async initializeFromLocation(currentUrl?: string): Promise<void> {
			if (this.initialized) return;
			const url = currentUrl ?? window.location.href;
			this.initGenesysClients();

			// URL analysieren und eine bereinigte Version ohne Query-Parameter erstellen
			const urlObj = new URL(url);
			const cleanRedirectUri = urlObj.origin + urlObj.pathname;

			const params = new URLSearchParams(urlObj.search);

			// Werte aus der URL lesen
			const urlClientId = params.get("client_id");
			const urlDatatableId = params.get("datatable_id");

			// Im sessionStorage zwischenspeichern, damit sie nach dem Genesys-Redirect noch da sind
			if (urlClientId) sessionStorage.setItem("saved_client_id", urlClientId);
			if (urlDatatableId) sessionStorage.setItem("saved_datatable_id", urlDatatableId);

			// Werte laden (entweder aus der aktuellen URL oder dem Speicher nach dem Redirect)
			this.clientId = urlClientId || sessionStorage.getItem("saved_client_id");
			this.datatableId = urlDatatableId || sessionStorage.getItem("saved_datatable_id");

			console.log(`initializeFromLocation called (${this.initialized}) with clientId: ${this.clientId}`);

			// Den Login mit der SAUBEREN Basis-URL aufrufen
			await (genesysHelper as any).login(this.clientId, cleanRedirectUri);

			if (!this.datatableId) {
				console.info("Setup mode: missing datatable_id.");
				return;
			}

			await genesysHelper.getConfigurationDataFromGenesys(this.datatableId);
			await this.loadQuestionAnswers();
			this.initialized = true;
		}
	}
});
