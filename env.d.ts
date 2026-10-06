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

	// Per `define` in vite.config.ts aus der Umgebungsvariable GENESYS_REGION gesetzt.
	const __GENESYS_REGION__: string;
}

export {};