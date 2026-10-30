<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Card from "primevue/card";
import Checkbox from "primevue/checkbox";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Tag from "primevue/tag";
import Tooltip from "primevue/tooltip";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useAppStore } from "@/stores/appStore";
import { mcpErrorMessage, useMcpSettings } from "@/composables/useMcpSettings";

/**
 * Einstellungen → MCP-Schnittstelle: KI-Clients (Claude) bearbeiten, deployen und werten Umfragen im Namen einer
 * angemeldeten Person aus. Sichtbar nur mit Feature `mcp`; bedienen darf nur, wer Deployrechte hat (das Backend prüft
 * `polly_deploy` bei jedem Aufruf). Aktivieren legt den Genesys-Client an, Deaktivieren löscht ihn wieder.
 */

const app = useAppStore();
const { t } = useI18n();
const confirm = useConfirm();
const toast = useToast();
const vTooltip = Tooltip;
const { settings, loading, busy, loadError, load, enable, disable, setAllowComments } = useMcpSettings();

const canEdit = computed(() => app.canDeploy);
const editTooltip = computed(() => (canEdit.value ? undefined : t("permissions.missingDeploy")));
const urlInputId = "mcp_url_input";

// Der Status verlangt Deployrechte (GET prüft sie serverseitig), ohne sie bleibt die Karte ein Hinweis
onMounted(() => {
	if (canEdit.value) void load();
});

type Status = "active" | "inactive" | "serverOff" | "featureOff";
const status = computed<Status>(() => {
	const current = settings.value;
	if (!current) return "inactive";
	if (!current.serverEnabled) return "serverOff";
	if (!current.featureEnabled) return "featureOff";
	return current.enabled ? "active" : "inactive";
});
const statusSeverity = computed(() => (status.value === "active" ? "success" : status.value === "inactive" ? "secondary" : "warn"));
// Ein Server ohne Freigabe oder ohne Flag lässt sich nicht aktivieren; Deaktivieren geht immer
const canEnable = computed(() => status.value === "inactive");

async function toggleEnabled(): Promise<void> {
	try {
		await app.refreshRoles(true);
		if (!app.canDeploy) return;
		await enable();
		toast.add({ severity: "success", summary: t("mcp.toast.enabled"), life: 4000 });
	} catch (error) {
		toast.add({ severity: "error", summary: t("mcp.toast.enableFailed"), detail: mcpErrorMessage(error), life: 10000 });
		// Der Stand kann sich trotzdem geändert haben (z. B. aktiviert, aber Antwort verloren)
		void load();
	}
}

function askDisable(): void {
	confirm.require({
		header: t("mcp.disable.header"),
		message: t("mcp.disable.message", { count: settings.value?.sessionCount ?? 0 }),
		icon: "pi pi-exclamation-triangle",
		acceptLabel: t("mcp.disable.accept"),
		rejectLabel: t("mcp.disable.reject"),
		acceptClass: "p-button-danger",
		defaultFocus: "reject",
		accept: () => void doDisable()
	});
}

async function doDisable(): Promise<void> {
	try {
		await app.refreshRoles(true);
		if (!app.canDeploy) return;
		await disable();
		toast.add({ severity: "success", summary: t("mcp.toast.disabled"), life: 4000 });
	} catch (error) {
		toast.add({ severity: "error", summary: t("mcp.toast.disableFailed"), detail: mcpErrorMessage(error), life: 10000 });
		void load();
	}
}

async function toggleComments(value: boolean): Promise<void> {
	try {
		await setAllowComments(value);
		toast.add({ severity: "success", summary: t("mcp.toast.commentsSaved"), life: 3000 });
	} catch (error) {
		toast.add({ severity: "error", summary: t("mcp.toast.commentsFailed"), detail: mcpErrorMessage(error), life: 8000 });
		void load();
	}
}

async function copyUrl(): Promise<void> {
	if (!settings.value?.mcpUrl) return;
	try {
		await navigator.clipboard.writeText(settings.value.mcpUrl);
		toast.add({ severity: "success", summary: t("mcp.url.copied"), life: 2000 });
	} catch {
		// Zwischenablage nicht erlaubt: Die URL steht im Feld und lässt sich markieren
	}
}
</script>

