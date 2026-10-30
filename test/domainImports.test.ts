import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Die reinen Domain-Module werden von den Lambdas gebündelt (esbuild ab Repo-Root). Dort gibt es
 * weder den Alias `@/` (ampx prüft mit amplify/tsconfig.json, auch bei `import type`) noch Vue oder
 * vue-i18n. Geprüft wird deshalb die gesamte Importkette: nur relative Importe sind erlaubt.
 */

let passed = 0;

function test(name: string, fn: () => void): void {
	try {
		fn();
		passed++;
		console.log(`ok - ${name}`);
	} catch (error) {
		console.error(`FAIL - ${name}`);
		throw error;
	}
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Module, die serverseitig (Lambdas, MCP) nutzbar sein müssen. */
const ENTRY_MODULES = [
	"src/domain/survey/surveyRules.ts",
	"src/domain/survey/flowTranslator.ts",
	"src/domain/survey/flowPayload.ts",
	"src/domain/survey/surveyLock.ts",
	"src/domain/survey/surveyTypes.ts",
	"src/domain/survey/surveyRow.ts",
	"src/domain/survey/flowNavigation.ts",
	"src/domain/survey/invitationLinks.ts",
	"src/domain/webTheme/webTheme.ts",
	"src/domain/permissions/roleCheck.ts",
	"src/constants/surveyConstants.ts"
];

// import … from "x", import "x", export … from "x", import("x") – auch mehrzeilig und mit `import type`
const SPECIFIER_PATTERN = /(?:^|[^.\w$])(?:import|export)\s*(?:type\s+)?(?:[^'"`;]*?\sfrom\s*)?\(?\s*["']([^"']+)["']/gm;

function importSpecifiers(source: string): string[] {
	const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
	return [...withoutComments.matchAll(SPECIFIER_PATTERN)].map(match => match[1]);
}

function resolveModule(fromFile: string, specifier: string): string {
	const base = resolve(dirname(fromFile), specifier);
	const candidates = [base, `${base}.ts`, resolve(base, "index.ts")];
	const found = candidates.find(candidate => candidate.endsWith(".ts") && existsSync(candidate));
	assert.ok(found, `${relative(ROOT, fromFile)}: Import "${specifier}" nicht auflösbar`);
	return found;
}

/** Läuft die Importkette ab und liefert Verstöße als "Kette -> Import". */
function findViolations(entry: string): { files: Set<string>; violations: string[] } {
	const files = new Set<string>();
	const violations: string[] = [];
	const visit = (file: string, chain: string[]) => {
		if (files.has(file)) return;
		files.add(file);
		const path = [...chain, relative(ROOT, file)];
		for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
			if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
				violations.push(`${path.join(" -> ")} -> "${specifier}"`);
				continue;
			}
			visit(resolveModule(file, specifier), path);
		}
	};
	visit(resolve(ROOT, entry), []);
	return { files, violations };
}

test("Importerkennung findet alle Formen und ignoriert Kommentare", () => {
	const source = [
		`import { a } from "./a";`,
		`import type { B } from "@/b";`,
		`import {`,
		`\tc,`,
		`\td`,
		`} from "vue";`,
		`import "./side-effect";`,
		`export { e } from "../e";`,
		`export type { F } from "vue-i18n";`,
		`const lazy = () => import("./lazy");`,
		`// import { x } from "@/kommentar";`,
		`/* import { y } from "@/block"; */`,
		`const text = "import nicht";`
	].join("\n");
	assert.deepEqual(importSpecifiers(source), ["./a", "@/b", "vue", "./side-effect", "../e", "vue-i18n", "./lazy"]);
});

for (const entry of ENTRY_MODULES) {
	test(`${entry}: nur relative Importe in der ganzen Kette`, () => {
		const { violations } = findViolations(entry);
		assert.deepEqual(violations, []);
	});
}

test("Gegenprobe: der Frontend-Adapter surveyValidator.ts verstößt (über @/i18n)", () => {
	const { violations } = findViolations("src/domain/survey/surveyValidator.ts");
	assert.ok(violations.some(violation => violation.endsWith(`"@/i18n"`)), violations.join("\n"));
});

test("Die Kette der Prüfregeln enthält keinen Frontend-Adapter", () => {
	const { files } = findViolations("src/domain/survey/surveyRules.ts");
	const names = [...files].map(file => relative(ROOT, file));
	for (const adapter of ["src/domain/survey/surveyValidator.ts", "src/services/surveyFlowTranslator.ts", "src/i18n/index.ts"]) {
		assert.ok(!names.includes(adapter), adapter);
	}
});

console.log(`\n${passed} Tests bestanden`);
