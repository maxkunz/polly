<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from "vue-router";
import { useAppStore } from "@/stores/appStore";
import { runFullDelete } from '@/services/SetupUninstall';
import { useToast } from "primevue/usetoast";

import Toast from 'primevue/toast';

const app = useAppStore();
const toast = useToast();
const router = useRouter();
const logs = ref<string[]>([]);
const isProcessing = ref(false);
const isFinished = ref(false);
const isStarted = ref(false);


const handleStart = async () => {
    isStarted.value = true;
    await startAutomaticUninstallation();
};

const startAutomaticUninstallation = async () => {
    isProcessing.value = true;
    logs.value.push("Initiating secure resource teardown...");

    try {
        await runFullDelete(app.domain.meta.setup!, (msg: string) => {
            logs.value.push(msg);
            scrollToBottom();
        }, toast);
        isFinished.value = true;
        logs.value.push(" ***** SUCCESS: Cleanup complete.");

        toast.add({ 
            severity: 'success', 
            summary: 'Installation entfernt', 
            detail: 'Die installierten App-Ressourcen wurden entfernt.', 
            life: 3000 // 3 Sek.
        });
    } catch (e: any) {
        if (e.message.includes("Dependency found")) {           // In Case InboundFlow has a TelNum
            logs.value.push(`--ERROR-- ABORTED: ${e.message}`);
        } else {
            logs.value.push(`--ERROR-- FATAL: ${e.message}`);

            toast.add({ 
            severity: 'error', 
            summary: 'Löschen fehlgeschlagen', 
            detail: e.message, 
            life: 6000 // 6 Sek.
        });
        }
    } finally {
        isProcessing.value = false;
        isFinished.value = true;
    }
};

const scrollToBottom = () => {
    setTimeout(() => {
        const el = document.getElementById('log-content');
        if (el) el.scrollTop = el.scrollHeight;
    }, 50);
};

const exitUninstall = () => {
    if (isFinished.value && !hasError.value) {
        if (app.domain?.meta) {
            app.domain.meta.setup = null;
        }
        app.initialized = false;
        const url = new URL(window.location.href);
        url.searchParams.delete("datatable_id");
        window.location.assign(url.toString());
    } else {
        router.replace({ name: "dashboard", query: router.currentRoute.value.query });
    }
};

const hasError = computed(() => {
    return logs.value.some(line => line.includes('--ERROR--'));
});

</script>

<template>
  <div class="page-wrapper">
    <div class="header-hero">
    <img src="@/assets/logo-icon.png" alt="Logo" class="hero-logo" />
      <div class="hero-content">
        <h1>Uninstall Project</h1>
      </div>
    </div>

    <div class="log-container">
    </div>

    <div class="provisioning-container">
      <div class="input-card shadow-soft">
        
        <div class="step-header">
          <h2 class="step-title">Installierte Ressourcen entfernen</h2>
          <p class="step-desc">
            Installation: <span style="color: #111827; font-weight: 700;">{{ app.domain?.meta?.setup?.projectTag }}</span>
          </p>
        </div>

        <div v-if="!isStarted" class="warning-box">
            <div class="warning-icon">⚠️</div>
            <div class="warning-message">
                Diese Aktion entfernt die durch das Setup erzeugten Ressourcen aus Genesys Cloud. <br />
                Dazu gehören Data Table, Backend OAuth Client und Data Action Integration. Möchtest du fortfahren?
            </div>
        </div>

        <div v-if="isStarted" class="log-container">
          <div class="log-header">SYSTEM TERMINAL - UNINSTALL_LOG</div>
          <div id="log-content" class="log-content">
            <div v-for="(log, i) in logs" :key="i" class="log-line" :class="{'err-text': log.includes('--ERROR--')}">
              <span class="log-time">[{{ new Date().toLocaleTimeString() }}]</span>
              {{ log }}
            </div>
            <div v-if="isProcessing" class="cursor">_</div>
          </div>
        </div>

        <div class="step-actions">
            <button 
                v-if="!isStarted" 
                @click="exitUninstall" 
                class="btn-secondary"
            >
                Cancel
            </button>

            <button 
                v-if="!isStarted" 
                @click="handleStart" 
                class="btn-danger"
            >
                Installation entfernen
            </button>

            <button 
                v-if="isFinished" 
                @click="exitUninstall" 
                class="btn-primary"
                style="width: 100%;"
            >
                {{ hasError ? 'Back to Menu' : 'Finish' }}
            </button>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* Layout Background */

