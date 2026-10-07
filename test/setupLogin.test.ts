import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";
import { useAppStore } from "../src/stores/appStore";
import platformClient from "purecloud-platform-client-v2";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Den echten App-Einstieg für den Browser bündeln; UI-Imports benötigen hier kein DOM.
const mainPath = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const startupBundle = await build({
	entryPoints: [mainPath], bundle: true, platform: "browser", format: "iife", write: false,
	plugins: [{
		name: "stub-ui-imports",
		setup(builder) {
			builder.onResolve({ filter: /.*/ }, args => {
				if (args.importer === mainPath && args.path !== "buffer") {
					return { path: args.path, namespace: "test-ui" };
				}
			});
			builder.onLoad({ filter: /.*/, namespace: "test-ui" }, () => ({
				contents: `
					export default {};
					export const createApp = () => ({ config: { globalProperties: {} }, use() {}, component() {}, mount() {} });
					export const createPinia = () => ({});
					export const appTheme = {}, appIconSet = {}, i18n = {}, initialLocale = "de";
					export const primevueLocaleFor = () => ({});
				`
			}));
		}
	}]
});
const startupSource = startupBundle.outputFiles[0].text;

const launchUrl = "https://polly.example/?gcHostOrigin=https%3A%2F%2Fapps.mypurecloud.de&gcTargetEnv=prod&client_id=setup-client";
const values = new Map<string, string>();
const sessionStorage = {
	getItem: (key: string) => values.get(key) ?? null,
	setItem: (key: string, value: string) => values.set(key, value),
	removeItem: (key: string) => values.delete(key)
};
Object.assign(globalThis, { sessionStorage });

function setLocation(url: string) {
	Object.assign(globalThis, {
		window: {
			location: new URL(url),
			history: {
				state: { position: 1 },
				replaceState: (_state: unknown, _title: string, nextUrl: string) => {
					window.location = new URL(nextUrl) as unknown as Location;
				}
			}
		}
	});
	vm.runInNewContext(startupSource, { window, sessionStorage, URL, console, Buffer: globalThis.Buffer });
}

function makeApp() {
	setActivePinia(createPinia());
	const app = useAppStore();
	const calls: Array<{ mode: string; clientId: string; redirectUri: string }> = [];
	const authSettings = { region: "", persist: false, storagePrefix: "" };
	const authenticate = async (mode: string, clientId: string, redirectUri: string) => {
		calls.push({ mode, clientId, redirectUri });
		// Simuliert das Entfernen der Query durch das Genesys-SDK.
		window.location = new URL(window.location.origin + window.location.pathname) as unknown as Location;
	};
	app.genesys.client = {
		setEnvironment(region: string) { authSettings.region = region; },
		setPersistSettings(persist: boolean, prefix: string) {
			authSettings.persist = persist;
			authSettings.storagePrefix = prefix;
		},
		setAccessToken() {},
		authData: { accessToken: "test-token" },
		loginPKCEGrant: (id: string, uri: string) => authenticate("pkce", id, uri)
	};
	app.genesys.usersApi = { getUsersMe: async () => ({ id: "user", name: "Test" }) };
	return { app, calls, authSettings };
}

// Ein neuer Setup-Aufruf darf weder Tabelle noch Redirect einer früheren Installation übernehmen.
values.set("gc_datatable_id", "old-table");
values.set("gc_redirect_uri", "https://old.example/?client_id=old-client&datatable_id=old-table");
setLocation(launchUrl);
let { app, calls, authSettings } = makeApp();
await app.initializeFromLocation();
assert.equal(app.datatableId, null);
assert.equal(values.has("gc_datatable_id"), false);
assert.deepEqual(calls, [{ mode: "pkce", clientId: "setup-client", redirectUri: launchUrl }]);
assert.equal(window.location.href, launchUrl);
assert.equal(app.genesys.accessToken, "test-token");
assert.deepEqual(authSettings, {
	region: "mypurecloud.de", persist: true, storagePrefix: "polly_genesys_setup-client_mypurecloud_de"
});

