<script setup lang="ts">

const property = withDefaults(defineProps<{
	title: string;
	iconKey: string;
	color?: string;
}>(), {
	color: "#6B7280"
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
                width: '3rem',
                height: '3rem'
            }"
        >
			<component
				:is="$appIconSet[property.iconKey]"
				class="lg white"
			/>
		</div>

		<!-- Title -->
            <div
			class="-ml-4 pl-6 px-4 py-2 rounded-lg font-semibold text-xl shadow-md leading-none"
			:style="{
				color: property.color,
				backgroundColor: `color-mix(in srgb, ${property.color} 15%, white)`
			}"
		>
			{{property.title }}
		</div>
	</div>
</template>


<style scoped>

</style>
