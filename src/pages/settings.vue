<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

import Card from "primevue/card";
import Button from "primevue/button";
import Select from "primevue/select";
import { useToast } from "primevue/usetoast";

import PageHeader from "@/components/layout/PageHeader.vue";
import WebThemesCard from "@/components/webTheme/WebThemesCard.vue";
import WebDefaultBaseUrlCard from "@/components/webSettings/WebDefaultBaseUrlCard.vue";
import McpSettingsCard from "@/components/mcp/McpSettingsCard.vue";
import { useAppStore } from "@/stores/appStore";
import { moduleRegistry } from "@/app/modules";
import { usePageControlBar } from "@/app/usePageControlBar";
import { setLocale, isDevOnlyLocale, SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n";
import { startBotFlowUpdate, startInboundFlowUpdate } from "@/services/SetupExportFlow";
import { updateInstalledBotFlow } from "@/services/SetupUpdate";
import { getErrorMessage } from "@/services/genesys/retry";
import { enabledFeatures } from "@/domain/features/featureFlags";

const app = useAppStore();
const router = useRouter();
const toast = useToast();
const { t, locale } = useI18n();
const { selectModules } = moduleRegistry();

const moduleMeta = computed(() => selectModules({ keys: ["settings"] })[0]);

usePageControlBar("settings", () => ({
	search: null,
	actions: []
}));

// Testsprachen (Klingonisch, Latein) nur in der Dev-Ansicht anbieten
const languageOptions = computed(() =>
	SUPPORTED_LOCALES.filter(value => app.devView || !isDevOnlyLocale(value)).map(value => ({
		label: t(`language.${value}`),
		value
	}))
);

const selectedLocale = computed<SupportedLocale>({
	get: () => locale.value as SupportedLocale,
	set: value => setLocale(value)
});

const setup = computed(() => app.domain.meta.setup ?? null);
// Nur aktive Flags anzeigen; geändert werden sie nur direkt in der Data Table (__meta)
const activeFeatures = computed(() => enabledFeatures(app.domain.meta.features));
const isExporting = ref(false);
const isUpdating = ref(false);

async function updateBotFlow() {
	if (isUpdating.value || isExporting.value) return;
	isUpdating.value = true;
	try {
		await updateInstalledBotFlow();
		toast.add({
			severity: "success",
			summary: t("settings.setup.updateSuccess"),
			detail: t("settings.setup.updateSuccessDetail"),
			life: 5000
		});
	} catch (error) {
		toast.add({
			severity: "error",
			summary: t("settings.setup.updateFailed"),
			detail: getErrorMessage(error),
			life: 10000
		});
	} finally {
		isUpdating.value = false;
	}
}

async function exportTemplateConfig() {
	if (!app.devView || isExporting.value || isUpdating.value) return;
	isExporting.value = true;
	try {
		const currentSetup = setup.value;
		if (!currentSetup?.botFlow?.id || !currentSetup.botFlow.name || !currentSetup.inboundFlow?.id || !currentSetup.inboundFlow.name) {
			throw new Error(t("settings.setup.exportMissing"));
		}
		await startBotFlowUpdate(currentSetup.botFlow.id, currentSetup.botFlow.name);
		await startInboundFlowUpdate(currentSetup.inboundFlow.id, currentSetup.inboundFlow.name);
		toast.add({
			severity: "success",
			summary: t("settings.setup.exportTemplates"),
			detail: t("settings.setup.exportSuccess"),
			life: 5000
		});
	} catch (error) {
		console.error("Flow-Export fehlgeschlagen:", error);
		toast.add({
			severity: "error",
			summary: t("settings.setup.exportFailed"),
			detail: getErrorMessage(error),
			life: 10000
		});
	} finally {
		isExporting.value = false;
	}
}

const setupRows = computed(() => {
	const currentSetup = setup.value;
	if (!currentSetup) return [];

	return [
		{ label: t("settings.setup.fields.projectTag"), value: currentSetup.projectTag ?? "—" },
		{ label: t("settings.setup.fields.domain"), value: currentSetup.domainName ?? "—" },
		{ label: t("settings.setup.fields.launchUrl"), value: currentSetup.launchUrl ?? "—" },
		{ label: t("settings.setup.fields.oauthFrontend"), value: formatResource(currentSetup.oauthFrontend) },
		{ label: t("settings.setup.fields.integrationApp"), value: formatResource(currentSetup.integrationApp) },
		{ label: t("settings.setup.fields.division"), value: formatResource(currentSetup.division) },
		{ label: t("settings.setup.fields.backendGroup"), value: formatResource(currentSetup.backendGroup) },
		{ label: t("settings.setup.fields.backendRole"), value: formatResource(currentSetup.backendRole) },
		{ label: t("settings.setup.fields.backendAuth"), value: formatBackendAuth(currentSetup.backendAuth) },
		{ label: t("settings.setup.fields.backendClient"), value: formatResource(currentSetup.backendClient) },
		{ label: t("settings.setup.fields.dataTable"), value: formatResource(currentSetup.dataTable) },
		{ label: t("settings.setup.fields.mappingDataTable"), value: formatResource(currentSetup.mappingDataTable) },
		{ label: t("settings.setup.fields.dataActionIntegration"), value: formatResource(currentSetup.dataActionIntegration) },
		{ label: t("settings.setup.fields.dataAction"), value: formatResource(currentSetup.dataAction) },
		{ label: t("settings.setup.fields.installedAt"), value: currentSetup.installedAt ?? "—" }
	];
});

function formatResource(resource: any): string {
	if (!resource || typeof resource !== "object") return "—";
	if (resource.name && resource.id) return `${resource.name} (${resource.id})`;
	if (resource.id) return String(resource.id);
	return JSON.stringify(resource);
}

function formatBackendAuth(resource: any): string {
	if (!resource || typeof resource !== "object") return "—";
	if (resource.clientId && resource.tokenUrl) {
		return `${resource.clientId} | ${resource.tokenUrl}`;
	}
	if (resource.clientId) return String(resource.clientId);
	return JSON.stringify(resource);
}

function startUninstall() {
	if (isUpdating.value || isExporting.value) return;
	router.push({ name: "uninstall", query: router.currentRoute.value.query });
}
</script>

<template>
	<section class="p-4">
		<div class="mb-8">
			<PageHeader
				v-if="moduleMeta"
				:title="moduleMeta.title"
				:iconKey="moduleMeta.key"
				:color="moduleMeta.color"
				titleTag="h1"
			/>
		</div>

		<div class="max-w-5xl mx-auto space-y-4">
			<Card>
				<template #title>{{ t("language.title") }}</template>
				<template #content>
					<div class="max-w-xs">
						<!-- Kein <label for>: Select rendert kein Formularelement, Verknüpfung über aria-labelledby -->
						<div id="app-language-select-label" class="block text-sm font-medium mb-1">
							{{ t("language.label") }}
						</div>
						<Select
							id="app-language-select"
							ariaLabelledby="app-language-select-label"
							v-model="selectedLocale"
							:options="languageOptions"
							optionLabel="label"
							optionValue="value"
							class="w-full"
						/>
					</div>
				</template>
			</Card>

			<WebDefaultBaseUrlCard v-if="setup && app.webSurveyEnabled" />

			<WebThemesCard v-if="setup && app.webSurveyEnabled" />

			<McpSettingsCard v-if="setup && app.hasFeature('mcp')" />

			<Card>
				<template #title>{{ t("settings.setup.title") }}</template>
				<template #content>
					<div v-if="!setup" class="text-sm text-[var(--p-text-muted-color)]">
						{{ t("settings.setup.empty") }}
					</div>

					<div v-else class="space-y-4">
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div
								v-for="row in setupRows"
								:key="row.label"
								class="rounded-xl border border-[var(--p-content-border-color)] bg-[var(--p-surface-0)] px-4 py-3"
							>
								<div class="text-xs uppercase tracking-wide text-[var(--p-text-muted-color)] mb-1">
									{{ row.label }}
								</div>
								<div class="text-sm break-all">{{ row.value }}</div>
							</div>
						</div>

						<div v-if="activeFeatures.length">
							<div class="text-xs uppercase tracking-wide text-[var(--p-text-muted-color)] mb-2">
								{{ t("settings.features.title") }}
							</div>
							<ul class="space-y-2">
								<li
									v-for="key in activeFeatures"
									:key="key"
									class="flex items-start gap-2 text-sm"
								>
									<i class="pi pi-check-circle text-green-600 mt-0.5" aria-hidden="true" />
									<div>
										<div class="font-medium">{{ t(`features.${key}.label`) }}</div>
										<div class="text-[var(--p-text-muted-color)]">{{ t(`features.${key}.description`) }}</div>
									</div>
								</li>
							</ul>
						</div>

						<div v-if="app.devView" class="flex flex-wrap items-center justify-between gap-4">
							<div class="space-y-1 text-sm text-[var(--p-text-muted-color)]">
								<p>{{ t("settings.setup.updateHint") }}</p>
								<p>{{ t("settings.setup.uninstallHint") }}</p>
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<Button
									:label="t('settings.setup.exportTemplates')"
									icon="pi pi-download"
									severity="secondary"
									text
									size="small"
									:loading="isExporting"
									:disabled="isExporting || isUpdating"
									@click="exportTemplateConfig"
								/>
								<Button
									:label="t('settings.setup.update')"
									icon="pi pi-refresh"
									:loading="isUpdating"
									:disabled="isUpdating || isExporting || !setup.botFlow?.id"
									@click="updateBotFlow"
								/>
								<Button
									:label="t('settings.setup.uninstall')"
									icon="pi pi-trash"
									severity="danger"
									:disabled="isUpdating || isExporting"
									@click="startUninstall"
								/>
							</div>
						</div>
					</div>
				</template>
			</Card>
		</div>
	</section>
</template>
