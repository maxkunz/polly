<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import Tooltip from "primevue/tooltip";
import InputText from "primevue/inputtext";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import Toolbar from "primevue/toolbar";
import SplitButton from "primevue/splitbutton";
import ControlSelectMenu from "@/components/layout/ControlSelectMenu.vue";

import { useControlBarStore } from "@/stores/controlBarStore";
import { useAppStore } from "@/stores/appStore";
import { appIconSet } from "@/components/icons/appIconSet";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import {
	acquireLocks,
	releaseLocks,
	hasValidLocks,
	startLockActivityTracking,
	stopLockActivityTracking
} from "@/services/lockingService";
import { getConfigurationDataFromGenesys } from "@/services/genesys_helper";
const controlBar = useControlBarStore();
const app = useAppStore();
const toast = useToast();
const confirm = useConfirm();

defineOptions({
	directives: {
		tooltip: Tooltip
	}
});

async function ensureLockForSave(): Promise<boolean> {
	const lockCheck = await hasValidLocks({
		datatableId: app.datatableId as string,
		sessionId: app.sessionId,
		userId: app.currentUser?.id ?? ""
	});

	if (lockCheck.ok) return true;

	const lockUserName = lockCheck.lock?.userName?.trim() ?? "";
	const currentUserName = app.currentUser?.name?.trim() ?? "";
	const isExpiredOwnSession =
		lockCheck.reason === "expired" &&
		!!lockUserName &&
		!!currentUserName &&
		lockUserName === currentUserName;

	if (isExpiredOwnSession) {
		const accepted = await new Promise<boolean>(resolve => {
			confirm.require({
				group: "global",
				header: "Session abgelaufen",
				message: "Session abgelaufen, reaktivieren?",
				icon: "pi pi-exclamation-triangle",
				acceptLabel: "Ja",
				rejectLabel: "Nein",
				accept: () => resolve(true),
				reject: () => resolve(false)
			});
		});

		if (!accepted) {
			app.editMode = false;
			stopLockActivityTracking();
			return false;
		}

		const reacquire = await acquireLocks({
			datatableId: app.datatableId as string,
			user: app.currentUser as NonNullable<typeof app.currentUser>,
			sessionId: app.sessionId,
			status: "editing"
		});

		if (!reacquire.ok) {
			const name = reacquire.conflicts[0]?.lock?.userName?.trim() || "ein anderer User";
			app.editMode = false;
			stopLockActivityTracking();
			toast.add({
				severity: "warn",
				summary: "Locked",
				detail: `Die Konfiguration ist grad in Bearbeitung von: ${name}`,
				life: 5000
			});
			return false;
		}

		startLockActivityTracking({
			datatableId: app.datatableId as string,
			user: app.currentUser as NonNullable<typeof app.currentUser>,
			sessionId: app.sessionId
		});
		return true;
	}

	const name = lockCheck.lock?.userName?.trim() || "ein anderer User";
	app.editMode = false;
	stopLockActivityTracking();
	toast.add({
		severity: "warn",
		summary: "Lock",
		detail: `Lock ist nicht mehr aktiv (${name}).`,
		life: 4000
	});
	return false;
}

async function handleSaveClick(): Promise<void> {
	try {
		const ok = await ensureLockForSave();
		if (!ok) return;
		const v = await app.save();
		const suffix = v ? ` (Draft v${v})` : "";
		toast.add({
			severity: "success",
			summary: "Saved",
			detail: `Konfiguration gespeichert${suffix}.`,
			life: 3000
		});
	} catch (err) {
		console.error("Save error:", err);
		toast.add({
			severity: "error",
			summary: "Error",
			detail: "Speichern fehlgeschlagen.",
			life: 4000
		});
	}
}

async function handleSaveAndClose(): Promise<void> {
	try {
		const ok = await ensureLockForSave();
		if (!ok) return;
		const v = await app.save();
		const suffix = v ? ` (Draft v${v})` : "";
		toast.add({
			severity: "success",
			summary: "Saved",
			detail: `Konfiguration gespeichert${suffix}.`,
			life: 3000
		});
		await handleCloseClick();
	} catch (err) {
		console.error("Save error:", err);
		toast.add({
			severity: "error",
			summary: "Error",
			detail: "Speichern fehlgeschlagen.",
			life: 4000
		});
	}
}

async function handleEditClick(): Promise<void> {
	try {
		const result = await acquireLocks({
			datatableId: app.datatableId as string,
			user: app.currentUser as NonNullable<typeof app.currentUser>,
			sessionId: app.sessionId,
			status: "editing"
		});
		if (!result.ok) {
			const name = result.conflicts[0]?.lock?.userName?.trim() || "ein anderer User";
			toast.add({
				severity: "warn",
				summary: "Locked",
				detail: `Die Konfiguration ist grad in Bearbeitung von: ${name}`,
				life: 5000
			});
			return;
		}
		startLockActivityTracking({
			datatableId: app.datatableId as string,
			user: app.currentUser as NonNullable<typeof app.currentUser>,
			sessionId: app.sessionId
		});
		await getConfigurationDataFromGenesys(app.datatableId);
	} catch (err) {
		console.error("Acquire lock error:", err);
	}
}

