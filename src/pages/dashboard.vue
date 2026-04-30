<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import Card from "primevue/card";
import PageHeader from "@/components/layout/PageHeader.vue";
import { moduleRegistry } from "@/app/modules";

const router = useRouter();
const { selectModules } = moduleRegistry();

function navigateTo(moduleKey: string): void {
	router.push({ name: moduleKey });
}

/* =========================================================
 * Dashboard Modules (active + column > 0)
 * ======================================================= */
const columnModules = (column: number) =>
	selectModules({
		page: true,
		dashboardColumn: column,
		activeCheck: true
	});

</script>

<template>
	<section class="min-h-full">
		<h1 class="w-full max-w-6xl mx-auto px-4 py-10 text-3xl font-semibold text-gray-700">
			Dashboard
		</h1>
		<div
			class="w-full max-w-6xl mx-auto px-4 py-6
			       grid grid-cols-1 md:grid-cols-4 gap-9"
		>
			<div
				v-for="column in [1, 2, 3, 4]"
				:key="column"
				class="flex flex-col gap-9"
			>
				<Card
					v-for="module in columnModules(column)"
					:key="module.key"
					class="w-full cursor-pointer transition-transform transition-shadow hover:-translate-y-1.5 hover:shadow-lg"
					@click="navigateTo(module.key)"
				>
					<template #title>
						<div class="mb-2 -ml-8 -mt-8">
							<PageHeader
								:title="module.title"
								:iconKey="module.key"
								:color="module.color"
								size="compact"
							/>
						</div>
					</template>

					<template #content>
						<p
							class="text-sm text-[var(--text-muted-color)] text-center leading-relaxed"
						>
							{{ module.description }}
						</p>
					</template>
				</Card>
			</div>
		</div>
	</section>
</template>

<style scoped>
/* Dashboard nutzt bewusst keine eigenen Card-Overrides.
   PrimeVue + Aura Theme bleiben führend. */
</style>
