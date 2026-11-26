import assert from "node:assert/strict";
import {
	belongsToInstallation,
	installationDatatableIds,
	otherInstallationRedirectUris,
	replaceInstallationRedirectUris,
	restoreInstallationRedirectUris
} from "../src/domain/setup/redirectUris";

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

const CTX = "gcHostOrigin=https%3A%2F%2Fapps.mypurecloud.de&gcTargetEnv=prod&client_id=c1";
const WEB = "https://web.app1.amplifyapp.com";
const MAIN = "https://main.app1.amplifyapp.com";
const webSetup = `${WEB}/?${CTX}`;
const webLaunch = (dt: string) => `${WEB}/?${CTX}&datatable_id=${dt}&mapping_datatable_id=m-${dt}`;
const mainLaunch = `${MAIN}/?${CTX}&datatable_id=dt-main&mapping_datatable_id=m-main`;

test("Setup ersetzt den Setup-Link der eigenen Domain und behält andere Branches", () => {
	const result = replaceInstallationRedirectUris([mainLaunch, webSetup], webLaunch("dt-web"), {
		appUrl: webLaunch("dt-web"),
		datatableIds: ["dt-web"]
	});
	assert.deepEqual(result, [mainLaunch, webLaunch("dt-web")]);
});

test("Setup behält eine andere Installation derselben Domain (andere datatable_id)", () => {
	const result = replaceInstallationRedirectUris([webLaunch("dt-alt")], webLaunch("dt-neu"), {
		appUrl: webLaunch("dt-neu"),
		datatableIds: ["dt-neu"]
	});
	assert.deepEqual(result, [webLaunch("dt-alt"), webLaunch("dt-neu")]);
});

test("Uninstall entfernt nur die eigene Launch-URL und ergänzt den Setup-Link", () => {
	const result = replaceInstallationRedirectUris([mainLaunch, webLaunch("dt-web"), webLaunch("dt-alt")], webSetup, {
		appUrl: webSetup,
		datatableIds: ["dt-web"]
	});
	assert.deepEqual(result, [mainLaunch, webLaunch("dt-alt"), webSetup]);
});

test("Leere oder fehlende Liste ergibt nur den neuen Eintrag, ohne Dubletten", () => {
	const scope = { appUrl: webSetup, datatableIds: [] };
	assert.deepEqual(replaceInstallationRedirectUris(undefined, webSetup, scope), [webSetup]);
	assert.deepEqual(replaceInstallationRedirectUris([mainLaunch, mainLaunch], webSetup, scope), [mainLaunch, webSetup]);
});

test("Anderer Pfad auf derselben Domain gehört nicht zur Installation", () => {
	const scope = { appUrl: webSetup, datatableIds: ["dt-web"] };
	assert.equal(belongsToInstallation(`${WEB}/other/?${CTX}`, scope), false);
	assert.equal(belongsToInstallation(`${WEB}?${CTX}`, scope), true);
	assert.equal(belongsToInstallation("kein url", scope), false);
});

test("Integrations-URL ohne Schema wird erkannt", () => {
	const scope = { appUrl: webSetup, datatableIds: ["dt-web"] };
	assert.equal(belongsToInstallation(`web.app1.amplifyapp.com/?${CTX}&datatable_id=dt-web`, scope), true);
	assert.equal(belongsToInstallation(mainLaunch, scope), false);
});

test("Datatable-IDs kommen aus meta.setup und der Launch-URL", () => {
	assert.deepEqual(installationDatatableIds({ dataTable: { id: "dt-web" }, launchUrl: webLaunch("dt-web") }), ["dt-web"]);
	assert.deepEqual(installationDatatableIds({ dataTable: { id: "" }, launchUrl: webLaunch("dt-web") }), ["dt-web"]);
	assert.deepEqual(installationDatatableIds(undefined), []);
});

test("Rollback holt nur die eigenen Einträge zurück und behält Einträge, die andere Branches inzwischen ergänzt haben", () => {
	// Gesichert vor dem Setup: [mainSetup, webSetup]; während des Setups hat main seinen Launch-Link gesetzt
	const mainSetup = `${MAIN}/?${CTX}`;
	const original = [mainSetup, webSetup];
	const current = [mainLaunch, webLaunch("dt-web")];
	const result = restoreInstallationRedirectUris(current, original, { appUrl: webLaunch("dt-web"), datatableIds: ["dt-web"] });
	assert.deepEqual(result, [mainLaunch, webSetup]);
});

test("Rollback ohne gesicherten Stand entfernt nur die eigenen Einträge", () => {
	const result = restoreInstallationRedirectUris([mainLaunch, webLaunch("dt-web")], undefined, { appUrl: webSetup, datatableIds: ["dt-web"] });
	assert.deepEqual(result, [mainLaunch]);
});

test("Fremde Einträge derselben App werden erkannt, andere Domains und eigene nicht", () => {
	const scope = { appUrl: webLaunch("dt-neu"), datatableIds: ["dt-neu"] };
	const current = [mainLaunch, webSetup, webLaunch("dt-alt"), webLaunch("dt-neu"), `${WEB}/other/?${CTX}&datatable_id=x`];
	assert.deepEqual(otherInstallationRedirectUris(current, scope), [webLaunch("dt-alt")]);
	assert.deepEqual(otherInstallationRedirectUris(undefined, scope), []);
});

console.log(`\n${passed} Tests bestanden`);