async function handleCloseClick(): Promise<void> {
	try {
		await releaseLocks({
			datatableId: app.datatableId as string,
			sessionId: app.sessionId
		});
		stopLockActivityTracking();
	} catch (err) {
		console.error("Release lock error:", err);
	}
}

const saveMenuItems = [
	{
		label: "Speichern & schließen",
		icon: "pi pi-save",
		command: () => {
			void handleSaveAndClose();
		}
	},
	{
		label: "Schließen",
		icon: "pi pi-times",
		command: () => {
			void handleCloseClick();
		}
	}
];

const pageSearchQuery = computed({
	get: () => controlBar.pageSearch?.query ?? "",
	set: (value: string) => controlBar.setPageSearchQuery(value)
});

const visiblePageActions = computed(() =>
	(controlBar.pageActions ?? []).filter(action => {
		const hidden = typeof action.hidden === "function" ? action.hidden() : action.hidden;
		return !hidden;
	})
);
const visiblePageSelects = computed(() => controlBar.pageSelects ?? []);

const hasLeftContent = computed(() => {
	const hasActions = visiblePageActions.value.length > 0;
	const hasSearch = !!controlBar.pageSearch?.enabled;
	const hasSelects = visiblePageSelects.value.length > 0;
	return hasActions || hasSearch || hasSelects;
});
</script>

<template>
	<Toolbar class="app-control-toolbar shadow-md">
		<template #start>
			<div class="flex items-center gap-2 app-control-toolbar-start">
				<!-- Page-specific actions -->
				<Button
					v-for="action in visiblePageActions"
					:key="action.id"
					v-tooltip="action.label"
					:size="action.size ?? 'small'"
					:severity="action.severity ?? 'secondary'"
					:text="action.variant ? action.variant === 'text' : true"
					:rounded="true"
					:disabled="typeof action.disabled === 'function' ? action.disabled() : action.disabled ?? false"
					@click="action.handler && action.handler()"
				>
					<template #icon>
						<component
							v-if="action.iconKey && appIconSet[action.iconKey]"
							:is="appIconSet[action.iconKey]"
						/>
					</template>
				</Button>

				<!-- Page selects -->
				<ControlSelectMenu
					v-for="select in visiblePageSelects"
					:key="select.id"
					:options="select.options"
					:modelValue="select.value()"
					:placeholder="select.placeholder"
					:disabled="typeof select.disabled === 'function' ? select.disabled() : select.disabled ?? false"
					@update:modelValue="value => select.onChange(value)"
				/>

				<!-- Page search -->
				<IconField
					v-if="controlBar.pageSearch?.enabled"
					class="hidden sm:inline-flex mr-2"
					:class="{ 'pointer-events-none opacity-60': controlBar.pageSearch?.disabled }"
				>
					<InputIcon class="pi pi-search" />
					<InputText
						v-model="pageSearchQuery"
						type="search"
						:placeholder="controlBar.pageSearch?.placeholder ?? 'Search...'"
						:disabled="controlBar.pageSearch?.disabled ?? false"
						class="text-sm w-56 p-inputtext-sm h-8"
					/>
				</IconField>
			</div>
		</template>

		<template #end>
			<div
				class="flex items-center gap-2 app-control-toolbar-end"
				:class="{ 'app-control-toolbar-end--separated': hasLeftContent }"
			>
				<!-- Global save -->
				<SplitButton
					v-if="app.editMode"
					size="small"
					severity="success"
					icon="pi pi-save"
					label="Save"
					@click="handleSaveClick"
					:model="saveMenuItems"
				/>

				<Button
					v-if="!app.editMode"
					size="small"
					severity="primary"
					icon="pi pi-pencil"
					label="Bearbeiten"
					@click="handleEditClick"
				/>

			</div>
		</template>
	</Toolbar>
</template>

<style scoped>
:deep(.app-control-toolbar.p-toolbar .p-toolbar-group-start),
:deep(.app-control-toolbar.p-toolbar .p-toolbar-group-end) {
	gap: 0.25rem;
}

.app-control-toolbar-start {
	align-items: center;
	gap: 0.25 rem;
}

.app-control-toolbar-end {
	align-items: center;
	gap: 1rem;
	padding-right: 1rem;
}

.app-control-toolbar-end--separated {
	border-left: 1px solid var(--surface-border);
	margin-left: 0.5rem;
	padding-left: 0.5rem;
}
</style>
