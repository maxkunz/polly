<script setup lang="ts">
import Message from "primevue/message";

defineProps<{
	show: boolean;
	errors: Array<{ message: string; fieldId?: string }>;
}>();
</script>

<template>
	<div v-if="show && errors.length > 0" role="alert" aria-live="assertive">
		<Message severity="error" :closable="false">
			<div class="space-y-1">
				<div class="font-bold text-sm">Bitte beheben Sie folgende Fehler:</div>
				<ul class="list-disc list-inside text-xs space-y-0.5">
					<li v-for="(err, i) in errors" :key="i">
						{{ err.message }}
					</li>
				</ul>
			</div>
		</Message>
	</div>
</template>
