<script setup lang="ts">
import { computed, nextTick, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import Card from "primevue/card";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import InputNumber from "primevue/inputnumber";
import ToggleSwitch from "primevue/toggleswitch";
import Button from "primevue/button";
import ConfirmDialog from "primevue/confirmdialog";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue";

import PageHeader from "@/components/layout/PageHeader.vue";
import { useAppStore } from "@/stores/appStore";
import { useControlBarStore } from "@/stores/controlBarStore";
import { moduleRegistry } from "@/app/modules";
import { usePageControlBar } from "@/app/usePageControlBar";

const app = useAppStore();
const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const toast = useToast();
const controlBar = useControlBarStore();

const { selectModules } = moduleRegistry();
const moduleMeta = computed(() => selectModules({ keys: ["questions"] })[0]);

const selectedQuestionId = computed((): string | null => {
  const raw = route.query.id;
  return typeof raw === "string" && raw.length ? raw : null;
});

usePageControlBar("questions", () => ({
  search: {
    enabled: true,
    placeholder: "Fragen, Prompt oder Reprompt suchen...",
    query: "",
  },
  actions: [
    {
      id: "questions.new",
      label: "Neue Frage",
      iconKey: "add",
      severity: "secondary",
      disabled: () => !app.editMode,
      handler: createQuestion,
    },
    {
      id: "questions.delete",
      label: "Frage löschen",
      iconKey: "delete",
      severity: "danger",
      disabled: () => !selectedQuestionId.value || !app.editMode,
      handler: deleteSelectedQuestion,
    },
    {
      id: "questions.reloadAnswers",
      label: "Antworten neu laden",
      iconKey: "reload",
      severity: "secondary",
      disabled: () => !app.editMode,
      handler: () => reloadAnswers(),
    },
  ],
}));

const searchQuery = computed(() =>
  (controlBar.pageSearch?.query ?? "").trim().toLowerCase(),
);

const allQuestions = computed(() => app.domain.questions.all());

const filteredQuestions = computed(() => {
  const q = searchQuery.value;
  if (!q) return allQuestions.value;

  return allQuestions.value.filter((question) => {
    const haystack = [
      question.name,
      question.prompt,
      question.reprompt,
      String(question.minValue),
      String(question.maxValue),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(q);
  });
});

onMounted(async () => {
  if (app.datatableId) {
    await app.loadQuestionAnswers();
  }
});

function scrollToQuestion(id: string): void {
  const el = document.getElementById(`question_${id}`);
  if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
}

function selectQuestion(id: string): void {
  if (route.query.id !== id) {
    router.replace({ name: "questions", query: { id } });
  }
}

function ensureSelectionFromRoute(): void {
  if (!filteredQuestions.value.length) {
    if (route.query.id) router.replace({ name: "questions" });
    return;
  }

  const id = selectedQuestionId.value;
  if (id && filteredQuestions.value.some((question) => question.id === id)) {
    nextTick(() => scrollToQuestion(id));
    return;
  }

  const first = filteredQuestions.value[0];
  if (!first) return;
  router.replace({ name: "questions", query: { id: first.id } });
  nextTick(() => scrollToQuestion(first.id));
}

watch([filteredQuestions, selectedQuestionId], ensureSelectionFromRoute, {
  immediate: true,
});

function createQuestion(): void {
  if (controlBar.pageSearch) controlBar.pageSearch.query = "";
  const question = app.domain.questions.create("*Neue Frage");
  router.replace({ name: "questions", query: { id: question.id } });
}

function deleteSelectedQuestion(): void {
  const id = selectedQuestionId.value;
  if (!id) return;

  const question = app.domain.questions.get(id);
  const title = question?.name?.trim() ? question.name.trim() : "diese Frage";

  confirm.require({
    header: "Frage löschen",
    message: `„${title}“ löschen? Diese Aktion kann nicht rückgängig gemacht werden.`,
    icon: "pi pi-exclamation-triangle",
    acceptLabel: "Löschen",
    rejectLabel: "Abbrechen",
    accept: () => {
      app.domain.questions.remove(id);

      const remaining = app.domain.questions.all();
      if (!remaining.length) {
        router.replace({ name: "questions" });
        return;
      }

      const next = filteredQuestions.value[0] ?? remaining[0];
      router.replace({ name: "questions", query: { id: next.id } });
    },
  });
}

async function reloadAnswers(): Promise<void> {
  try {
    await app.loadQuestionAnswers();

    toast.add({
      severity: "success",
      summary: "Antworten neu geladen",
      detail: `Antworten wurden erfolgreich neu geladen.`,
      life: 3000,
    });
  } catch (err) {
    console.error("Reloading Answers error:", err);
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Neu laden fehlgeschlagen.",
      life: 4000,
    });
  }
}

function normalizeRange(questionId: string): void {
  const question = app.domain.questions.get(questionId);
  if (!question) return;

  if (!Number.isFinite(question.minValue)) question.minValue = 1;
  if (!Number.isFinite(question.maxValue))
    question.maxValue = question.minValue;

  if (question.minValue > question.maxValue) {
    question.maxValue = question.minValue;
  }
}

