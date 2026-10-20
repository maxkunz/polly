<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import ColorPicker from "primevue/colorpicker";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import {
	DEFAULT_WEB_THEME_TOKENS,
	FONT_STACKS,
	WEB_TEXT_LINE_HEIGHT_MAX,
	WEB_TEXT_LINE_HEIGHT_MIN,
	WEB_TEXT_ROLES,
	WEB_TEXT_SIZE_LIMITS,
	WEB_TEXT_WEIGHTS,
	WEB_THEME_COLOR_KEYS,
	WEB_THEME_FONTS,
	WEB_THEME_NAME_MAX_CHARS,
	WEB_THEME_PREVIEW_HIGHLIGHT,
	WEB_THEME_PREVIEW_READY,
	WEB_THEME_PREVIEW_THEME,
	checkThemeContrast,
	defaultWebThemeTokens,
	sanitizeWebThemeTokens,
	type WebTextRole,
	type WebThemeColorKey,
	type WebThemeTokens
} from "@/domain/webTheme/webTheme";
import { SURVEY_LANGUAGES, DEFAULT_SURVEY_LANGUAGE, type SurveyLanguage } from "@/domain/survey/flowTypes";
import { currentLocaleTag } from "@/i18n";

/**
 * Editor eines Web-Designs mit Live-Vorschau (Einstellungen → Web-Designs). Die Vorschau ist die echte
 * Umfrageseite im iframe (`survey.html?preview=1`, gleicher Origin) mit fester Beispielumfrage; Design
 * und Hervorhebung gehen per postMessage hinüber (Protokoll in `domain/webTheme/webTheme.ts`).
 * Kontrastwarnungen sperren das Speichern nicht.
 */

export interface WebThemeDraft {
	id: string;
	name: string;
	isDefault: boolean;
	tokens: WebThemeTokens;
}

const props = withDefaults(
	defineProps<{
		theme: WebThemeDraft;
		readonly?: boolean;
		saving?: boolean;
	}>(),
	{ readonly: false, saving: false }
);

const emit = defineEmits<{
	(e: "save", value: WebThemeDraft): void;
	(e: "cancel"): void;
}>();

const { t, locale } = useI18n();

const draft = reactive<WebThemeDraft>({
	id: props.theme.id,
	name: props.theme.name,
	isDefault: props.theme.isDefault,
	tokens: JSON.parse(JSON.stringify(props.theme.tokens)) as WebThemeTokens
});

const idPrefix = `web_theme_${props.theme.id.slice(0, 8)}`;

const fontOptions = computed(() =>
	WEB_THEME_FONTS.map(value => ({ value, label: t(`webThemes.fonts.${value}`), stack: FONT_STACKS[value] }))
);
const weightOptions = computed(() =>
	WEB_TEXT_WEIGHTS.map(value => ({ value, label: t(`webThemes.weights.w${value}`) }))
);

const sanitized = computed(() => sanitizeWebThemeTokens(draft.tokens));
const trimmedName = computed(() => draft.name.trim());
const nameValid = computed(() => trimmedName.value.length > 0 && trimmedName.value.length <= WEB_THEME_NAME_MAX_CHARS);
const canSave = computed(() => !props.readonly && !props.saving && nameValid.value && sanitized.value !== null);

// ---------------------------------------------------------------------------
// Textstile
// ---------------------------------------------------------------------------

function resetRole(role: WebTextRole): void {
	draft.tokens.text[role] = { ...DEFAULT_WEB_THEME_TOKENS.text[role] };
}

function resetAllRoles(): void {
	draft.tokens.text = defaultWebThemeTokens().text;
}

function isRoleDefault(role: WebTextRole): boolean {
	const current = draft.tokens.text[role];
	const fallback = DEFAULT_WEB_THEME_TOKENS.text[role];
	return current.size === fallback.size && current.weight === fallback.weight && current.lineHeight === fallback.lineHeight;
}

// ---------------------------------------------------------------------------
// Farben
// ---------------------------------------------------------------------------

/** Eingabe im Hex-Feld; wird erst bei gültigem Wert übernommen. */
const hexInputs = reactive<Record<WebThemeColorKey, string>>({ ...draft.tokens.colors });

