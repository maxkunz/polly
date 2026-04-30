<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useUiStore } from "@/stores/uiStore";
import { useAppStore } from "@/stores/appStore";
import { moduleRegistry } from "@/app/modules";
import type { ModuleDefinition, ModuleChild } from "@/app/modules";

import { appIconSet } from "@/components/icons/appIconSet";

const uiStore = useUiStore();
const appStore = useAppStore();
const route = useRoute();
const router = useRouter();

const { selectModules } = moduleRegistry();
const modulesList = computed(() => selectModules({ page: true }).filter(module => module.isActive()));

const isSidebarCollapsed = computed(() => uiStore.isSidebarCollapsed);
const openModuleKey = ref<string | null>(null);

/* =========================================================
 * Helpers
 * ======================================================= */

function isActiveRoute(module: ModuleDefinition): boolean {
	return route.name === module.key || route.matched.some(record => record.name === module.key);
}

function isActiveChild(child: ModuleChild): boolean {
	if (child.value?.type === "page") {
		return route.name === child.value?.id;
	}
	const selectedId = route.query.id;
	const childId = child.value?.id ?? child.key;
	return selectedId === childId;
}

function hasSidebarChildren(module: ModuleDefinition): boolean {
	if (module.showChildrenInSidebar === false) {
		return false;
	}
	return module.getChildren().length > 0;
}

function handleModuleClick(module: ModuleDefinition): void {
	router.push({ name: module.key });

	const hasChildren = hasSidebarChildren(module);

	if (hasChildren) {
		openModuleKey.value = openModuleKey.value === module.key ? null : module.key;
	} else {
		openModuleKey.value = null;
	}
}

function handleChildClick(module: ModuleDefinition, child: ModuleChild): void {
	if (child.value?.type === "page") {
		router.replace({ name: String(child.value?.id ?? "") });
		return;
	}
	router.replace({
		name: module.key,
		query: {
			id: child.value?.id ?? child.key
		}
	});
}

watch(
	() => route.name,
	() => {
		const activeModule = modulesList.value.find(module => isActiveRoute(module)) ?? null;
		if (!activeModule) {
			openModuleKey.value = null;
			return;
		}

		if (hasSidebarChildren(activeModule)) {
			openModuleKey.value = activeModule.key;
			return;
		}

		if (openModuleKey.value === activeModule.key) {
			openModuleKey.value = null;
		}
	},
	{ immediate: true }
);
</script>

<template>
	<aside class="p-2"
		:class="[
			'app-sidebar-root flex flex-col h-screen overflow-y-auto shrink-0 transition-all duration-200',
			isSidebarCollapsed ? 'w-12 px-0' : 'w-56'
		]"
	>
		<!-- Header / Toggle -->
		<div
			class="h-12 flex items-center px-2"
			:class="isSidebarCollapsed ? 'justify-center' : 'justify-start'"
		>
			<!-- Logo -->
			<div v-if="!isSidebarCollapsed">
				<div
					v-if="(appStore.domain.meta.appTitle ?? '').length > 0"
					class="flex items-center gap-2"
				>
					<img
						src="@/assets/logo-icon.png"
						alt="App Icon"
						class="h-6 w-auto"
					/>
					<span class="text-white text-2xl font-medium truncate">
						{{ appStore.domain.meta.appTitle }}
					</span>
				</div>
				<img
					v-else
					src="@/assets/logo-icon.png"
					alt="App"
					class="h-6 w-auto"
				/>
			</div>

			<!-- Spacer -->
			<div class="flex-1" />

			<!-- Collapse Toggle (floated right) -->
			<button
				type="button"
				class="flex items-center justify-center text-surface-500 opacity-60 hover:opacity-100 transition"
				:class="isSidebarCollapsed ? 'w-8 h-8' : 'w-6 h-6'"
				@click="uiStore.toggleSidebar"
			>
				<i
					:class="isSidebarCollapsed ? 'pi pi-chevron-right' : 'pi pi-chevron-left'"
					class="text-xs"
				/>
			</button>
		</div>

		<!-- Navigation -->
		<nav class="flex-1 py-3">
			<ul class="space-y-1">
				<li
					v-for="module in modulesList"
					:key="module.key"
				>
					<!-- Module row -->
					<div
						class="w-full flex items-center px-3 py-2 text-sm rounded-xl transition-colors cursor-pointer
						       app-nav-item app-nav-hover"
						:class="isActiveRoute(module) && 'app-nav-item-active'"
						@click="handleModuleClick(module)"
					>
						<div class="flex items-center gap-2 flex-1">
							<component v-if="appIconSet[module.key]"
								:is="appIconSet[module.key]"
							/>
							<span
								v-if="!isSidebarCollapsed"
								class="truncate"
							>
								{{ module.title }}
							</span>
						</div>

						<!-- Chevron (children indicator) -->
						<i
							v-if="!isSidebarCollapsed && hasSidebarChildren(module)"
							:class="[
								'pi text-[8px]',
								openModuleKey === module.key ? 'pi-chevron-down' : 'pi-chevron-right'
							]"
						/>
					</div>

					<!-- Children -->
					<ul
						v-if="
							!isSidebarCollapsed &&
							openModuleKey === module.key &&
							hasSidebarChildren(module)
						"
						class="mt-1 space-y-1 pl-8"
					>
						<li
							v-for="child in module.getChildren()"
							:key="child.key"
						>
							<button
								type="button"
								class="w-full text-left text-xs px-2 py-1 rounded-lg truncate
								       app-subitem app-nav-hover"
								:class="isActiveChild(child) && 'app-subitem-active'"
								@click="handleChildClick(module, child)"
							>
								{{ child.label }}
							</button>
						</li>
					</ul>
				</li>
			</ul>
		</nav>
		<div class="mt-auto flex items-end justify-start px-2 pb-4" >
			<img
				src="@/assets/atip-grey-vertical.png"
				alt="App Vertical"
				class="w-16 h-auto opacity-50"
			/>
		</div>
	</aside>
</template>


<style scoped>
/* Base container */
.app-sidebar-root {
	background: var(--p-app-sidebar-background);
	color: var(--p-app-sidebar-text);
	border-right: 1px solid var(--p-content-border-color);
}

/* Title */
.app-sidebar-title {
	color: var(--p-text-muted-color);
}

/* Items */
.app-nav-item {
	color: var(--p-app-sidebar-text);
}

.app-nav-item-active {
	background-color: var(--p-primary-100);
	color: var(--p-primary-color);
}

.app-subitem-active {
	background-color: var(--p-primary-100);
	color: var(--p-primary-color);
	font-weight: 500;
	box-shadow: inset 2px 0 0 var(--p-primary-color);
}

.app-subitem {
}

.app-nav-hover:hover {
	background-color: var(--p-surface-100);
	color: var(--p-text-color);
}
</style>
