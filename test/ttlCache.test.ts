import assert from "node:assert/strict";
import { TtlCache } from "../amplify/functions/shared/ttl_cache";

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

/** Ersetzt `Date.now` für die Dauer von `run`. */
function withNow(clock: { now: number }, run: () => void): void {
	const original = Date.now;
	Date.now = () => clock.now;
	try {
		run();
	} finally {
		Date.now = original;
	}
}

await test("TtlCache: liefert den Wert bis zum Ablauf, danach undefined", () => {
	const clock = { now: 1000 };
	withNow(clock, () => {
		const cache = new TtlCache<string>({ ttlMs: 100 });
		assert.equal(cache.set("a", "x"), "x");
		clock.now = 1099;
		assert.equal(cache.get("a"), "x");
		clock.now = 1100;
		assert.equal(cache.get("a"), undefined);
		assert.equal(cache.size, 0);
	});
});

await test("TtlCache: Lebensdauer pro Eintrag, <= 0 und NaN werden nicht gemerkt", () => {
	const clock = { now: 0 };
	withNow(clock, () => {
		const cache = new TtlCache<number>({ ttlMs: 100 });
		cache.set("lang", 1, 1000);
		assert.equal(cache.set("abgelaufen", 2, -5), 2);
		cache.set("nan", 3, Number.NaN);
		cache.set("unendlich", 4, Number.POSITIVE_INFINITY);
		assert.equal(cache.size, 1);
		clock.now = 500;
		assert.equal(cache.get("lang"), 1);
		assert.equal(cache.get("abgelaufen"), undefined);
		assert.equal(cache.get("nan"), undefined);
	});
});

await test("TtlCache: ttlMs <= 0 verwirft einen vorhandenen Eintrag", () => {
	const cache = new TtlCache<number>({ ttlMs: 60_000 });
	cache.set("a", 1);
	cache.set("a", 2, 0);
	assert.equal(cache.get("a"), undefined);
	assert.equal(cache.size, 0);
});

await test("TtlCache: bei voller Größe den ältesten Eintrag verwerfen", () => {
	const cache = new TtlCache<number>({ ttlMs: 60_000, maxEntries: 2 });
	cache.set("a", 1);
	cache.set("b", 2);
	cache.set("c", 3);
	assert.equal(cache.size, 2);
	assert.equal(cache.get("a"), undefined);
	assert.equal(cache.get("b"), 2);
	assert.equal(cache.get("c"), 3);
});

await test("TtlCache: neu geschriebener Schlüssel zählt als jüngster Eintrag", () => {
	const cache = new TtlCache<number>({ ttlMs: 60_000, maxEntries: 2 });
	cache.set("a", 1);
	cache.set("b", 2);
	cache.set("a", 3);
	cache.set("c", 4);
	assert.equal(cache.get("a"), 3);
	assert.equal(cache.get("b"), undefined);
	assert.equal(cache.get("c"), 4);
});

await test("TtlCache: vorhandenen Schlüssel überschreiben leert den vollen Cache nicht", () => {
	const cache = new TtlCache<number>({ ttlMs: 60_000, maxEntries: 2 });
	cache.set("a", 1);
	cache.set("b", 2);
	cache.set("a", 3);
	assert.equal(cache.size, 2);
	assert.equal(cache.get("a"), 3);
	assert.equal(cache.get("b"), 2);
});

await test("TtlCache: delete und clear", () => {
	const cache = new TtlCache<number>({ ttlMs: 60_000 });
	cache.set("a", 1);
	cache.set("b", 2);
	cache.delete("a");
	assert.equal(cache.get("a"), undefined);
	cache.clear();
	assert.equal(cache.size, 0);
});

await test("TtlCache.getOrLoad: lädt einmal, danach Treffer auch bei falsy Werten", async () => {
	const cache = new TtlCache<number | undefined>({ ttlMs: 60_000 });
	let calls = 0;
	const load = async () => {
		calls++;
		return { value: 0 };
	};
	assert.equal(await cache.getOrLoad("a", load), 0);
	assert.equal(await cache.getOrLoad("a", load), 0);
	assert.equal(calls, 1);
});

await test("TtlCache.getOrLoad: fresh lädt neu und aktualisiert den Cache", async () => {
	const cache = new TtlCache<string>({ ttlMs: 60_000 });
	cache.set("a", "alt");
	assert.equal(await cache.getOrLoad("a", async () => ({ value: "neu" }), true), "neu");
	assert.equal(cache.get("a"), "neu");
});

await test("TtlCache.getOrLoad: ttlMs 0 liefert den Wert, merkt ihn aber nicht", async () => {
	const cache = new TtlCache<string>({ ttlMs: 60_000 });
	cache.set("a", "alt");
	assert.equal(await cache.getOrLoad("a", async () => ({ value: "fehler", ttlMs: 0 }), true), "fehler");
	assert.equal(cache.get("a"), undefined);
});

await test("TtlCache.getOrLoad: Fehler beim Laden lässt den Cache unverändert", async () => {
	const cache = new TtlCache<string>({ ttlMs: 60_000 });
	cache.set("a", "alt");
	await assert.rejects(
		cache.getOrLoad("a", async () => {
			throw new Error("kaputt");
		}, true),
		/kaputt/
	);
	assert.equal(cache.get("a"), "alt");
});

console.log(`${passed} Tests bestanden`);
