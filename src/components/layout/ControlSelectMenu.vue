<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "primevue/button";
import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import type { ControlBarSelectOption } from "@/stores/controlBarStore";

const props = defineProps<{
	options: ControlBarSelectOption[];
	modelValue: string;
	placeholder?: string;
	disabled?: boolean;
	icon?: string;
}>();

const emit = defineEmits<{
	(e: "update:modelValue", value: string): void;
}>();

const menuRef = ref<InstanceType<typeof Menu> | null>(null);

const label = computed(() => {
	const selected = props.options.find(option => option.value === props.modelValue);
	return selected?.label ?? props.placeholder ?? "Auswahl";
});

const menuItems = computed<MenuItem[]>(() =>
	props.options.map(option => ({
		label: option.label,
		icon: option.value === props.modelValue ? "pi pi-check" : undefined,
		disabled: option.disabled,
		command: () => emit("update:modelValue", option.value)
	}))
);

function toggleMenu(event: Event): void {
	menuRef.value?.toggle(event);
}
</script>

<template>
	<div class="flex items-center">
		<Button
			size="small"
			severity="secondary"
			text
			:icon="icon ?? 'pi pi-sliders-h'"
			:label="label"
			:disabled="disabled"
			@click="toggleMenu"
		/>
		<Menu ref="menuRef" :model="menuItems" popup />
	</div>
</template>
