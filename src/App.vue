<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from "vue";
import { useAppStore } from "@/stores/appStore";
import ConfirmDialog from "primevue/confirmdialog";
import Toast from "primevue/toast";
import { useToast } from "primevue/usetoast";
import { RouterView, useRoute, useRouter } from "vue-router";

import AppSidebar from "@/components/layout/AppSidebar.vue";
import ControlToolbar from "@/components/layout/ControlToolbar.vue";
import { useControlBarStore } from "@/stores/controlBarStore";

const app = useAppStore();
const toast = useToast();
const route = useRoute();
const router = useRouter();
const controlBar = useControlBarStore();

function handleKeydown(e: KeyboardEvent): void {
	const ctrlOrCmd = e.ctrlKey || e.metaKey;

	// Ctrl/Cmd + Shift + S → Control Panel toggeln
	if (ctrlOrCmd && e.shiftKey && e.code === "KeyS") {
		e.preventDefault();
		// TODO Something
	}

	// Ctrl/Cmd + Shift + D → DevView toggeln
	if (ctrlOrCmd && e.shiftKey && e.code === "KeyD") {
		e.preventDefault();
		app.devView = !app.devView;
	}

	// Escape → Control Panel schließen
	if (e.code === "Escape") {
		// TODO Something
	}
}

function handleBeforeUnload(e: BeforeUnloadEvent): void {
	if (!app.editMode) return;
	e.preventDefault();
	e.returnValue = "";
}

onMounted(async () => {
  window.app = app;
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("beforeunload", handleBeforeUnload);

  try {
    await app.initializeFromLocation();
    if (!app.datatableId && route.name !== "setup" && route.name !== "uninstall") {
      await router.replace({ name: "setup", query: route.query });
      return;
    }

    if (app.datatableId && route.name === "setup") {
      await router.replace({ name: "dashboard", query: route.query });
    }
  } catch (e: any) {
    console.error("Initialization error:", e);

    const detail =
      typeof e?.message === "string" && e.message.length
        ? e.message
        : "Initialisierung fehlgeschlagen.";

    toast.add({
      severity: "error",
      summary: "Error",
      detail,
      life: 5000
    });
  }
});

onBeforeUnmount(() => {
	window.removeEventListener("keydown", handleKeydown);
	window.removeEventListener("beforeunload", handleBeforeUnload);
});

watch(
	() => route.name,
	() => {
		controlBar.resetPageConfig();
	}
);
</script>

<template>
	<div v-if="route.name === 'setup' || route.name === 'uninstall'" class="h-screen overflow-hidden">
		<RouterView />
	</div>

	<div v-else class="h-screen flex overflow-hidden">
		<!-- Linke Sidebar -->
		<AppSidebar />

		<div class="flex-1 flex flex-col overflow-hidden main-stack">
			<main class="relative flex-1 overflow-y-auto app-main">
				<RouterView />
			</main>
			<!-- <div class="control-toolbar-wrapper pointer-events-auto">
				<ControlToolbar />
			</div> -->
		</div>
	</div>

	<ConfirmDialog group="global" />
	<Toast :baseZIndex="9999" position="top-right" :style="{ top: '5rem' }" />
</template>

<style scoped>
	/* MainLayout selbst hat keine speziellen Styles; alles steckt in den Sub-Komponenten. */
	.app-main {
		background: var(--p-app-main-background);
	}

	.main-stack {
		position: relative;
	}

	.control-toolbar-wrapper {
		position: absolute;
		top: 0;
		right: 0;
		z-index: 50;
		display: flex;
		justify-content: flex-end;
		padding: 0.75rem 1rem 0.25rem;
		width: fit-content;
	}
</style>
