import assert from "node:assert/strict";
import { deleteAllWebThemesOfTenant } from "../amplify/functions/shared/web_themes_table";

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

const TABLE = "themes";

/** Nachgebauter Client: Query liefert die Schlüssel (in Seiten zu 40), BatchWrite lässt optional Einträge unverarbeitet. */
function fakeClient(themeCount: number, unprocessedRounds = 0) {
	const keys = [
		...Array.from({ length: themeCount }, (_, i) => ({ tenantId: "t1", themeId: `theme-${i}` })),
		{ tenantId: "t1", themeId: "#revision" },
	];
	const deleted: string[] = [];
	const batchSizes: number[] = [];
	let rounds = unprocessedRounds;
	return {
		deleted,
		batchSizes,
		async send(command: any): Promise<any> {
			const name = command.constructor.name;
			const input = command.input;
			if (name === "QueryCommand") {
				assert.equal(input.ExpressionAttributeValues[":tenantId"], "t1");
				assert.ok(!input.ProjectionExpression.includes("revision"), "Projektion lässt den Verwaltungseintrag nicht aus");
				const start = input.ExclusiveStartKey ? Number(input.ExclusiveStartKey.offset) : 0;
				const end = Math.min(start + 40, keys.length);
				return { Items: keys.slice(start, end), LastEvaluatedKey: end < keys.length ? { offset: end } : undefined };
			}
			assert.equal(name, "BatchWriteCommand");
			const requests = input.RequestItems[TABLE] as { DeleteRequest: { Key: { themeId: string } } }[];
			batchSizes.push(requests.length);
			assert.ok(requests.length <= 25);
			if (rounds > 0) {
				rounds--;
				const [first, ...rest] = requests;
				rest.forEach((r) => deleted.push(r.DeleteRequest.Key.themeId));
				return { UnprocessedItems: { [TABLE]: [first] } };
			}
			requests.forEach((r) => deleted.push(r.DeleteRequest.Key.themeId));
			return {};
		},
	};
}

await test("löscht alle Designs und den Verwaltungseintrag #revision, in Stapeln zu höchstens 25", async () => {
	const client = fakeClient(50);
	const count = await deleteAllWebThemesOfTenant(TABLE, "t1", client);
	assert.equal(count, 51);
	assert.equal(new Set(client.deleted).size, 51);
	assert.ok(client.deleted.includes("#revision"));
	assert.deepEqual(client.batchSizes, [25, 25, 1]);
});

await test("unverarbeitete Einträge werden wiederholt", async () => {
	const client = fakeClient(3, 2);
	assert.equal(await deleteAllWebThemesOfTenant(TABLE, "t1", client, 0), 4);
	assert.equal(new Set(client.deleted).size, 4);
});

await test("bleiben Einträge dauerhaft unverarbeitet, wird geworfen", async () => {
	const client = fakeClient(3, 99);
	await assert.rejects(() => deleteAllWebThemesOfTenant(TABLE, "t1", client, 0), /Could not delete/);
});

await test("keine Einträge: kein BatchWrite", async () => {
	const client = fakeClient(0);
	client.send = async () => ({ Items: [] });
	assert.equal(await deleteAllWebThemesOfTenant(TABLE, "t1", client, 0), 0);
});

console.log(`${passed} Tests bestanden`);
