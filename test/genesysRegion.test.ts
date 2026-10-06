import assert from "node:assert/strict";
import platformClient from "purecloud-platform-client-v2";
import { GENESYS_REGIONS, isGenesysRegion } from "../amplify/functions/shared/genesys_regions";
import { regionFromHostOrigin } from "../src/services/genesysRegion";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
	try {
		await fn();
		passed++;
		console.log(`ok - ${name}`);
	} catch (error) {
		console.error(`FAIL - ${name}`);
		throw error;
	}
}

// tenant_auth liest TENANTS_TABLE_NAME beim Import
process.env.TENANTS_TABLE_NAME = "tenants-test";
const { getGenesysRegion, resolveTenantFromGenesysToken, DEFAULT_GENESYS_REGION } = await import(
	"../amplify/functions/shared/tenant_auth"
);

await test("Backend-Regionsliste entspricht PureCloudRegionHosts des SDK", () => {
	const sdkRegions = Object.values((platformClient as any).PureCloudRegionHosts as Record<string, string>);
	assert.deepEqual([...GENESYS_REGIONS].sort(), [...sdkRegions].sort());
});

await test("isGenesysRegion akzeptiert nur bekannte Regionen", () => {
	assert.equal(isGenesysRegion("usw2.pure.cloud"), true);
	assert.equal(isGenesysRegion(" MyPureCloud.DE "), true);
	assert.equal(isGenesysRegion("angreifer.example"), false);
	assert.equal(isGenesysRegion("mypurecloud.de.angreifer.example"), false);
	assert.equal(isGenesysRegion(undefined), false);
});

await test("getGenesysRegion: Header, Default, ungültiger Header", () => {
	assert.equal(getGenesysRegion({ headers: { "x-genesys-region": "euw2.pure.cloud" } }), "euw2.pure.cloud");
	assert.equal(getGenesysRegion({ headers: {} }), DEFAULT_GENESYS_REGION);
	assert.equal(getGenesysRegion({ headers: { "x-genesys-region": "  " } }), DEFAULT_GENESYS_REGION);
	assert.equal(getGenesysRegion({ headers: { "x-genesys-region": "angreifer.example" } }), undefined);
});

await test("Unbekannte Region wird abgelehnt, ohne fremden Host aufzurufen", async () => {
	const original = globalThis.fetch;
	let called = false;
	globalThis.fetch = (async () => {
		called = true;
		return new Response("{}", { status: 200 });
	}) as typeof fetch;
	try {
		const result = await resolveTenantFromGenesysToken({
			headers: { authorization: "Bearer abc", "x-genesys-region": "angreifer.example" },
		});
		assert.equal(result.error, "Unsupported Genesys region");
		assert.equal(called, false);
	} finally {
		globalThis.fetch = original;
	}
});

await test("regionFromHostOrigin liest die Region aus gcHostOrigin", () => {
	assert.equal(regionFromHostOrigin("https://apps.usw2.pure.cloud"), "usw2.pure.cloud");
	assert.equal(regionFromHostOrigin("https://apps.mypurecloud.de"), "mypurecloud.de");
	assert.equal(regionFromHostOrigin("apps.mypurecloud.com.au"), "mypurecloud.com.au");
	assert.equal(regionFromHostOrigin("https://apps.angreifer.example"), undefined);
	assert.equal(regionFromHostOrigin(null), undefined);
	assert.equal(regionFromHostOrigin("kein url"), undefined);
});

console.log(`${passed} Tests bestanden`);
