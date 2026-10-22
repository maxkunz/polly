<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Card from "primevue/card";
import Tag from "primevue/tag";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useAppStore } from "@/stores/appStore";
import { currentLocaleTag } from "@/i18n";
import { useWebThemes, webThemeErrorMessage } from "@/composables/useWebThemes";
import { PollyApiError } from "@/services/pollyApi";
import {
	WEB_THEME_MAX_PER_TENANT,
	WEB_THEME_NAME_MAX_CHARS,
	defaultWebThemeTokens,
	type WebTheme
} from "@/domain/webTheme/webTheme";
import WebThemeEditor, { type WebThemeDraft } from "./WebThemeEditor.vue";

/**
 * Einstellungen → Web-Designs: Designs der öffentlichen Umfrageseite pflegen. Lesen darf jeder App-Nutzer,
 * Anlegen/Ändern/Löschen erfordert `polly_deploy` (die Lambda prüft das serverseitig).
 */

const app = useAppStore();
const { t } = useI18n();
const confirm = useConfirm();
const toast = useToast();
const { themes, loading, loadError, load, save, remove, findSurveysUsingTheme } = useWebThemes();

const editing = ref<WebThemeDraft | null>(null);
/** `updatedAt` des Stands, auf dem der Editor aufsetzt (optimistisches Sperren); `null` = neues Design. */
const editingBase = ref<string | null>(null);
const saving = ref(false);
const busyId = ref<string | null>(null);

const canEdit = computed(() => app.canDeploy);
const limitReached = computed(() => themes.value.length >= WEB_THEME_MAX_PER_TENANT);
const editTooltip = computed(() => (canEdit.value ? undefined : t("permissions.missingDeploy")));

onMounted(() => void load(true));

function formatUpdated(theme: WebTheme): string {
	if (!theme.updatedAt) return "";
	const date = new Date(theme.updatedAt);
	if (Number.isNaN(date.getTime())) return "";
	const when = date.toLocaleString(currentLocaleTag(), { dateStyle: "short", timeStyle: "short" });
	return theme.updatedBy ? t("webThemes.list.updatedBy", { date: when, user: theme.updatedBy }) : t("webThemes.list.updated", { date: when });
}

function startCreate(): void {
	editingBase.value = null;
	editing.value = {
		id: crypto.randomUUID(),
		name: t("webThemes.list.newName"),
		isDefault: themes.value.length === 0,
		tokens: defaultWebThemeTokens()
	};
}

function startEdit(theme: WebTheme): void {
	editingBase.value = theme.updatedAt || null;
	editing.value = { id: theme.id, name: theme.name, isDefault: theme.isDefault, tokens: theme.tokens };
}

function startDuplicate(theme: WebTheme): void {
	editingBase.value = null;
	editing.value = {
		id: crypto.randomUUID(),
		name: t("webThemes.list.copyName", { name: theme.name }).slice(0, WEB_THEME_NAME_MAX_CHARS),
		isDefault: false,
		tokens: JSON.parse(JSON.stringify(theme.tokens))
	};
}

async function onSave(value: WebThemeDraft): Promise<void> {
	saving.value = true;
	try {
		await app.refreshRoles();
		await save(value.id, {
			name: value.name,
			isDefault: value.isDefault,
			tokens: value.tokens,
			expectedUpdatedAt: editingBase.value
		});
		toast.add({ severity: "success", summary: t("webThemes.toast.saved", { name: value.name }), life: 4000 });
		editing.value = null;
	} catch (error) {
		toast.add({ severity: "error", summary: t("webThemes.toast.saveFailed"), detail: webThemeErrorMessage(error), life: 10000 });
		if (error instanceof PollyApiError && error.code === "conflict") {
			// Eingaben bleiben im Editor; ab jetzt gilt der aktuelle Stand. Erneutes Speichern überschreibt ihn
			// bewusst bzw. legt ein zwischenzeitlich gelöschtes Design neu an.
			await load(true);
			editingBase.value = themes.value.find(theme => theme.id === value.id)?.updatedAt || null;
		}
	} finally {
		saving.value = false;
	}
}

