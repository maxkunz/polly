// src/icons/appIconSet.ts
import type { FunctionalComponent } from "vue";
import { h } from "vue";
import {
	HomeIcon,
	PlusIcon,
	TrashIcon,
	ArrowPathIcon
} from "@heroicons/vue/24/outline";

/**
 * Wrapper for Heroicons to enforce a consistent size/class.
 * `size` accepts a number (treated as rem) or any CSS size string. If omitted, uses CSS default via .app-icon.
 */
function createHeroIconComponent(Icon: FunctionalComponent, size?: string | number): FunctionalComponent {
	const dim = size === undefined ? undefined : typeof size === "number" ? `${size}rem` : size;
	return () =>
		h(Icon, {
			class: "app-icon",
			style: dim ? { "--app-icon-size": dim } : undefined
		});
}

/**
 * Small wrapper to use a PrimeIcon ("pi pi-*") as a Vue functional component.
 * `size` accepts a number (treated as rem) or any CSS size string. If omitted, uses CSS default via .app-icon.
 */
function createPrimeIconComponent(piClass: string, size?: string | number): FunctionalComponent {
	const fontSize = size === undefined ? undefined : typeof size === "number" ? `${size}rem` : size;

	return () =>
		h("i", {
			class: `pi ${piClass} app-icon`,
			style: {
				lineHeight: "1em",
				...(fontSize ? { "--app-icon-size": fontSize, fontSize } : {})
			},
			"aria-hidden": "true"
		});
}

/**
 * App Icon Set
 * Keys MUST match moduleMeta.key (and action identifiers).
 */
export const appIconSet: Record<string, FunctionalComponent> = {
	dashboard: createHeroIconComponent(HomeIcon),
	questions: createPrimeIconComponent("pi-list-check"),
	surveys: createPrimeIconComponent("pi-poll"),
	settings: createPrimeIconComponent("pi-cog"),
	add: createHeroIconComponent(PlusIcon),
	delete: createHeroIconComponent(TrashIcon),
	reload: createHeroIconComponent(ArrowPathIcon)
};
