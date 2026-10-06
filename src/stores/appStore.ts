import { defineStore } from "pinia";
import platformClient from "purecloud-platform-client-v2";
import * as genesysHelper from "@/services/genesys_helper";
import { OneRowDataTable, listDataTables } from "@/services/genesys/dataTable";
import { POLLY_DATA_TABLE_NAME, POLLY_MAPPING_DATA_TABLE_NAME } from "@/constants/surveyConstants";
import { POLLY_ROLE_DEPLOY, POLLY_ROLE_REPORTING, POLLY_ROLE_WRITE, ROLE_CACHE_TTL_MINUTES } from "@/constants/permissionConstants";

import { Domain } from "@/domain/Domain";
import type { QuestionAnswerStats } from "@/services/genesys_helper";

// roles: Namen der Genesys-Rollen des Users (beim Login geladen, Refresh über refreshRoles)
export type CurrentUser = { id: string; name: string; email?: string; roles: string[] };

function hasRole(user: CurrentUser | null, role: string): boolean {
	const wanted = role.toLowerCase();
	return (user?.roles ?? []).some(r => r.toLowerCase() === wanted);
}

// Laufender Rollen-Refresh, damit parallele Aufrufe nur einen API-Call auslösen
let rolesRefreshPromise: Promise<void> | null = null;

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
		// Zeitpunkt (ms) des letzten Rollen-Ladeversuchs
		rolesLoadedAt: 0,

		domain: new Domain(),
		questionAnswers: {} as Record<string, QuestionAnswerStats>,
		surveys: [] as any[],

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
		dataTableId: null as string | null,
		mappingDataTableId: null as string | null,
		devView: false,

	}),
	getters: {
		// Darf Umfragen anlegen, klonen, bearbeiten und löschen
		canWrite: (state): boolean => hasRole(state.currentUser, POLLY_ROLE_WRITE),
		// Darf nach Stage/Prod deployen, Rollback ausführen und Queue-Mapping pflegen
		canDeploy: (state): boolean => hasRole(state.currentUser, POLLY_ROLE_DEPLOY),
		// Darf Umfrageergebnisse exportieren (CSV-Download im Report)
		canExport: (state): boolean => hasRole(state.currentUser, POLLY_ROLE_REPORTING),
	},
	actions: {
		// Liest die Rollen neu ein, wenn sie älter als ROLE_CACHE_TTL_MINUTES sind.
		// Bei einem Fehler bleiben die bisherigen Rollen erhalten, neuer Versuch nach Ablauf der TTL.
		async refreshRoles(force = false): Promise<void> {
			if (!this.currentUser || !this.genesys.accessToken) return;
			const isFresh = Date.now() - this.rolesLoadedAt < ROLE_CACHE_TTL_MINUTES * 60_000;
			if (isFresh && !force) return;
			if (!rolesRefreshPromise) {
				rolesRefreshPromise = (async () => {
					try {
						const roles = await genesysHelper.loadCurrentUserRoles();
						if (roles && this.currentUser) {
							this.currentUser.roles = roles;
						}
						this.rolesLoadedAt = Date.now();
					} finally {
						rolesRefreshPromise = null;
					}
				})();
			}
			await rolesRefreshPromise;
		},
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

		async findDataTableIdByName(name: string): Promise<string> {
			this.initGenesysClients();
			const res = await listDataTables(name);
			const entities = res?.entities || res || [];
			console.log("datatables found: ", entities);
			const targetTable = entities.find((t: any) => t.name === name);
			if (!targetTable || !targetTable.id) {
				throw new Error(`Data table '${name}' not found.`);
			}
			return targetTable.id;
		},

		async ensureDataTableId(): Promise<string> {
			if (this.dataTableId) {
				return this.dataTableId;
			}
			this.dataTableId = await this.findDataTableIdByName(POLLY_DATA_TABLE_NAME);
			return this.dataTableId;
		},

		async ensureMappingDataTableId(): Promise<string> {
			if (this.mappingDataTableId) {
				return this.mappingDataTableId;
			}
			this.mappingDataTableId = await this.findDataTableIdByName(POLLY_MAPPING_DATA_TABLE_NAME);
			return this.mappingDataTableId;
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

		async loadSurveys(): Promise<void> {
			const rowId = "survey_list";
			try {
				const datatableId = await this.ensureDataTableId();
				const data = await OneRowDataTable(datatableId, rowId);
				if (data) {
					const rawDraft = data.Draft ?? data.draft;
					if (rawDraft) {
						this.surveys = typeof rawDraft === "string" ? JSON.parse(rawDraft) : rawDraft;
					}
				}
			} catch (e) {
				console.error("Failed to load surveys:", e);
			}
		},

		async initializeFromLocation(currentUrl?: string): Promise<void> {
			if (this.initialized) return;
			this.initGenesysClients();

			const search =
				currentUrl !== undefined
					? new URL(currentUrl).search
					: window.location.search;
			const params = new URLSearchParams(search);

			this.clientId =
				params.get("client_id") || sessionStorage.getItem("gc_client_id");
			this.datatableId =
				params.get("datatable_id") || sessionStorage.getItem("gc_datatable_id");

			if (this.clientId) sessionStorage.setItem("gc_client_id", this.clientId);
			if (this.datatableId)
				sessionStorage.setItem("gc_datatable_id", this.datatableId);

			let redirectUri = sessionStorage.getItem("gc_redirect_uri");

			if (!redirectUri) {
				const urlObj = new URL(currentUrl ?? window.location.href);
				urlObj.hash = "";
				redirectUri = urlObj.toString();
				sessionStorage.setItem("gc_redirect_uri", redirectUri);
			}

			await (genesysHelper as any).login(this.clientId, redirectUri);

			if (!this.datatableId) return;

			await genesysHelper.getConfigurationDataFromGenesys(this.datatableId);
			await this.loadSurveys();
			this.initialized = true;
		},
	}
});
