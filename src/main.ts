import { createApp } from "vue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import { Buffer } from "buffer";
import { appTheme } from '@/theme/appTheme';

import { appIconSet } from "@/components/icons/appIconSet";
import App from "./App.vue";
import ConfirmationService from "primevue/confirmationservice";
import Tooltip from "primevue/tooltip";

import "primeicons/primeicons.css";
import "./assets/main.css";
import ToastService from "primevue/toastservice";
import { i18n, initialLocale, primevueLocaleFor } from "@/i18n";

const GENESYS_ORIGINAL_URL_KEY = "polly.genesys.originalUrl";

if (!globalThis.Buffer) {
	globalThis.Buffer = Buffer;
}

try {
	const launchUrl = new URL(window.location.href);
	const params = launchUrl.searchParams;
	if (params.has("client_id") && !params.has("code") && !params.has("error")) {
		const rememberedUrl = sessionStorage.getItem(GENESYS_ORIGINAL_URL_KEY);
		const previousLaunch = rememberedUrl ? new URL(rememberedUrl) : null;
		// Polly verwendet interne Routen; deren Reload behält die registrierte Start-URI.
		const isInternalRouteReload = previousLaunch?.origin === launchUrl.origin &&
			previousLaunch.pathname !== launchUrl.pathname &&
			previousLaunch.searchParams.toString() === params.toString();
		if (!isInternalRouteReload) {
			launchUrl.hash = "";
			sessionStorage.setItem(GENESYS_ORIGINAL_URL_KEY, launchUrl.toString());
		}
	}
} catch (error) {
	console.warn("Could not persist original Genesys URL", error);
}

if (typeof document !== "undefined") {
	document.documentElement.lang = initialLocale;
}

const app = createApp(App);
app.config.globalProperties.$appIconSet = appIconSet;
app.use(createPinia());
app.use(i18n);
import router from "./router";

import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';

app.component('IconField', IconField);
app.component('InputIcon', InputIcon);

app.use(ToastService);
app.use(router);
app.use(ConfirmationService)
app.directive("tooltip", Tooltip);

app.use(PrimeVue, {
	theme: {
		preset: appTheme,
		options: {
			prefix: "p",
			darkModeSelector: false, //"system",
			cssLayer: false
		}
	},
	icon: {
		sets: {
			app: appIconSet
		}
	},
	locale: primevueLocaleFor(initialLocale)
});

app.mount("#app");
