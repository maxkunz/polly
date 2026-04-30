// src/app/usePageControlBar.ts
import { watch, onMounted } from "vue";
import { useRoute } from "vue-router";

import { useControlBarStore } from "@/stores/controlBarStore";
import type { ControlBarPageConfig } from "@/stores/controlBarStore";

export function usePageControlBar(
	pageKey: string,
	getConfig: () => ControlBarPageConfig,
	deps: Array<() => unknown> = []
): void {
	const route = useRoute();
	const controlBar = useControlBarStore();

	function applyIfActive(): void {
		if (route.name !== pageKey) {
			return;
		}
		controlBar.applyPageConfig(getConfig());
	}

	onMounted(() => {
		applyIfActive();
	});

	watch(
		() => route.name,
		() => applyIfActive()
	);

	// Re-apply when explicit dependencies change
	if (deps.length) {
		watch(deps, () => applyIfActive(), { deep: false });
	}
}