/// <reference types="vite/client" />

import { Component } from "vue";
import { appIconSet } from "@/components/icons/appIconSet";

declare module "@vue/runtime-core" {
	interface ComponentCustomProperties {
		$appIconSet: typeof appIconSet;
	}
}


declare global {
	interface Window {
		app: any;
	}
}

export {};