// Der Router kann vor App.onMounted von / nach /dashboard navigieren.
values.clear();
const unencodedLaunchUrl = "https://polly.example/?gcHostOrigin=https://apps.mypurecloud.de&gcTargetEnv=prod&client_id=setup-client";
setLocation(unencodedLaunchUrl);
window.location = new URL(unencodedLaunchUrl.replace("/?", "/dashboard?")) as unknown as Location;
({ app, calls } = makeApp());
await app.initializeFromLocation();
assert.equal(calls[0].redirectUri, unencodedLaunchUrl);

// Der Callback muss die Start-URI trotz abweichender Query-Kodierung exakt wiederverwenden.
setLocation(`${launchUrl}&code=one-time-code`);
({ app, calls } = makeApp());
await app.initializeFromLocation();
assert.equal(calls[0].redirectUri, unencodedLaunchUrl);

// Ab hier wieder ein neuer Einstieg mit der kodierten Start-URI.
setLocation(launchUrl);
({ app, calls } = makeApp());
await app.initializeFromLocation();

// Der OAuth-Callback behält dieselbe Redirect-URI; Code und State werden nicht weitergetragen.
setLocation(`${launchUrl}&code=one-time-code&state=oauth-state`);
({ app, calls } = makeApp());
await app.initializeFromLocation();
assert.equal(calls[0].redirectUri, launchUrl);
assert.equal(app.datatableId, null);
assert.equal(window.location.href, launchUrl);

// Ein Reload auf der internen Setup-Route verwendet weiterhin die registrierte Start-URI.
setLocation(launchUrl.replace("/?", "/setup?"));
({ app, calls } = makeApp());
await app.initializeFromLocation();
assert.equal(calls[0].redirectUri, launchUrl);
assert.equal(window.location.pathname, "/setup");

// Auch nach dem Entfernen der Query bleibt der vollständige Einstiegskontext verfügbar.
setLocation("https://polly.example/setup");
({ app, calls } = makeApp());
await app.initializeFromLocation();
assert.equal(calls[0].clientId, "setup-client");
assert.equal(calls[0].redirectUri, launchUrl);

// Der frühere URL-Schalter kann den PKCE-Login nicht mehr umstellen.
setLocation(`${launchUrl}&auth_mode=implicit`);
({ app, calls } = makeApp());
await app.initializeFromLocation();
assert.equal(calls[0].mode, "pkce");

// Region und Token-Speicher folgen gcHostOrigin und Client-ID wie in Ora.
setLocation(launchUrl.replace("mypurecloud.de", "usw2.pure.cloud").replace("setup-client", "other-client"));
({ app, calls, authSettings } = makeApp());
await app.initializeFromLocation();
assert.equal(app.genesys.region, "usw2.pure.cloud");
assert.equal(calls[0].clientId, "other-client");
assert.deepEqual(authSettings, {
	region: "usw2.pure.cloud", persist: true, storagePrefix: "polly_genesys_other-client_usw2_pure_cloud"
});

// Fehlender oder unpassender Regionskontext darf keinen Login in einer Standardregion auslösen.
for (const invalidUrl of [
	"https://polly.example/?client_id=setup-client",
	"https://polly.example/?client_id=setup-client&gcHostOrigin=https%3A%2F%2Fexample.com"
]) {
	setLocation(invalidUrl);
	({ app, calls } = makeApp());
	await assert.rejects(() => app.initializeFromLocation(), /gcHostOrigin/);
	assert.equal(calls.length, 0);
}

// Die echte SDK-Challenge im Browser-Kontext ausführen, ohne Nodes globales Buffer.
const browserStorage = new Map<string, string>();
const browserContext = vm.createContext({
	window: { crypto: webcrypto, location: new URL(launchUrl) },
	TextEncoder, URL, console,
	sessionStorage: {
		getItem: (key: string) => browserStorage.get(key) ?? null,
		setItem: (key: string, value: string) => browserStorage.set(key, value)
	}
});
const challengeMethod = (platformClient.ApiClient.instance as any).computePKCECodeChallenge.toString();
const computeChallenge = vm.runInContext(`({ ${challengeMethod} }).computePKCECodeChallenge`, browserContext);
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
await assert.rejects(() => computeChallenge(verifier), /Buffer is not defined/);

vm.runInContext(startupSource, browserContext);
assert.equal(await computeChallenge(verifier), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
assert.equal(browserStorage.get("polly.genesys.originalUrl"), launchUrl);

console.log("ok - Setup-Einstieg, Router-Start, PKCE-Callback, Reload und echte SDK-Challenge im Browser");
