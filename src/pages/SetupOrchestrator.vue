<template>
  <div class="page-wrapper">
    <div class="header-hero">
      <img src="@/assets/logo-icon.png" alt="Logo" class="hero-logo" />
      <div class="hero-content">
        <h1>{{ t("setup.heroTitle") }}</h1>
      </div>
    </div>

    <div class="provisioning-container">
      <div v-if="showLogs" class="log-container shadow-soft">
        <div class="log-header">{{ t("setup.logHeader") }}</div>

        <div class="log-content">
          <div v-for="(log, i) in logs" :key="i" class="log-line" :class="{ 'err-text': log.toLowerCase().includes('error') }">
            <span class="log-time">[{{ new Date().toLocaleTimeString() }}]</span> {{ log }}
          </div>
        </div>

        <div class="log-actions">
          <Button v-if="setupComplete" :label="t('setup.startApp')" @click="startApp" />
          <Button v-if="hasError && !isWorking" :label="t('setup.backToConfig')" severity="secondary" @click="goBackToConfig" />
        </div>
      </div>

      <div v-else class="input-card shadow-soft scroll-card">
        <Stepper v-model:value="activeStep" linear class="setup-stepper">
          <StepList class="setup-step-list">
            <Step value="1">{{ t("setup.steps.installation") }}</Step>
            <Step value="2">{{ t("setup.steps.summary") }}</Step>
          </StepList>

          <StepPanels>
            <StepPanel v-slot="{ activateCallback }" value="1">
              <div class="step-header">
                <h2 class="step-title">{{ t("setup.step1.title") }}</h2>
                <p class="step-desc">{{ t("setup.step1.description") }}</p>
              </div>

              <div class="form-grid">
                <div class="form-section">
                  <label class="section-label">{{ t("setup.step1.projectTag") }}</label>
                  <InputText
                    v-model="projectName"
                    :placeholder="t('setup.step1.projectTagPlaceholder')"
                    :disabled="isWorking"
                    class="full-width-input"
                    @input="onProjectTagInput"
                  />
                </div>

                <div class="form-section">
                  <label class="section-label">{{ t("setup.step1.integration") }}</label>
                  <Select
                    v-model="selectedIntegrationId"
                    :options="allIntegrations"
                    optionLabel="name"
                    optionValue="id"
                    :placeholder="t('setup.step1.integrationPlaceholder')"
                    :disabled="isWorking"
                    filter
                    class="full-width-input"
                  />
                </div>

                <div class="form-section">
                  <label class="section-label">{{ t("setup.step1.oauthClient") }}</label>
                  <Select
                    v-model="selectedOAuthId"
                    :options="allOAuths"
                    optionLabel="name"
                    optionValue="id"
                    :placeholder="t('setup.step1.oauthClientPlaceholder')"
                    :disabled="isWorking"
                    filter
                    class="full-width-input"
                  />
                </div>

                <div class="form-section">
                  <label class="section-label">{{ t("setup.step1.division") }}</label>
                  <div class="toggle-row">
                    <ToggleSwitch v-model="useExistingDivision" @change="handleDivisionToggle" />
                    <span class="toggle-text">
                      {{ useExistingDivision ? t("setup.step1.useExistingDivision") : t("setup.step1.createNewDivision") }}
                    </span>
                  </div>

                  <div v-if="useExistingDivision" class="toggle-panel">
                    <Select
                      v-model="selectedDivisionId"
                      :options="allDivisions"
                      optionLabel="name"
                      optionValue="id"
                      :placeholder="t('setup.step1.divisionPlaceholder')"
                      :disabled="isWorking"
                      filter
                      class="full-width-input"
                    />
                  </div>
                </div>
              </div>

              <div class="step-actions">
                <span />
                <Button :label="t('setup.step1.next')" :disabled="!canNext" @click="activateCallback('2')" />
              </div>
            </StepPanel>

            <StepPanel v-slot="{ activateCallback }" value="2">
              <div class="step-header">
                <h2 class="step-title">{{ t("setup.step2.title") }}</h2>
                <p class="step-desc">{{ t("setup.step2.description") }}</p>
              </div>

              <div class="summary-grid">
                <div class="summary-card">
                  <div class="summary-title">{{ t("setup.step2.project") }}</div>
                  <div class="summary-value">{{ projectName || "-" }}</div>
                </div>

                <div class="summary-card">
                  <div class="summary-title">{{ t("setup.step2.appIntegration") }}</div>
                  <div class="summary-value">{{ selectedIntegrationName || "-" }}</div>
                </div>

                <div class="summary-card">
                  <div class="summary-title">{{ t("setup.step2.oauthClient") }}</div>
                  <div class="summary-value">{{ selectedOAuthName || "-" }}</div>
                </div>

                <div class="summary-card">
                  <div class="summary-title">{{ t("setup.step2.division") }}</div>
                  <div class="summary-value">{{ divisionSummary }}</div>
                </div>
              </div>

              <div class="step-actions">
                <Button :label="t('setup.step2.back')" severity="secondary" @click="activateCallback('1')" />
                <Button :label="t('setup.step2.start')" :disabled="isWorking || !canStart" @click="handleStart" />
              </div>
            </StepPanel>
          </StepPanels>
        </Stepper>
      </div>
    </div>

    <Toast />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import Stepper from "primevue/stepper";
