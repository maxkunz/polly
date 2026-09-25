<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

import Card from "primevue/card";
import Button from "primevue/button";
import Select from "primevue/select";

import PageHeader from "@/components/layout/PageHeader.vue";
import { useAppStore } from "@/stores/appStore";
import { moduleRegistry } from "@/app/modules";
import { usePageControlBar } from "@/app/usePageControlBar";
import { setLocale, type SupportedLocale } from "@/i18n";

const app = useAppStore();
const router = useRouter();
const { t, locale } = useI18n();
const { selectModules } = moduleRegistry();

const moduleMeta = computed(() => selectModules({ keys: ["settings"] })[0]);

usePageControlBar("settings", () => ({
	search: null,
	actions: []
}));

const languageOptions = computed(() => [
	{ label: t("language.de"), value: "de" as SupportedLocale },
	{ label: t("language.en"), value: "en" as SupportedLocale }
]);

const selectedLocale = computed<SupportedLocale>({
	get: () => locale.value as SupportedLocale,
	set: value => setLocale(value)
});

const setup = computed(() => app.domain.meta.setup ?? null);

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
			/>
		</div>

		<div class="max-w-5xl mx-auto space-y-4">
			<Card>
				<template #title>{{ t("language.title") }}</template>
				<template #content>
					<div class="max-w-xs">
						<label for="app-language-select" class="block text-sm font-medium mb-1">
							{{ t("language.label") }}
						</label>
						<Select
							id="app-language-select"
							v-model="selectedLocale"
							:options="languageOptions"
							optionLabel="label"
							optionValue="value"
							class="w-full"
						/>
					</div>
				</template>
			</Card>

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

						<div class="flex items-center justify-between gap-4">
							<div class="text-sm text-[var(--p-text-muted-color)]">
								{{ t("settings.setup.uninstallHint") }}
							</div>
							<Button
								:label="t('settings.setup.uninstall')"
								icon="pi pi-trash"
								severity="danger"
								@click="startUninstall"
							/>
						</div>
					</div>
				</template>
			</Card>
		</div>
	</section>
</template>