function getScaleValues(questionId: string): number[] {
  const question = app.domain.questions.get(questionId);
  if (!question) return [];

  const values: number[] = [];
  for (
    let current = question.minValue;
    current <= question.maxValue;
    current += 1
  ) {
    values.push(current);
  }
  return values;
}
</script>

<template>
	<section class="p-4">
		<ConfirmDialog />

		<div class="mb-8">
			<PageHeader
				v-if="moduleMeta"
				:title="moduleMeta.title"
				:iconKey="moduleMeta.key"
				:color="moduleMeta.color"
			/>
		</div>

		<div class="max-w-6xl mx-auto">
			<div v-if="!filteredQuestions.length" class="text-sm text-[var(--p-text-muted-color)] text-center py-10">
				Keine Fragen gefunden.
			</div>

			<div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-4">
				<Card
					v-for="question in filteredQuestions"
					:key="question.id"
					:id="`question_${question.id}`"
					class="question-card cursor-pointer"
					:class="selectedQuestionId === question.id ? 'question-card-selected' : ''"
					@click="selectQuestion(question.id)"
				>
					<template #content>
						<div class="space-y-4">
							<div class="flex items-center justify-between gap-4">
								<div class="flex-1">
									<label class="block text-sm font-medium mb-1">Name</label>
									<InputText
										v-model="question.name"
										class="w-full"
										placeholder="z. B. Servicebewertung"
										:disabled="!app.editMode"
										@click.stop
									/>
								</div>

								<div class="flex items-center gap-2 pt-6 shrink-0">
									<label class="text-sm text-[var(--p-text-muted-color)]">Aktiv</label>
									<ToggleSwitch
										v-model="question.enabled"
										:disabled="!app.editMode"
										@click.stop
									/>
								</div>
							</div>

							<div>
								<label class="block text-sm font-medium mb-1">Prompt</label>
								<Textarea
									v-model="question.prompt"
									class="w-full"
									rows="3"
									autoResize
									placeholder="Bewerten Sie den Service auf einer Skala von 1 bis 5."
									:disabled="!app.editMode"
									@click.stop
								/>
							</div>

							<div>
								<label class="block text-sm font-medium mb-1">Reprompt</label>
								<Textarea
									v-model="question.reprompt"
									class="w-full"
									rows="2"
									autoResize
									placeholder="Bitte nennen Sie eine Zahl innerhalb des Bereichs."
									:disabled="!app.editMode"
									@click.stop
								/>
							</div>

							<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
								<div>
									<label class="block text-sm font-medium mb-1">Min</label>
									<InputNumber
										v-model="question.minValue"
										inputClass="w-full"
										:min="0"
										:max="99"
										:useGrouping="false"
										:disabled="!app.editMode"
										@update:modelValue="normalizeRange(question.id)"
										@click.stop
									/>
								</div>

								<div>
									<label class="block text-sm font-medium mb-1">Max</label>
									<InputNumber
										v-model="question.maxValue"
										inputClass="w-full"
										:min="0"
										:max="99"
										:useGrouping="false"
										:disabled="!app.editMode"
										@update:modelValue="normalizeRange(question.id)"
										@click.stop
									/>
								</div>

								<div class="text-sm text-[var(--p-text-muted-color)]">
									Skala: {{ question.minValue }} bis {{ question.maxValue }}
								</div>
							</div>

							<div class="p-1">
								<div class="flex items-center justify-between gap-4 mb-3">
									<div class="text-sm font-medium">Aktuelle Antworten</div>
									<div class="text-sm text-[var(--p-text-muted-color)]">
										Gesamt: {{ app.questionAnswers[question.id]?.totalResponses ?? 0 }}
									</div>
								</div>

								<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
									<div
										v-for="value in getScaleValues(question.id)"
										:key="`${question.id}_${value}`"
										class="rounded-xl px-3 py-2 text-sm bg-[var(--p-surface-0)] shadow-sm border border-[var(--p-content-border-color)]"
									>
										<div class="flex items-center justify-between gap-3">
											<span
												class="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-[var(--p-primary-color)] px-2 text-sm font-semibold text-[var(--p-primary-contrast-color)]"
											>
												{{ value }}
											</span>
											<div class="flex items-center gap-2 text-xs text-[var(--p-text-muted-color)]">
												<i class="pi pi-hashtag"></i>
												<span class="text-sm font-semibold text-[var(--p-text-muted-color)]">
													{{ Number(app.questionAnswers[question.id]?.counts?.[String(value)] ?? 0) }}
												</span>
											</div>
										</div>
									</div>
								</div>

								<div v-if="app.questionAnswers[question.id]?.updatedAt" class="mt-3 text-xs text-[var(--p-text-muted-color)]">
									Zuletzt aktualisiert: {{ app.questionAnswers[question.id]?.updatedAt }}
								</div>
							</div>
						</div>
					</template>
				</Card>
			</div>
		</div>
	</section>
</template>

<style scoped>
.question-card-selected :deep(.p-card-body) {
  box-shadow: 0 0 0 2px var(--p-primary-color);
  border-radius: 1rem;
}
</style>