import StepList from "primevue/steplist";
import Step from "primevue/step";
import StepPanels from "primevue/steppanels";
import StepPanel from "primevue/steppanel";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import ToggleSwitch from "primevue/toggleswitch";
import Button from "primevue/button";
import Toast from "primevue/toast";
import { runFullProvisioning } from "@/services/SetupOrchestrator";
import { getAllIntegrations } from "@/services/genesys/dataAction";
import { getAllClients } from "@/services/genesys/oauth_backend";
import { getListDivisions } from "@/services/genesys/division";
import { useAppStore } from "@/stores/appStore";

const app = useAppStore();
const toast = useToast();
const { t } = useI18n();

const projectName = ref("");
const isWorking = ref(false);
const logs = ref<string[]>([]);
const hasError = ref(false);
const activeStep = ref("1");
const showLogs = ref(false);
const setupComplete = ref(false);
const setupIntegrationUrl = ref("");

const allIntegrations = ref<any[]>([]);
const allOAuths = ref<any[]>([]);
const allDivisions = ref<any[]>([]);

const selectedIntegrationId = ref("");
const selectedOAuthId = ref("");
const selectedDivisionId = ref("");
const useExistingDivision = ref(false);

const canNext = computed(() => {
  if (!projectName.value.trim()) return false;
  if (!selectedIntegrationId.value || !selectedOAuthId.value) return false;
  if (useExistingDivision.value && !selectedDivisionId.value) return false;
  return true;
});

const canStart = computed(() => canNext.value);

const selectedIntegrationName = computed(() => {
  return allIntegrations.value.find((item) => item.id === selectedIntegrationId.value)?.name || "";
});

const selectedOAuthName = computed(() => {
  return allOAuths.value.find((item) => item.id === selectedOAuthId.value)?.name || "";
});

const selectedDivisionName = computed(() => {
  return allDivisions.value.find((item) => item.id === selectedDivisionId.value)?.name || "";
});

const divisionSummary = computed(() => {
  return useExistingDivision.value ? selectedDivisionName.value || "-" : t("setup.step2.newDivision", { name: projectName.value || "-" });
});

function handleDivisionToggle() {
  if (!useExistingDivision.value) {
    selectedDivisionId.value = "";
  }
}

function onProjectTagInput() {
  projectName.value = projectName.value.replace(/[^A-Za-z0-9_-]/g, "");
}

onMounted(async () => {
  isWorking.value = true;
  try {
    const [integrations, oauths, divisions] = await Promise.all([
      getAllIntegrations(),
      getAllClients(),
      getListDivisions(),
    ]);

    allIntegrations.value = integrations.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
    allOAuths.value = oauths.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
    allDivisions.value = divisions.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
  } catch (err) {
    console.error("Failed to load setup data", err);
    logs.value.push("Error: Could not load setup data.");
  } finally {
    isWorking.value = false;
  }
});