async function confirmDelete(theme: WebTheme): Promise<void> {
	busyId.value = theme.id;
	let usedBy: string[] | null = null;
	try {
		usedBy = await findSurveysUsingTheme(theme.id);
	} catch (error) {
		// Ohne Liste trotzdem löschen lassen; der Hinweis bleibt dann allgemein
		console.warn("Could not check surveys using the theme.", error);
	} finally {
		busyId.value = null;
	}

	const usage = usedBy === null
		? t("webThemes.delete.usageUnknown")
		: usedBy.length > 0
			? t("webThemes.delete.usedBy", { surveys: usedBy.join(", ") })
			: t("webThemes.delete.unused");

	confirm.require({
		header: t("webThemes.delete.header"),
		message: `${t("webThemes.delete.message", { name: theme.name })} ${usage}`,
		icon: "pi pi-exclamation-triangle",
		acceptLabel: t("webThemes.delete.accept"),
		rejectLabel: t("webThemes.delete.reject"),
		acceptClass: "p-button-danger",
		defaultFocus: "reject",
		accept: () => void doDelete(theme)
	});
}

async function doDelete(theme: WebTheme): Promise<void> {
	busyId.value = theme.id;
	try {
		await app.refreshRoles();
		await remove(theme.id);
		toast.add({ severity: "success", summary: t("webThemes.toast.deleted", { name: theme.name }), life: 4000 });
	} catch (error) {
		toast.add({ severity: "error", summary: t("webThemes.toast.deleteFailed"), detail: webThemeErrorMessage(error), life: 10000 });
	} finally {
		busyId.value = null;
	}
}
</script>

<template>
	<Card>
		<template #title>{{ t("webThemes.title") }}</template>
		<template #content>
			<WebThemeEditor
				v-if="editing"
				:key="editing.id"
				:theme="editing"
				:readonly="!canEdit"
				:saving="saving"
				@save="onSave"
				@cancel="editing = null"
			/>

			<div v-else class="space-y-4">
				<p class="text-sm text-[var(--p-text-muted-color)]">{{ t("webThemes.intro") }}</p>

				<p v-if="loadError" class="text-sm text-red-700" role="alert">{{ loadError }}</p>
				<p v-else-if="loading && themes.length === 0" class="text-sm text-[var(--p-text-muted-color)]">{{ t("webThemes.list.loading") }}</p>
				<p v-else-if="themes.length === 0" class="text-sm text-[var(--p-text-muted-color)]">{{ t("webThemes.list.empty") }}</p>

				<ul v-else class="divide-y divide-[var(--p-content-border-color)] rounded-xl border border-[var(--p-content-border-color)]">
					<li v-for="theme in themes" :key="theme.id" class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<span class="font-medium break-all">{{ theme.name }}</span>
								<Tag v-if="theme.isDefault" :value="t('webThemes.list.default')" severity="info" />
							</div>
							<div class="text-xs text-[var(--p-text-muted-color)]">{{ formatUpdated(theme) }}</div>
						</div>
						<div class="flex items-center gap-1">
							<Button
								:label="canEdit ? t('webThemes.list.edit') : t('webThemes.list.view')"
								:icon="canEdit ? 'pi pi-pencil' : 'pi pi-eye'"
								text
								size="small"
								@click="startEdit(theme)"
							/>
							<span v-tooltip.top="editTooltip ?? (limitReached ? t('webThemes.list.limit', { max: WEB_THEME_MAX_PER_TENANT }) : undefined)">
								<Button
									:label="t('webThemes.list.duplicate')"
									icon="pi pi-copy"
									text
									size="small"
									severity="secondary"
									:disabled="!canEdit || limitReached"
									@click="startDuplicate(theme)"
								/>
							</span>
							<span v-tooltip.top="editTooltip">
								<Button
									:label="t('webThemes.list.delete')"
									icon="pi pi-trash"
									text
									size="small"
									severity="danger"
									:loading="busyId === theme.id"
									:disabled="!canEdit || busyId !== null"
									@click="confirmDelete(theme)"
								/>
							</span>
						</div>
					</li>
				</ul>

				<div class="flex justify-end">
					<span v-tooltip.top="editTooltip ?? (limitReached ? t('webThemes.list.limit', { max: WEB_THEME_MAX_PER_TENANT }) : undefined)">
						<Button
							:label="t('webThemes.list.create')"
							icon="pi pi-plus"
							:disabled="!canEdit || limitReached || loading"
							@click="startCreate"
						/>
					</span>
				</div>
			</div>
		</template>
	</Card>
</template>
