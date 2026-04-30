import { defineStore } from "pinia";

export const useUiStore = defineStore("ui", {
	state: () => ({
		isSidebarCollapsed: false
	}),
	actions: {
		toggleSidebar(): void {
			this.isSidebarCollapsed = !this.isSidebarCollapsed;
		}
	}
});
