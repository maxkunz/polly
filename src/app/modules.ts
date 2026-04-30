import { computed } from "vue";
import { useAppStore } from "@/stores/appStore";

export type ModuleKey = "dashboard" | "questions" | "settings" | "page";

export interface RouteReference {
	type: ModuleKey;
	id: string | number | null;
}

export interface ModuleChild {
	key: string;
	label: string;
	title?: string;
	text?: string;
	description?: string;
	instruction?: string;
	personality?: string;
	value: RouteReference;
}

export interface ModuleDefinition {
	key: ModuleKey;
	title: string;
	color?: string;
	description?: string;
	page: boolean;
	dashboardColumn: number;
	routeModule: boolean;
	terminal?: boolean;
	showChildrenInSidebar?: boolean;
	isActive: () => boolean;
	getChildren: () => ModuleChild[];
}

export const modulePriorityRank: Partial<Record<ModuleKey, number>> = {};
export const moduleTerminalFlags: Partial<Record<ModuleKey, boolean>> = {};

export function isTerminalModule(_type: string | null | undefined): boolean {
	return false;
}

export function getHighestPriorityModule(_modules: RouteReference[]): RouteReference | null {
	return null;
}

export function isModuleActive(_key: ModuleKey, _moduleMask: number): boolean {
	return true;
}

export function moduleRegistry() {
	const modules = computed<ModuleDefinition[]>(() => [
		{
			key: "dashboard",
			title: "Dashboard",
			color: "#6B7280",
			description: "Übersicht über die verfügbaren Module im Template.",
			page: true,
			dashboardColumn: 0,
			routeModule: false,
			isActive: () => true,
			getChildren: () => []
		},
		{
			key: "questions",
			title: "Questions",
			color: "#14B8A6",
			description: "Pflege Bewertungsfragen mit Prompt, Reprompt und numerischer Skala.",
			page: true,
			dashboardColumn: 1,
			routeModule: false,
			isActive: () => true,
			getChildren: () =>
				Object.values(useAppStore().domain.questions.all() ?? {}).map((question: any) => ({
					key: question.id,
					value: { type: "questions", id: question.id },
					label: question.name?.trim() ? question.name : "Unbenannte Frage",
					title: question.name,
					text: question.prompt
				}))
		},
		{
			key: "settings",
			title: "Settings",
			color: "#64748B",
			description: "Globale Einstellungen und Setup-Metadaten.",
			page: true,
			dashboardColumn: 2,
			routeModule: false,
			isActive: () => true,
			getChildren: () => []
		}
	]);

	interface ModuleSelectOptions {
		keys?: ModuleKey[];
		page?: boolean;
		routeModule?: boolean;
		dashboardColumn?: number;
		activeCheck?: boolean;
	}

	const activeModules = computed(() => modules.value.filter(module => module.isActive()));

	function selectModules(options: ModuleSelectOptions = {}): ModuleDefinition[] {
		return modules.value.filter(module => {
			if (options.activeCheck && !module.isActive()) {
				return false;
			}
			if (options.page !== undefined && module.page !== options.page) {
				return false;
			}
			if (options.routeModule !== undefined && module.routeModule !== options.routeModule) {
				return false;
			}
			if (options.dashboardColumn !== undefined && module.dashboardColumn !== options.dashboardColumn) {
				return false;
			}
			if (options.keys && !options.keys.includes(module.key)) {
				return false;
			}
			return true;
		});
	}

	function findModuleChild(ref: RouteReference | null | undefined): ModuleChild | null {
		if (!ref) return null;

		for (const mod of modules.value) {
			const child = mod
				.getChildren()
				.find(c => c.value.type === ref.type && c.value.id === ref.id);
			if (child) return child;
		}

		return null;
	}

	return {
		activeModules,
		selectModules,
		findModuleChild
	};
}