<template>
	<Card>
		<template #title>
			<div class="flex flex-wrap items-center gap-2">
				<span>{{ t("mcp.title") }}</span>
				<Tag v-if="settings" :severity="statusSeverity" :value="t(`mcp.status.${status}`)" />
			</div>
		</template>
		<template #content>
			<div class="space-y-4">
				<p class="text-sm text-[var(--p-text-muted-color)]">{{ t("mcp.intro") }}</p>

				<Message v-if="!canEdit" severity="info" :closable="false">{{ t("permissions.missingDeploy") }}</Message>
				<Message v-else-if="loadError" severity="error" :closable="false">{{ loadError }}</Message>
				<p v-else-if="loading && !settings" class="text-sm text-[var(--p-text-muted-color)]">{{ t("mcp.loading") }}</p>

				<template v-if="canEdit && settings">
					<Message v-if="status === 'serverOff'" severity="warn" :closable="false">{{ t("mcp.status.serverOffHint") }}</Message>
					<Message v-else-if="status === 'featureOff'" severity="warn" :closable="false">{{ t("mcp.status.featureOffHint") }}</Message>

					<div class="flex flex-wrap items-center gap-2">
						<span v-tooltip.top="editTooltip">
							<Button
								v-if="!settings.enabled"
								icon="pi pi-power-off"
								:label="t('mcp.actions.enable')"
								:loading="busy"
								:disabled="!canEdit || !canEnable || busy"
								@click="toggleEnabled"
							/>
							<Button
								v-else
								icon="pi pi-ban"
								severity="danger"
								:label="t('mcp.actions.disable')"
								:loading="busy"
								:disabled="!canEdit || busy"
								@click="askDisable"
							/>
						</span>
						<span v-if="settings.enabled" class="text-sm text-[var(--p-text-muted-color)]">
							{{ t("mcp.sessions", { count: settings.sessionCount }) }}
						</span>
					</div>
					<p v-if="!settings.enabled && canEnable" class="text-xs text-[var(--p-text-muted-color)]">{{ t("mcp.actions.enableHint") }}</p>

					<div v-if="settings.enabled" class="space-y-4">
						<div class="space-y-1">
							<label :for="urlInputId" class="block text-sm font-medium">{{ t("mcp.url.label") }}</label>
							<div class="flex flex-wrap items-start gap-2">
								<InputText :id="urlInputId" :modelValue="settings.mcpUrl" readonly class="flex-1 min-w-64" />
								<Button icon="pi pi-copy" severity="secondary" :label="t('mcp.url.copy')" @click="copyUrl" />
							</div>
						</div>

						<div class="flex items-start gap-2">
							<Checkbox
								inputId="mcp_allow_comments"
								binary
								:modelValue="settings.allowComments"
								:disabled="!canEdit || busy"
								@update:modelValue="toggleComments"
							/>
							<label for="mcp_allow_comments" class="text-sm">
								<span class="font-medium">{{ t("mcp.comments.label") }}</span>
								<span class="block text-xs text-[var(--p-text-muted-color)]">{{ t("mcp.comments.hint") }}</span>
							</label>
						</div>

						<div class="space-y-1">
							<h3 class="text-sm font-medium">{{ t("mcp.guide.title") }}</h3>
							<ol class="list-decimal pl-5 text-sm space-y-1">
								<li>{{ t("mcp.guide.step1") }}</li>
								<li>{{ t("mcp.guide.step2") }}</li>
								<li>{{ t("mcp.guide.step3") }}</li>
								<li>{{ t("mcp.guide.step4") }}</li>
							</ol>
							<p class="text-xs text-[var(--p-text-muted-color)]">{{ t("mcp.guide.claudeCode", { url: settings.mcpUrl }) }}</p>
							<p class="text-xs text-[var(--p-text-muted-color)]">{{ t("mcp.guide.roles") }}</p>
						</div>
					</div>
				</template>
			</div>
		</template>
	</Card>
</template>
