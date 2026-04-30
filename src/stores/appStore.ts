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
			const search =
				currentUrl !== undefined
					? new URL(currentUrl).search
					: window.location.search;
			const params = new URLSearchParams(search);

			this.clientId = params.get("client_id");
			this.datatableId = params.get("datatable_id");
			console.log(`initializeFromLocation called (${this.initialized}) with clientId: ${this.clientId}`);

			await (genesysHelper as any).login(this.clientId, url);

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
