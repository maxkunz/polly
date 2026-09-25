import { computed } from "vue";
import { i18n } from "@/i18n";
import { useAppStore } from "@/stores/appStore";

export type ModuleKey = "dashboard" | "questions" | "surveys" | "settings" | "page";
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
	const { t } = i18n.global;

	const modules = computed<ModuleDefinition[]>(() => [
		{
			key: "dashboard",
			title: t("modules.dashboard.title"),
			color: "#6B7280",
			description: t("modules.dashboard.description"),
			page: true,
			dashboardColumn: 0,
			routeModule: false,
			isActive: () => true,
			getChildren: () => []
		},
		{
			key: "questions",
			title: t("modules.questions.title"),
			color: "#14B8A6",
			description: t("modules.questions.description"),
			page: true,
			dashboardColumn: 1,
			routeModule: false,
			isActive: () => false,
			getChildren: () =>
				Object.values(useAppStore().domain.questions.all() ?? {}).map((question: any) => ({
					key: question.id,
					value: { type: "questions", id: question.id },
					label: question.name?.trim() ? question.name : t("modules.questions.unnamedQuestion"),
					title: question.name,
					text: question.prompt
				}))
		},
		{
			key: "surveys",
			title: t("modules.surveys.title"),
			color: "#2563EB",
			description: t("modules.surveys.description"),
			page: true,
			dashboardColumn: 3,
			routeModule: false,
			isActive: () => true,
			getChildren: () =>
				(useAppStore().surveys ?? []).map((survey: any, index: number) => {
					const surveyId = String(survey.id ?? survey.key ?? index);
					const label = survey.title?.trim() ? survey.title : (survey.name?.trim() ? survey.name : (survey.Name?.trim() ? survey.Name : t("modules.surveys.unnamedSurvey", { index: index + 1 })));
					return {
						key: surveyId,
						value: { type: "surveys", id: surveyId },
						label,
						title: label
					};
				})
		},
		{
			key: "settings",
			title: t("modules.settings.title"),
			color: "#64748B",
			description: t("modules.settings.description"),
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
