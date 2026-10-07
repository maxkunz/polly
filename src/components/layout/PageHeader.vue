<script setup lang="ts">
import { appIconSet } from "@/components/icons/appIconSet";

const property = withDefaults(defineProps<{
	title: string;
	iconKey: string;
	color?: string;
	size?: "compact" | "normal";
	/** Element des Titels, z. B. "h1" für die Seitenüberschrift (Barrierefreiheit) */
	titleTag?: string;
	titleId?: string;
}>(), {
	color: "#6B7280",
	titleTag: "div"
});

</script>

<template>
	<div class="flex items-center">
		<!-- Icon circle -->
		<div
            class="flex items-center justify-center rounded-full shrink-0 shadow-md z-30"
            :style="{
                background: `linear-gradient(
                    135deg,
                    color-mix(in srgb, ${property.color} 90%, white),
                    color-mix(in srgb, ${property.color} 70%, black)
                )`,
                width: property.size === 'compact' ? '2.5rem' : '3rem',
                height: property.size === 'compact' ? '2.5rem' : '3rem'
            }"
        >
			<component
				:is="appIconSet[property.iconKey]"
				:class="[property.size === 'compact' ? 'md' : 'lg', 'white']"
			/>
		</div>

		<!-- Title -->
		<component
			:is="property.titleTag"
			:id="property.titleId"
			class="-ml-4 pl-6 px-4 py-2 rounded-lg font-semibold shadow-md leading-none"
			:class="property.size === 'compact' ? 'text-lg' : 'text-xl'"
			:style="{
				color: property.color,
				backgroundColor: `color-mix(in srgb, ${property.color} 15%, white)`
			}"
		>
			{{ property.title }}
		</component>
	</div>
</template>


<style scoped>

</style>
