<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Card from "primevue/card";
import InputText from "primevue/inputtext";
import Tooltip from "primevue/tooltip";
import { useToast } from "primevue/usetoast";
import { useAppStore } from "@/stores/appStore";
import { BASE_URL_TOKEN_PLACEHOLDER } from "@/constants/surveyConstants";
import { BASE_URL_MAX_CHARS, baseUrlError } from "@/domain/survey/invitationLinks";
import { saveWebDefaultBaseUrl } from "@/services/metaSettingsService";
import { getErrorMessage } from "@/services/genesys/retry";

/**
 * Einstellungen → Standard-Basis-URL der Web-Umfragen: gilt für Umfragen ohne eigene Basis-URL.
 * Gespeichert in `__meta.web.defaultBaseUrl`; ändern darf, wer Deployrechte hat (Bedienschutz wie bei den Designs).
 */

const app = useAppStore();
const { t } = useI18n();
const toast = useToast();
const vTooltip = Tooltip;

const tokenPlaceholder = BASE_URL_TOKEN_PLACEHOLDER;
const inputId = "web_default_base_url_input";
const value = ref(app.domain.meta.web.defaultBaseUrl);
const saving = ref(false);

// Neu geladenen Wert nur übernehmen, wenn keine ungespeicherte Eingabe überschrieben wird
watch(
	() => app.domain.meta.web.defaultBaseUrl,
	(next, previous) => {
		if (value.value.trim() === previous) value.value = next;
	}
);

const canEdit = computed(() => app.canDeploy);
const trimmed = computed(() => value.value.trim());
const dirty = computed(() => trimmed.value !== app.domain.meta.web.defaultBaseUrl);
const errorKey = computed(() => baseUrlError(trimmed.value));
const errorText = computed(() => (errorKey.value ? t(`validation.${errorKey.value}`, { placeholder: tokenPlaceholder, max: BASE_URL_MAX_CHARS }) : ""));

async function save(): Promise<void> {
	if (!canEdit.value || !dirty.value || errorKey.value || saving.value) return;
	saving.value = true;
	try {
		const meta = await saveWebDefaultBaseUrl(await app.ensureDataTableId(), trimmed.value);
		app.domain.meta.web = meta.web;
		toast.add({ severity: "success", summary: t("settings.webDefaults.saved"), life: 3000 });
	} catch (error) {
		toast.add({ severity: "error", summary: t("settings.webDefaults.saveFailed"), detail: getErrorMessage(error), life: 6000 });
	} finally {
		saving.value = false;
	}
}
</script>

<template>
	<Card>
		<template #title>{{ t("settings.webDefaults.title") }}</template>
		<template #content>
			<div class="space-y-2">
				<label :for="inputId" class="block text-sm font-medium">{{ t("settings.webDefaults.label") }}</label>
				<div class="flex flex-wrap items-start gap-2">
					<InputText
						:id="inputId"
						v-model="value"
						type="url"
						class="flex-1 min-w-64"
						:placeholder="t('surveyEditor.meta.placeholders.baseUrl', { placeholder: tokenPlaceholder })"
						:disabled="!canEdit || saving"
						:invalid="!!errorKey"
						:aria-describedby="`${inputId}_hint`"
						@keydown.enter="save"
					/>
					<span v-tooltip.top="canEdit ? undefined : t('permissions.missingDeploy')">
						<Button
							icon="pi pi-save"
							:label="t('settings.webDefaults.save')"
							:disabled="!canEdit || !dirty || !!errorKey"
							:loading="saving"
							@click="save"
						/>
					</span>
				</div>
				<p :id="`${inputId}_hint`" class="text-xs text-[var(--p-text-muted-color)]">
					{{ t("settings.webDefaults.hint", { placeholder: tokenPlaceholder }) }}
				</p>
				<p v-if="errorText" class="text-xs text-red-600" role="alert">{{ errorText }}</p>
			</div>
		</template>
	</Card>
</template>
