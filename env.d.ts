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

	interface ImportMetaEnv {
		// Pfad-Präfix des eigenen Backends pro Branch, siehe constants/apiConstants.ts. Default "/api".
		readonly VITE_API_PREFIX?: string;
	}
}

export {};