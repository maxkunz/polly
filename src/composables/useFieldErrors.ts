import { computed, inject, provide, type ComputedRef, type InjectionKey, type Ref } from "vue";
import type { ValidationError } from "@/domain/survey/surveyValidator";

/** Meldungen je Feld-ID; ein leeres Array heißt: Feld nur markieren, es zeigt die Meldung selbst an. */
type FieldErrorMap = Map<string, string[]>;

const FIELD_ERRORS_KEY: InjectionKey<ComputedRef<FieldErrorMap>> = Symbol("fieldErrors");

/**
 * Stellt die Validierungsfehler allen Formularfeldern darunter zur Verfügung.
 * Sichtbar werden sie erst, wenn `visible` gesetzt ist (nach dem ersten Speicherversuch).
 */
export function provideFieldErrors(errors: Ref<ValidationError[]>, visible: Ref<boolean>): void {
	const byField = computed(() => {
		const map: FieldErrorMap = new Map();
		if (!visible.value) return map;
		for (const error of errors.value) {
			if (!error.fieldId) continue;
			const messages = map.get(error.fieldId) ?? [];
			if (!error.shownByField) messages.push(error.message);
			map.set(error.fieldId, messages);
		}
		return map;
	});
	provide(FIELD_ERRORS_KEY, byField);
}

export function fieldErrorId(fieldId: string): string {
	return `${fieldId}_error`;
}

/** Fehlerzustand der Formularfelder. Ohne provideFieldErrors ist kein Feld fehlerhaft. */
export function useFieldErrors() {
	const byField = inject(FIELD_ERRORS_KEY, null);

	function hasError(fieldId: string): boolean {
		return byField?.value.has(fieldId) ?? false;
	}

	function errorMessages(fieldId: string): string[] {
		return byField?.value.get(fieldId) ?? [];
	}

	/** ID der angezeigten Meldung für aria-describedby; undefined, wenn keine angezeigt wird. */
	function errorId(fieldId: string): string | undefined {
		return errorMessages(fieldId).length > 0 ? fieldErrorId(fieldId) : undefined;
	}

	return { hasError, errorMessages, errorId };
}

function scrollAndFocus(element: HTMLElement): void {
	const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
	element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
	element.focus({ preventScroll: true });
}

/** Scrollt zum Feld und setzt den Fokus. false, wenn das Feld nicht im DOM ist. */
export function focusField(fieldId: string): boolean {
	const element = document.getElementById(fieldId);
	if (!element) return false;
	scrollAndFocus(element);
	return true;
}

/**
 * Fokussiert unter den angegebenen Feldern das im Formular oberste. Maßgeblich ist die
 * Reihenfolge im DOM, nicht die der Fehlerliste. false, wenn keines der Felder im DOM ist.
 */
export function focusTopmostField(fieldIds: string[]): boolean {
	const elements = fieldIds
		.map(id => document.getElementById(id))
		.filter((element): element is HTMLElement => element !== null);
	if (elements.length === 0) return false;

	const topmost = elements.reduce((top, element) =>
		top.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING ? element : top
	);
	scrollAndFocus(topmost);
	return true;
}
