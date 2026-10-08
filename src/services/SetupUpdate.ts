import { useAppStore } from "@/stores/appStore";
import { applyFlowPlaceholders, importFlow } from "@/services/SetupOrchestrator";
import botFlowTemplate from "@/templates/genesys/botFlowStructure.yaml?raw";

export async function updateInstalledBotFlow(onProgress: (msg: string) => void = () => {}): Promise<void> {
	const app = useAppStore();
	const setup = app.domain.meta.setup;
	if (!setup?.botFlow?.id) {
		throw new Error("No installed bot flow found in the setup metadata.");
	}
	const accessToken = app.genesys.accessToken?.trim();
	const region = app.genesys.region?.trim();
	if (!accessToken || !region) {
		throw new Error("Flow update requires an authenticated Genesys session and region.");
	}

	const replacements: Record<string, string> = {
		BOTFLOW_NAME: setup.botFlow.name,
		DIVISION_NAME: setup.division?.name,
		DATA_TABLE_NAME: setup.dataTable?.name,
		MAPPING_DATA_TABLE_NAME: setup.mappingDataTable?.name,
		INTEGRATION_NAME: setup.dataAction?.category || "survey",
		DA_PREFIX: setup.projectTag,
	};
	for (const [key, value] of Object.entries(replacements)) {
		if (typeof value !== "string" || !value.trim()) {
			throw new Error(`Missing setup value for ${key}.`);
		}
	}

	// Architect ordnet den YAML-Import über Namen und Division zu.
	// Vorher prüfen, dass diese Metadaten weiterhin zum installierten Flow gehören.
	app.initGenesysClients();
	const existingFlow = await app.genesys.architectApi.getFlow(setup.botFlow.id);
	if (existingFlow.name !== setup.botFlow.name || existingFlow.division?.id !== setup.division?.id) {
		throw new Error("The installed bot flow no longer matches the setup name or division.");
	}

	const flowId = await importFlow(
		applyFlowPlaceholders(botFlowTemplate, replacements),
		{ id: setup.botFlow.id, name: setup.botFlow.name },
		window.location.origin,
		{ Authorization: `Bearer ${accessToken}`, "x-genesys-region": region, "Content-Type": "application/json" },
		onProgress
	);
	if (flowId !== setup.botFlow.id) {
		throw new Error(`Architect returned a different flow ID while updating ${setup.botFlow.name}.`);
	}
}
