/// <reference types="vite/client" />

import { Component } from "vue";
import { oraIconSet } from "@/components/icons/oraIconSet";

declare module "@vue/runtime-core" {
	interface ComponentCustomProperties {
		$oraIconSet: typeof oraIconSet;
	}
}


declare global {
	interface Window {
		app: any;
	}
}

export {};