function setColor(key: WebThemeColorKey, value: string): void {
	const hex = value.startsWith("#") ? value : `#${value}`;
	hexInputs[key] = hex;
	if (/^#[0-9a-f]{6}$/i.test(hex)) draft.tokens.colors[key] = hex.toLowerCase();
}

function resetColor(key: WebThemeColorKey): void {
	setColor(key, DEFAULT_WEB_THEME_TOKENS.colors[key]);
}

function isHexValid(key: WebThemeColorKey): boolean {
	return /^#[0-9a-f]{6}$/i.test(hexInputs[key]);
}

const contrastWarnings = computed(() => (sanitized.value ? checkThemeContrast(sanitized.value) : []));

function formatRatio(value: number): string {
	// Abrunden: 4,47:1 darf nicht als „4,5:1“ erscheinen, wenn mindestens 4,5:1 verlangt sind
	return new Intl.NumberFormat(currentLocaleTag(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
		.format(Math.floor(value * 10) / 10);
}

function warningsFor(key: WebThemeColorKey): string[] {
	return contrastWarnings.value
		.filter(warning => warning.foreground === key)
		.map(warning =>
			t("webThemes.contrast.warning", {
				background: t(`webThemes.colors.${warning.background}`),
				ratio: formatRatio(warning.ratio),
				minimum: formatRatio(warning.minimum)
			})
		);
}

// ---------------------------------------------------------------------------
// Vorschau
// ---------------------------------------------------------------------------

const previewFrame = ref<HTMLIFrameElement | null>(null);
const previewHeight = ref(640);
const previewLanguage = computed<SurveyLanguage>(() => {
	const short = String(locale.value).slice(0, 2);
	return (SURVEY_LANGUAGES as readonly string[]).includes(short) ? (short as SurveyLanguage) : DEFAULT_SURVEY_LANGUAGE;
});
const previewSrc = computed(() => `${import.meta.env.BASE_URL}survey.html?preview=1&lang=${previewLanguage.value}`);

function postToPreview(message: unknown): void {
	previewFrame.value?.contentWindow?.postMessage(message, window.location.origin);
}

function sendTheme(): void {
	// Unvollständige Eingaben (z. B. Feld gerade leer) nicht schicken; die Vorschau behält den letzten Stand
	if (sanitized.value) postToPreview({ type: WEB_THEME_PREVIEW_THEME, tokens: JSON.parse(JSON.stringify(sanitized.value)) });
}

function highlight(role: WebTextRole | null): void {
	postToPreview({ type: WEB_THEME_PREVIEW_HIGHLIGHT, role });
}

function onMessage(event: MessageEvent): void {
	if (event.origin !== window.location.origin || event.source !== previewFrame.value?.contentWindow) return;
	const data = event.data as { type?: unknown; height?: unknown } | null;
	if (data?.type === WEB_THEME_PREVIEW_READY) sendTheme();
	else if (data?.type === "polly:height" && typeof data.height === "number" && data.height > 0) {
		previewHeight.value = Math.min(Math.ceil(data.height), 4000);
	}
}

watch(sanitized, sendTheme, { deep: true });

onMounted(() => window.addEventListener("message", onMessage));
onBeforeUnmount(() => window.removeEventListener("message", onMessage));

function save(): void {
	if (!canSave.value || !sanitized.value) return;
	emit("save", { id: draft.id, name: trimmedName.value, isDefault: draft.isDefault, tokens: sanitized.value });
}
</script>

<template>
	<form class="grid grid-cols-1 xl:grid-cols-2 gap-6" @submit.prevent="save">
		<div class="space-y-6 min-w-0">
			<div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
				<div class="md:col-span-8">
					<label :for="`${idPrefix}_name`" class="block text-sm font-medium mb-1">
						{{ t("webThemes.editor.name") }} <span class="text-red-700" aria-hidden="true">*</span>
					</label>
					<InputText
						:id="`${idPrefix}_name`"
						v-model="draft.name"
						class="w-full"
						aria-required="true"
						:maxlength="WEB_THEME_NAME_MAX_CHARS"
						:invalid="!nameValid"
						:disabled="readonly"
					/>
				</div>
				<div class="md:col-span-4 flex items-center gap-2 pb-2">
					<Checkbox v-model="draft.isDefault" :inputId="`${idPrefix}_default`" binary :disabled="readonly" />
					<label :for="`${idPrefix}_default`" class="text-sm">{{ t("webThemes.editor.isDefault") }}</label>
				</div>
			</div>

			<div class="max-w-sm">
				<div :id="`${idPrefix}_font_label`" class="block text-sm font-medium mb-1">{{ t("webThemes.editor.font") }}</div>
				<Select
					v-model="draft.tokens.fontFamily"
					:ariaLabelledby="`${idPrefix}_font_label`"
					:options="fontOptions"
					optionLabel="label"
					optionValue="value"
					class="w-full"
					:disabled="readonly"
				>
					<template #option="{ option }">
						<span :style="{ fontFamily: option.stack }">{{ option.label }}</span>
					</template>
				</Select>
				<p class="mt-1 text-xs text-[var(--p-text-muted-color)]">{{ t("webThemes.editor.fontHint") }}</p>
			</div>

			<fieldset class="space-y-2">
				<div class="flex items-center justify-between gap-2">
					<legend class="text-base font-semibold">{{ t("webThemes.editor.textStyles") }}</legend>
					<Button
						type="button"
						:label="t('webThemes.editor.resetAll')"
						icon="pi pi-refresh"
						text
						size="small"
						severity="secondary"
						:disabled="readonly"
						@click="resetAllRoles"
					/>
				</div>
				<p class="text-xs text-[var(--p-text-muted-color)]">{{ t("webThemes.editor.textStylesHint") }}</p>
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="text-left text-xs text-[var(--p-text-muted-color)]">
								<th scope="col" class="py-1 pr-2 font-medium">{{ t("webThemes.editor.role") }}</th>
								<th scope="col" class="py-1 pr-2 font-medium">{{ t("webThemes.editor.size") }}</th>
								<th scope="col" class="py-1 pr-2 font-medium">{{ t("webThemes.editor.weight") }}</th>
								<th scope="col" class="py-1 pr-2 font-medium">{{ t("webThemes.editor.lineHeight") }}</th>
								<th scope="col" class="py-1"><span class="sr-only">{{ t("webThemes.editor.reset") }}</span></th>
							</tr>
						</thead>
						<tbody>
							<tr
								v-for="role in WEB_TEXT_ROLES"
								:key="role"
								class="border-t border-[var(--p-content-border-color)]"
								@mouseenter="highlight(role)"
								@mouseleave="highlight(null)"
								@focusin="highlight(role)"
								@focusout="highlight(null)"
							>
								<th scope="row" class="py-2 pr-2 text-left font-normal whitespace-nowrap">
									{{ t(`webThemes.roles.${role}`) }}
								</th>
								<td class="py-2 pr-2">
									<InputNumber
										v-model="draft.tokens.text[role].size"
										:min="WEB_TEXT_SIZE_LIMITS[role].min"
										:max="WEB_TEXT_SIZE_LIMITS[role].max"
										:allowEmpty="false"
										showButtons
										suffix=" px"
										inputClass="w-28"
										:aria-label="t('webThemes.editor.sizeOf', { role: t(`webThemes.roles.${role}`), min: WEB_TEXT_SIZE_LIMITS[role].min, max: WEB_TEXT_SIZE_LIMITS[role].max })"
										:disabled="readonly"
									/>
								</td>
								<td class="py-2 pr-2">
									<Select
										v-model="draft.tokens.text[role].weight"
										:options="weightOptions"
										optionLabel="label"
										optionValue="value"
										class="w-36"
										:ariaLabel="t('webThemes.editor.weightOf', { role: t(`webThemes.roles.${role}`) })"
										:disabled="readonly"
									/>
								</td>
								<td class="py-2 pr-2">
									<InputNumber
										v-model="draft.tokens.text[role].lineHeight"
										:min="WEB_TEXT_LINE_HEIGHT_MIN"
										:max="WEB_TEXT_LINE_HEIGHT_MAX"
										:step="0.05"
										:minFractionDigits="0"
										:maxFractionDigits="2"
										:allowEmpty="false"
										showButtons
										inputClass="w-24"
										:aria-label="t('webThemes.editor.lineHeightOf', { role: t(`webThemes.roles.${role}`) })"
										:disabled="readonly"
									/>
								</td>
								<td class="py-2">
									<Button
										type="button"
										icon="pi pi-undo"
										text
										rounded
										size="small"
										severity="secondary"
										:aria-label="t('webThemes.editor.resetRole', { role: t(`webThemes.roles.${role}`) })"
										v-tooltip.top="t('webThemes.editor.reset')"
										:disabled="readonly || isRoleDefault(role)"
										@click="resetRole(role)"
									/>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</fieldset>

			<fieldset class="space-y-3">
				<legend class="text-base font-semibold">{{ t("webThemes.editor.colors") }}</legend>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div v-for="key in WEB_THEME_COLOR_KEYS" :key="key">
						<label :for="`${idPrefix}_color_${key}`" class="block text-sm font-medium mb-1">
							{{ t(`webThemes.colors.${key}`) }}
						</label>
						<div class="flex items-center gap-2">
							<ColorPicker
								:modelValue="draft.tokens.colors[key].slice(1)"
								format="hex"
								:disabled="readonly"
								:aria-label="t(`webThemes.colors.${key}`)"
								@update:modelValue="(value: string) => setColor(key, value)"
							/>
							<InputText
								:id="`${idPrefix}_color_${key}`"
								:modelValue="hexInputs[key]"
								class="w-28 font-mono"
								maxlength="7"
								:invalid="!isHexValid(key)"
								:disabled="readonly"
								:aria-describedby="warningsFor(key).length ? `${idPrefix}_color_${key}_warning` : undefined"
								@update:modelValue="(value: string | undefined) => setColor(key, (value ?? '').trim())"
							/>
							<Button
								type="button"
								icon="pi pi-undo"
								text
								rounded
								size="small"
								severity="secondary"
								:aria-label="t('webThemes.editor.resetColor', { color: t(`webThemes.colors.${key}`) })"
								v-tooltip.top="t('webThemes.editor.reset')"
								:disabled="readonly || draft.tokens.colors[key] === DEFAULT_WEB_THEME_TOKENS.colors[key]"
								@click="resetColor(key)"
							/>
						</div>
						<ul
							v-if="warningsFor(key).length"
							:id="`${idPrefix}_color_${key}_warning`"
							class="mt-1 text-xs text-amber-800 space-y-0.5"
						>
							<li v-for="warning in warningsFor(key)" :key="warning">
								<i class="pi pi-exclamation-triangle mr-1" aria-hidden="true"></i>{{ warning }}
							</li>
						</ul>
					</div>
				</div>
				<div class="flex items-center gap-2">
					<Checkbox v-model="draft.tokens.transparentBackground" :inputId="`${idPrefix}_transparent`" binary :disabled="readonly" />
					<label :for="`${idPrefix}_transparent`" class="text-sm">{{ t("webThemes.editor.transparentBackground") }}</label>
				</div>
				<p class="text-xs text-[var(--p-text-muted-color)]">{{ t("webThemes.editor.transparentHint") }}</p>
			</fieldset>

			<div
				v-if="contrastWarnings.length"
				class="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
				role="status"
			>
				{{ t("webThemes.contrast.summary", { count: contrastWarnings.length }) }}
			</div>

			<div class="flex flex-wrap justify-end gap-2">
				<Button type="button" :label="t('webThemes.editor.cancel')" severity="secondary" text @click="emit('cancel')" />
				<span v-tooltip.top="readonly ? t('permissions.missingDeploy') : undefined">
					<Button type="submit" :label="t('webThemes.editor.save')" icon="pi pi-save" :loading="saving" :disabled="!canSave" />
				</span>
			</div>
		</div>

		<div class="min-w-0">
			<div class="xl:sticky xl:top-4 space-y-2">
				<h3 class="text-base font-semibold">{{ t("webThemes.editor.preview") }}</h3>
				<p class="text-xs text-[var(--p-text-muted-color)]">{{ t("webThemes.editor.previewHint") }}</p>
				<div class="rounded-xl border border-[var(--p-content-border-color)] overflow-auto max-h-[80vh] bg-[repeating-conic-gradient(#f1f5f9_0_25%,#ffffff_0_50%)] bg-[length:16px_16px]">
					<iframe
						ref="previewFrame"
						:src="previewSrc"
						:title="t('webThemes.editor.previewTitle')"
						class="block w-full border-0"
						:style="{ height: `${previewHeight}px` }"
					></iframe>
				</div>
			</div>
		</div>
	</form>
</template>
