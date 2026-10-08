import { useAppStore } from "@/stores/appStore";

type FlowTemplateKind = "bot" | "inbound";

interface ExportConfig {
	flowId: string;
	flowName: string;
	flowType: string;
	version: string;
	fileName: string;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceYamlName(yaml: string, name: string, placeholder: string): string {
	// Ganze YAML-Namen ersetzen und vorhandene Quotes entfernen, da das Setup
	// vollständige Platzhalterwerte selbst quotet. Das Präfix nicht global ersetzen.
	const names = [JSON.stringify(name), `'${name.replace(/'/g, "''")}'`, name].map(escapeRegExp).join("|");
	return yaml
		.replace(new RegExp(`^([ \\t]*(?:-[ \\t]+)?(?:name|division):[ \\t]*)(?:${names})([ \\t]*(?:#.*)?)(?=\\r?$)`, "gm"),
			(_match, prefix, suffix) => `${prefix}${placeholder}${suffix}`)
		.replace(new RegExp(`^([ \\t]*)(?:${names})(:[ \\t]*(?:#.*)?)(?=\\r?$)`, "gm"),
			(_match, prefix, suffix) => `${prefix}${placeholder}${suffix}`);
}

export class BotFlowService {
	async registerExportJob(config: ExportConfig): Promise<string> {
		const data = await useAppStore().genesys.architectApi.postFlowsExportJobs({
			flows: [{
				exportType: "Yaml",
				flow: { id: config.flowId, name: config.flowName, type: config.flowType, version: config.version },
				fileName: config.fileName,
			}],
		});
		if (!data.id) throw new Error("Keine Export-Job-ID erhalten.");
		return data.id;
	}

	async getExportStatus(jobId: string): Promise<any> {
		return useAppStore().genesys.architectApi.getFlowsExportJob(jobId);
	}

	async runFullExport(config: ExportConfig): Promise<string> {
		const jobId = await this.registerExportJob(config);
		for (let attempts = 0; attempts < 42; attempts++) {
			const result = await this.getExportStatus(jobId);
			if (result.status === "Success" || result.status === "COMPLETED") {
				if (!result.downloadUrl) throw new Error("Keine Download-URL erhalten.");
				return result.downloadUrl;
			}
			if (["Failure", "Failed", "FAILED"].includes(result.status)) {
				throw new Error(`Export fehlgeschlagen: ${result.error?.message || "Genesys Error"}`);
			}
			await new Promise(resolve => setTimeout(resolve, 3000));
		}
		throw new Error("Timeout: Download-URL nicht erhalten.");
	}

	async downloadYamlContent(url: string): Promise<string> {
		const app = useAppStore();
		const response = await fetch(`/api/archy-upload?url=${encodeURIComponent(url)}`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${app.genesys.accessToken}`,
				"x-genesys-region": app.genesys.region || "",
			},
		});
		if (!response.ok) throw new Error(`Download fehlgeschlagen: ${response.status} ${response.statusText}`);
		return response.text();
	}

	processYamlTemplate(yaml: string, setup: any, flowKind: FlowTemplateKind): string {
		const replacements: Array<[string | undefined, string]> = [
			[setup.division?.name, "{{DIVISION_NAME}}"],
			[setup.botFlow?.name, "{{BOTFLOW_NAME}}"],
		];
		if (flowKind === "bot") {
			replacements.push(
				[setup.dataTable?.name, "{{DATA_TABLE_NAME}}"],
				[setup.mappingDataTable?.name, "{{MAPPING_DATA_TABLE_NAME}}"],
				// Die gespeicherte Data-Action-Kategorie auch beim Template-Export verwenden.
				[setup.dataAction?.category || "survey", "{{INTEGRATION_NAME}}"],
				[setup.dataAction?.name, "{{DA_PREFIX}}_submit_survey_response"],
			);
		} else {
			replacements.push([setup.inboundFlow?.name, "{{INBOUNDFLOW_NAME}}"]);
		}
		let result = yaml;
		for (const [name, placeholder] of replacements) {
			if (!name) throw new Error(`Setup-Name für ${placeholder} fehlt.`);
			result = replaceYamlName(result, name, placeholder);
			if (!result.includes(placeholder)) throw new Error(`Ressource für ${placeholder} im Export nicht gefunden.`);
		}
		return result;
	}
}

async function startFlowTemplateExport(flowId: string, flowName: string, flowType: string, flowKind: FlowTemplateKind) {
	const app = useAppStore();
	if (!app.genesys.accessToken || !app.genesys.region) throw new Error("Keine Genesys-Anmeldung oder Region verfügbar.");
	const setup = app.domain.meta.setup;
	if (!setup) throw new Error("Keine Setup-Metadaten verfügbar.");
	const service = new BotFlowService();
	const flow = await app.genesys.architectApi.getFlow(flowId);
	const version = flow.savedVersion?.id || flow.checkedInVersion?.id || flow.publishedVersion?.id;
	if (!version) throw new Error(`Keine gespeicherte Version für ${flowName} gefunden.`);
	const fileName = flowKind === "bot" ? "botFlowStructure" : "inboundFlowStructure";
	const url = await service.runFullExport({ flowId, flowName, flowType: flow.type || flowType, version, fileName });
	const yaml = service.processYamlTemplate(await service.downloadYamlContent(url), setup, flowKind);
	const link = document.createElement("a");
	link.href = URL.createObjectURL(new Blob([yaml], { type: "text/yaml" }));
	link.download = `${fileName}.yaml`;
	document.body.appendChild(link);
	try {
		link.click();
	} finally {
		link.remove();
		setTimeout(() => URL.revokeObjectURL(link.href), 1000);
	}
}

export const startBotFlowUpdate = (flowId: string, flowName: string) =>
	startFlowTemplateExport(flowId, flowName, "BOT", "bot");

export const startInboundFlowUpdate = (flowId: string, flowName: string) =>
	startFlowTemplateExport(flowId, flowName, "INBOUNDCALL", "inbound");