async function handleStart() {
  isWorking.value = true;
  hasError.value = false;
  logs.value = [];
  showLogs.value = true;
  setupComplete.value = false;

  try {
    const result = await runFullProvisioning(
      projectName.value,
      selectedIntegrationId.value,
      selectedOAuthId.value,
      selectedDivisionId.value,
      selectedDivisionName.value,
      (msg) => {
        logs.value.push(msg);
        if (msg.toLowerCase().includes("error")) {
          hasError.value = true;
        }
      }
    );

    setupIntegrationUrl.value = result.integrationUrl;
    setupComplete.value = true;

    toast.add({
      severity: "success",
      summary: t("setup.toast.successSummary"),
      detail: t("setup.toast.successDetail"),
      life: 3000,
    });
  } catch (err) {
    console.error(err);
    hasError.value = true;
    logs.value.push("--ERROR-- Setup failed.");
    toast.add({
      severity: "error",
      summary: t("setup.toast.errorSummary"),
      detail: t("setup.toast.errorDetail"),
      life: 5000,
    });
  } finally {
    isWorking.value = false;
  }
}

function goBackToConfig() {
  showLogs.value = false;
  hasError.value = false;
  setupComplete.value = false;
}

async function startApp() {
  if (!setupIntegrationUrl.value) return;
  window.location.assign(setupIntegrationUrl.value);
}
</script>

<style scoped>
.page-wrapper {
  background-image:
    radial-gradient(120% 70% at 20% 15%, rgba(20, 56, 127, 0.55) 0%, rgba(2, 27, 44, 0.9) 60%),
    radial-gradient(90% 60% at 85% 35%, rgba(20, 56, 127, 0.45) 0%, rgba(2, 27, 44, 0.85) 55%),
    linear-gradient(210deg, rgb(2, 27, 44) 12%, rgb(20, 56, 127) 58%, rgb(2, 27, 44) 92%);
  background-attachment: fixed;
  background-size: cover;
  background-position: center;
  min-height: 100vh;
}

.header-hero {
  height: 140px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  text-align: center;
  position: relative;
}

.hero-content h1 {
  font-size: 2.7rem;
  margin: 0;
  font-weight: 600;
  letter-spacing: -0.5px;
}

.hero-logo {
  width: 160px;
  max-width: 70vw;
  height: auto;
  position: absolute;
  top: 20px;
  left: 24px;
}

.provisioning-container {
  max-width: 1000px;
  margin: 24px auto 50px;
  padding: 0 20px;
}

.input-card {
  background: white;
  padding: 32px;
  border-radius: 12px;
  border: 1px solid #edf1f5;
}

.scroll-card {
  max-height: calc(70vh + 100px);
  overflow-y: auto;
}

.shadow-soft {
  box-shadow: 0 12px 28px rgba(16, 24, 40, 0.08);
}

.setup-stepper {
  gap: 20px;
}

.setup-step-list {
  margin-bottom: 16px;
}

.step-header {
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef2f6;
}

.step-title {
  margin: 0 0 6px;
  font-size: 1.2rem;
  font-weight: 600;
}

.step-desc {
  margin: 0;
  color: #6b7280;
  font-size: 0.95rem;
}

.form-grid {
  display: grid;
  gap: 12px;
}

.form-section {
  margin-bottom: 16px;
}

.section-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: #6b7280;
  margin-bottom: 8px;
  display: block;
  font-weight: 600;
}

.full-width-input {
  width: 100%;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.toggle-text {
  font-size: 0.9rem;
  color: #4b5563;
}

.toggle-panel {
  margin-top: 6px;
}

.step-actions {
  margin-top: 20px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.summary-card {
  border: 1px solid #eef2f6;
  background: #fafbfc;
  border-radius: 10px;
  padding: 14px;
}

.summary-title {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}

.summary-value {
  font-size: 0.95rem;
  font-weight: 600;
  color: #111827;
}

.log-container {
  margin-top: 30px;
  background: #2d3436;
  border-radius: 8px;
  overflow: hidden;
}

.log-header {
  background: #23292b;
  color: #dfe6e9;
  padding: 10px 20px;
  font-size: 0.8rem;
}

.log-content {
  padding: 20px;
  max-height: 250px;
  overflow-y: auto;
  color: #00ff00;
  font-family: monospace;
  font-size: 0.85rem;
}

.log-line {
  margin-bottom: 5px;
  border-bottom: 1px solid #3c4446;
  padding-bottom: 5px;
}

.log-time {
  color: #636e72;
  margin-right: 10px;
}

.err-text {
  color: #ff7675;
}

.log-actions {
  padding: 14px 20px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
