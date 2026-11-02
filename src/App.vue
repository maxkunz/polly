<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { usePrimeVue } from "primevue/config";
import { useAppStore } from "@/stores/appStore";
import ConfirmDialog from "primevue/confirmdialog";
import Button from "primevue/button";
import Card from "primevue/card";
import Toast from "primevue/toast";
import { RouterView, useRoute, useRouter } from "vue-router";

import AppSidebar from "@/components/layout/AppSidebar.vue";
import ControlToolbar from "@/components/layout/ControlToolbar.vue";
import { useControlBarStore } from "@/stores/controlBarStore";
import { isDevOnlyLocale, primevueLocaleFor, restoreStoredLocale, type SupportedLocale } from "@/i18n";
import { getErrorStatus } from "@/services/genesys/retry";

const app = useAppStore();
const route = useRoute();
const router = useRouter();
const controlBar = useControlBarStore();
const { t, locale } = useI18n();
const primevue = usePrimeVue();

type InitializationErrorType = "invalid-parameters" | "invalid-session" | "initialization-failed";

const initializationPending = ref(true);
const initializationError = ref<InitializationErrorType | null>(null);
const initializationErrorDetails = computed(() => {
	switch (initializationError.value) {
		case "invalid-parameters":
			return { title: t("app.initialization.parametersTitle"), message: t("app.initialization.parametersMessage") };
		case "invalid-session":
			return { title: t("app.initialization.sessionTitle"), message: t("app.initialization.sessionMessage") };
		default:
			return { title: t("app.initialization.failedTitle"), message: t("app.initialization.failedMessage") };
	}
});
const initializationCardDesignTokens = {
	root: { borderRadius: "12px", shadow: "0 12px 28px rgba(16, 24, 40, 0.08)" },
	body: { padding: "32px", gap: "0" },
	caption: { gap: "12px" },
	title: { fontSize: "1.5rem", fontWeight: "600" },
	subtitle: { color: "{text.muted.color}" }
};

function restartApplication(): void {
	const originalUrl = sessionStorage.getItem("polly.genesys.originalUrl");
	window.location.assign(originalUrl ?? window.location.href);
}

watch(
	locale,
	newLocale => {
		primevue.config.locale = primevueLocaleFor(newLocale as SupportedLocale);
	},
	{ immediate: true }
);

// Testsprache nur in der Dev-Ansicht: beim Ausschalten zur gespeicherten Sprache zurück
watch(
	() => app.devView,
	devView => {
		if (!devView && isDevOnlyLocale(locale.value)) restoreStoredLocale();
	}
);

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

// Rollen bei Bedarf auffrischen (nur wenn TTL abgelaufen, siehe appStore.refreshRoles)
function handleVisibilityChange(): void {
	if (document.visibilityState === "visible") {
		app.refreshRoles();
	}
}

watch(
	() => route.fullPath,
	() => {
		app.refreshRoles();
	}
);

onMounted(async () => {
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.app = app;
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("beforeunload", handleBeforeUnload);

  try {
    await app.initializeFromLocation();
    const launchQuery = Object.fromEntries(new URL(window.location.href).searchParams);
    if (!app.datatableId && route.name !== "setup" && route.name !== "uninstall") {
      await router.replace({ name: "setup", query: launchQuery });
      return;
    }

    if (app.datatableId && route.name === "setup") {
      await router.replace({ name: "dashboard", query: launchQuery });
    }
  } catch (error) {
    console.error("Initialization error:", error);
    if (error instanceof Error && error.name === "InvalidLaunchParametersError") {
      initializationError.value = "invalid-parameters";
    } else if (getErrorStatus(error) === 401 || (error instanceof Error &&
      /^\[(invalid_grant|invalid_token|login_required|interaction_required|access_denied)\]/i.test(error.message))) {
      // Das SDK verpackt OAuth-Fehler teilweise als Error ohne HTTP-Status.
      initializationError.value = "invalid-session";
    } else {
      initializationError.value = "initialization-failed";
    }
  } finally {
    initializationPending.value = false;
  }
});

onBeforeUnmount(() => {
	window.removeEventListener("keydown", handleKeydown);
	document.removeEventListener("visibilitychange", handleVisibilityChange);
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
	<div v-if="initializationPending || initializationError" class="initialization-page">
		<main class="initialization-container" :aria-busy="initializationPending">
			<img src="@/assets/logo-icon.png" alt="Polly" class="initialization-logo" />
			<Card :dt="initializationCardDesignTokens" class="initialization-card">
				<template #title>
					<div class="initialization-icon" :class="{ 'initialization-icon-loading': initializationPending }">
						<i :class="initializationPending ? 'pi pi-spinner pi-spin text-2xl' : 'pi pi-exclamation-circle text-2xl'" aria-hidden="true" />
					</div>
					<h1 class="m-0 font-inherit text-inherit" role="status">{{ initializationPending ? t("app.initialization.loading") : initializationErrorDetails.title }}</h1>
				</template>
				<template v-if="initializationError" #subtitle>
					<p class="m-0 leading-6">{{ initializationErrorDetails.message }}</p>
				</template>
				<template #content>
					<Button
						v-if="initializationError && initializationError !== 'invalid-parameters'"
						class="mt-6"
						:label="t('app.initialization.restart')"
						icon="pi pi-refresh"
						@click="restartApplication"
					/>
				</template>
			</Card>
		</main>
	</div>

	<div v-else-if="route.name === 'setup' || route.name === 'uninstall'" class="h-screen overflow-hidden">
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

	<ConfirmDialog />
	<ConfirmDialog group="global" />
	<Toast :baseZIndex="9999" position="top-right" :style="{ top: '5rem' }" />
</template>

<style scoped>
	.initialization-page {
		min-height: 100vh;
		background-image: var(--p-app-setup-background);
		background-attachment: fixed;
		background-position: center;
		background-size: cover;
	}

	.initialization-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 32px;
		min-height: 100vh;
		padding: 40px 20px;
	}

	.initialization-logo {
		width: 160px;
		max-width: 100%;
		height: auto;
	}

	.initialization-card {
		width: min(600px, 100%);
		border: 1px solid var(--p-content-border-color);
		text-align: center;
	}

	.initialization-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		margin: 0 auto 20px;
		border-radius: 9999px;
		background: var(--p-orange-50);
		color: var(--p-orange-700);
	}

	.initialization-icon-loading {
		background: var(--p-primary-50);
		color: var(--p-primary-600);
	}

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
