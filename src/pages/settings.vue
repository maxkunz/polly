<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";

import Card from "primevue/card";
import Button from "primevue/button";

import PageHeader from "@/components/layout/PageHeader.vue";
import { useAppStore } from "@/stores/appStore";
import { moduleRegistry } from "@/app/modules";
import { usePageControlBar } from "@/app/usePageControlBar";

const app = useAppStore();
const router = useRouter();
const { selectModules } = moduleRegistry();

const moduleMeta = computed(() => selectModules({ keys: ["settings"] })[0]);

usePageControlBar("settings", () => ({
	search: null,
	actions: []
}));

const setup = computed(() => app.domain.meta.setup ?? null);

const setupRows = computed(() => {
	const currentSetup = setup.value;
	if (!currentSetup) return [];

	return [
		{ label: "Project Tag", value: currentSetup.projectTag ?? "—" },
		{ label: "Domain", value: currentSetup.domainName ?? "—" },
		{ label: "Launch URL", value: currentSetup.launchUrl ?? "—" },
		{ label: "Frontend OAuth", value: formatResource(currentSetup.oauthFrontend) },
		{ label: "App Integration", value: formatResource(currentSetup.integrationApp) },
		{ label: "Division", value: formatResource(currentSetup.division) },
		{ label: "Backend Group", value: formatResource(currentSetup.backendGroup) },
		{ label: "Backend Role", value: formatResource(currentSetup.backendRole) },
		{ label: "Backend Auth", value: formatBackendAuth(currentSetup.backendAuth) },
		{ label: "Backend Client", value: formatResource(currentSetup.backendClient) },
		{ label: "Data Table", value: formatResource(currentSetup.dataTable) },
		{ label: "Data Action Integration", value: formatResource(currentSetup.dataActionIntegration) },
		{ label: "Data Action", value: formatResource(currentSetup.dataAction) },
		{ label: "Installed At", value: currentSetup.installedAt ?? "—" }
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
				<template #title>Setup</template>
				<template #content>
					<div v-if="!setup" class="text-sm text-[var(--p-text-muted-color)]">
						No setup metadata available.
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
								Uninstall removes the resources stored in the setup metadata.
							</div>
							<Button
								label="Uninstall"
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
