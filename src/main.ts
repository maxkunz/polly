import { createApp } from "vue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import { appTheme } from '@/theme/appTheme';

import { appIconSet } from "@/components/icons/appIconSet";
import App from "./App.vue";
import ConfirmationService from "primevue/confirmationservice";

import "primeicons/primeicons.css";
import "./assets/main.css";
import ToastService from "primevue/toastservice";

const app = createApp(App);
app.config.globalProperties.$appIconSet = appIconSet;
app.use(createPinia());
import router from "./router";

import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';

app.component('IconField', IconField);
app.component('InputIcon', InputIcon);

app.use(ToastService);
app.use(router);
app.use(ConfirmationService)

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
	}
});

app.mount("#app");
