import { createRouter, createWebHistory } from "vue-router";
import { moduleRegistry } from "@/app/modules";

export function createAppRouter() {
	const { selectModules } = moduleRegistry();

	const moduleRoutes = selectModules({ page: true, activeCheck: false }).map(module => ({
		path: `/${module.key}`,
		name: module.key,
		component: () => import(`@/pages/${module.key}.vue`)
	}));

	return createRouter({
		history: createWebHistory(),
		routes: [
			{
				path: "/setup",
				name: "setup",
				component: () => import("@/pages/SetupOrchestrator.vue")
			},
			{
				path: "/uninstall",
				name: "uninstall",
				component: () => import("@/pages/SetupUninstall.vue")
			},
			{
				path: "/",
				redirect: { name: "dashboard" }
			},
			...moduleRoutes
		]
	});
}

const router = createAppRouter();
export default router;