:deep(.p-toast) {
  z-index: 10001 !important;
}

.page-wrapper {
  background-image:
    radial-gradient(120% 70% at 20% 15%, rgba(20, 56, 127, 0.55) 0%, rgba(2, 27, 44, 0.9) 60%),
    radial-gradient(90% 60% at 85% 35%, rgba(20, 56, 127, 0.45) 0%, rgba(2, 27, 44, 0.85) 55%),
    linear-gradient(210deg, rgb(2, 27, 44) 12%, rgb(20, 56, 127) 58%, rgb(2, 27, 44) 92%);
  background-attachment: fixed;
  background-size: cover;
  background-position: center;
  min-height: 100vh;
  font-family: 'Inter', sans-serif;
}

.header-hero {
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  text-align: center;
}

.hero-content h1 { font-size: 2.7rem; margin: 0; font-weight: 600; letter-spacing: -0.5px; }
.hero-logo {
  width: 160px;
  max-width: 70vw;
  height: auto;
  position: absolute;
  top: 20px;
  left: 24px;
}

.provisioning-container {
  max-width: 800px;
  margin: 0 auto 50px;
  padding: 0 20px;
}

.input-card {
  background: white;
  padding: 32px;
  border-radius: 12px;
  border: 1px solid #edf1f5;
}

.shadow-soft {
  box-shadow: 0 12px 28px rgba(16, 24, 40, 0.08);
}

.step-header {
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef2f6;
}

.step-title { margin: 0 0 6px; font-size: 1.4rem; font-weight: 600; color: #111827; }
.step-desc { margin: 0; color: #6b7280; font-size: 0.95rem; }

/* Log Console Styles */
.log-container { margin-top: 20px; background: #1e2224; border-radius: 8px; overflow: hidden; border: 1px solid #333; }
.log-header { background: #141718; color: #94a3b8; padding: 10px 20px; font-size: 0.75rem; font-weight: 600; letter-spacing: 1px; }
.log-content { padding: 20px; height: 350px; overflow-y: auto; color: #10b981; font-family: 'Fira Code', monospace; font-size: 0.85rem; line-height: 1.6; }
.log-line { margin-bottom: 4px; border-bottom: 1px solid #2d3235; padding-bottom: 4px; }
.log-time { color: #64748b; margin-right: 10px; }
.err-text { color: #ef4444; }

/* Warning Box */
.warning-box {
    background: #fffbeb;
    border: 1px solid #fef3c7;
    border-radius: 8px;
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 20px;
}
.warning-icon { font-size: 1.5rem; }
.warning-message { color: #92400e; font-size: 0.95rem; font-weight: 500; }

/* Buttons */
.step-actions { margin-top: 30px; display: flex; justify-content: flex-end; gap: 12px; }

.btn-danger {
    background: #dc2626;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
}
.btn-danger:hover { background: #b91c1c; }

.btn-secondary {
    background: white;
    color: #374151;
    border: 1px solid #d1d5db;
    padding: 12px 24px;
    border-radius: 6px;
    cursor: pointer;
}
.btn-secondary:hover { background: #f9fafb; }

.btn-primary {
    background: #2563eb;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
}

.cursor { animation: blink 1s infinite; display: inline-block; width: 8px; height: 15px; background: #10b981; vertical-align: middle; }
@keyframes blink { 50% { opacity: 0; } }

/* Scrollbar styling for log-content */
#log-content::-webkit-scrollbar { width: 6px; }
#log-content::-webkit-scrollbar-track { background: #1e2224; }
#log-content::-webkit-scrollbar-thumb { background: #3f4447; border-radius: 3px; }
</style>
