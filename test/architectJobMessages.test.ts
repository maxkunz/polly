import assert from "node:assert/strict";
import { summarizeArchitectJobMessages } from "../src/domain/setup/architectJobMessages";

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

const PERMISSION = "Unable to perform the requested action. You are missing the following permission(s): [architect:datatable:search]";
const body = JSON.stringify({ message: PERMISSION, code: "missing.permissions", status: 403 });

// Gekürzt aus einem echten Job mit fehlender Berechtigung
const missingPermissionJob = [
	{ type: "Error", text: `promise tracked by async tracker rejected.  Error: Request Error (403): ${PERMISSION} (missing.permissions). -- [ArchAsyncTracker]` },
	{ type: "Error", text: "find 'data table' by value of 'X_polly_surveys' - Failed to find item - status: 403 -- [ArchNetworkValueRetrieval]" },
	{ type: "Error", text: "could not find the 'data table' by name using the value 'X_polly_surveys'.", details: [{ type: "NetworkDiagnostic", responseBody: body }] },
	{ type: "Error", text: "setting the Archy exit code to 100" },
	{ type: "Error", text: "could not find the 'data table' by name using the value 'X_polly_mapping'.", details: [{ type: "NetworkDiagnostic", responseBody: body }] },
	{ type: "Error", text: "Error(s) encountered." },
	{ type: "Error", text: "Architect Scripting errors will be listed above." },
	{ type: "Error", text: "exit code: 100" }
];

test("API-Fehlertext aus der Netzwerkdiagnose wird bevorzugt und nur einmal gezeigt", () => {
	assert.equal(summarizeArchitectJobMessages(missingPermissionJob), PERMISSION);
});

test("ohne Diagnose: Texte bereinigt, Rauschen und Dubletten entfernt", () => {
	const result = summarizeArchitectJobMessages([
		{ type: "Error", text: "promise tracked by async tracker rejected.  Error: Flow is locked by another user. -- [ArchAsyncTracker]" },
		{ type: "Error", text: "Flow is locked by another user." },
		{ type: "Warning", text: "Nur eine Warnung" },
		{ type: "Error", text: "exit code: 100" }
	]);
	assert.equal(result, "Flow is locked by another user.");
});

test("Archy-Zusatz mit Sitzungsdaten wird abgeschnitten", () => {
	const result = summarizeArchitectJobMessages([
		{ type: "Error", text: "missing permission 'architect:ui:view'. -- [ArchSession, Environment:'prod', Host:'apps.mypurecloud.de', Region:'eu-central-1', ArchSessionId:'x']" }
	]);
	assert.equal(result, "missing permission 'architect:ui:view'.");
});

test("kaputter responseBody fällt auf die Texte zurück", () => {
	const result = summarizeArchitectJobMessages([
		{ type: "Error", text: "Etwas ging schief", details: [{ responseBody: "<html>" }] }
	]);
	assert.equal(result, "Etwas ging schief");
});

test("höchstens drei Ursachen", () => {
	const result = summarizeArchitectJobMessages(["a", "b", "c", "d"].map(text => ({ type: "Error", text })));
	assert.equal(result, "a\nb\nc");
});

test("leere oder fehlende Meldungen", () => {
	assert.equal(summarizeArchitectJobMessages(undefined), "Unknown error");
	assert.equal(summarizeArchitectJobMessages([{ type: "Error", text: "exit code: 100" }]), "Unknown error");
});

console.log(`${passed} Tests bestanden`);
