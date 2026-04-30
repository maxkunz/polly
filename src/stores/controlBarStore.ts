// src/stores/controlBarStore.ts
import { defineStore } from "pinia";
import type { ComputedRef, Ref } from "vue";

export type ControlBarSeverity =
	| "primary"
	| "secondary"
	| "success"
	| "info"
	| "warning"
	| "help"
	| "danger"
	| "contrast";

export type ControlBarVariant = "solid" | "text";

export interface ControlBarAction {
	id: string;
	label?: string;
	iconKey?: string;
	severity?: ControlBarSeverity;
	variant?: ControlBarVariant;
	size?: "small" | "large";
	rounded?: boolean;
	hidden?: boolean | (() => boolean);
	disabled?: boolean | (() => boolean);
	handler?: () => void;
}

export interface ControlBarPageSearch {
	enabled: boolean;
	disabled?: boolean;
	placeholder?: string;
	query: string;
}

export interface ControlBarSelectOption {
	label: string;
	value: string;
	disabled?: boolean;
}

export interface ControlBarSelect {
	id: string;
	label?: string;
	options: ControlBarSelectOption[];
	placeholder?: string;
	disabled?: boolean | (() => boolean);
	value: () => string;
	onChange: (value: string) => void;
}

export interface ControlBarPageConfig {
	search: ControlBarPageSearch | null;
	actions: ControlBarAction[];
	selects?: ControlBarSelect[];
}

export const useControlBarStore = defineStore("controlBar", {
	state: (): { pageConfig: ControlBarPageConfig } => ({
		pageConfig: {
			search: null,
			actions: [] as ControlBarAction[],
			selects: [] as ControlBarSelect[]
		}
	}),

	getters: {
		pageSearch(state): ControlBarPageSearch | null {
			return state.pageConfig.search;
		},
		pageActions(state): ControlBarAction[] {
			return state.pageConfig.actions;
		},
		pageSelects(state): ControlBarSelect[] {
			return state.pageConfig.selects ?? [];
		}
	},

	actions: {
		applyPageConfig(config: ControlBarPageConfig): void {
			this.pageConfig = {
				search: config.search
					? {
							enabled: config.search.enabled,
							disabled: config.search.disabled ?? false,
							placeholder: config.search.placeholder,
							query: config.search.query ?? ""
					}
					: null,
				actions: [...(config.actions ?? [])]
			} satisfies ControlBarPageConfig;
			this.pageConfig.selects = [...(config.selects ?? [])];
		},
		resetPageConfig(): void {
			this.pageConfig = {
				search: null,
				actions: [],
				selects: []
			};
		},

		setPageSearchQuery(query: string): void {
			if (!this.pageConfig.search) {
				return;
			}
			this.pageConfig.search.query = query;
		}
	}
});
