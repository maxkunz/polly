import platformClient from "purecloud-platform-client-v2";
import { createDivision } from "@/services/genesys/division";
import { createDataTable, addDataTableRow, updateDataTableRow } from "@/services/genesys/dataTable";
import { createIntegrationOfType, createDataAction, enableIntegration, getIntegrationWithID, applyDomainDatActPlaceholder } from "@/services/genesys/dataAction";
import { applyRolePlaceholder, createGroup, createRole, GroupWithRole } from "@/services/genesys/groups";
import { updateIntegrationProperties } from "@/services/genesys/auth";
import { createBackendClient, getOAuthClientWithID } from "@/services/genesys/oauth_backend";
import { makeJobForFlow, flowFetch } from "@/services/genesys/botFlow";
import { useAppStore } from "@/stores/appStore";
import { getGenesysRegion } from "@/services/genesysRegion";
import { getErrorMessage } from "@/services/genesys/retry";
import surveyResponseActionJson from "@/templates/genesys/dataActionStructure_survey_responses.json";
import botFlowTemplate from "@/templates/genesys/botFlowStructure.yaml?raw";
import inboundFlowTemplate from "@/templates/genesys/inboundFlowStructure.yaml?raw";

type FlowSetupResource = {
  id: string;
  name: string;
  jobId?: string;
  uploadAttempted?: boolean;
  jobStatus?: string;
};

type SetupMeta = {
  status: "installing" | "installed" | "failed";
  projectTag: string;
  domainName: string;
  launchUrl: string;
  oauthFrontend: { id: string; name?: string };
  integrationApp: { id: string; name?: string };
  division: { id: string; name: string; createdBySetup: boolean };
  backendGroup: { id: string; name: string };
  backendRole: { id: string; name: string };
  backendAuth: { clientId: string; tokenUrl: string };
  backendClient: { id: string; name: string };
  dataTable: { id: string; name: string };
  mappingDataTable: { id: string; name: string };
  dataActionIntegration: { id: string; name: string };
  dataActionCredential: { id: string; name: string };
  dataAction: { id: string; name: string };
  botFlow: FlowSetupResource;
  inboundFlow: FlowSetupResource;
  installedAt?: string;
  original?: {
    oauthFrontend: Record<string, any>;
    integrationApp: Record<string, any>;
    oauthUpdateAttempted: boolean;
    integrationUpdateAttempted: boolean;
  };
};

export function hasSetupResources(setup: any): boolean {
  if (!setup) return false;
  return Boolean(
    (setup.division?.createdBySetup && setup.division.id)
    || setup.backendAuth?.clientId
    || setup.original?.oauthUpdateAttempted
    || setup.original?.integrationUpdateAttempted
    || ["backendGroup", "backendRole", "backendClient", "dataTable", "mappingDataTable",
      "dataActionIntegration", "dataActionCredential", "dataAction", "botFlow", "inboundFlow"]
      .some(key => setup[key]?.id || setup[key]?.uploadAttempted)
  );
}

export async function runFullProvisioning(
  projectName: string,
  integrationAppId: string,
  oauthFrontendId: string,
  divisionId: string,
  divisionName: string,
  onProgress: (msg: string) => void
): Promise<{
  integrationUrl: string;
  params: {
    clientId: string;
    datatableId: string;
    mappingDataTableId: string;
  };
}> {
  const apiLinks = new platformClient.OAuthApi();
  const apiIntegration = new platformClient.IntegrationsApi();
  const app = useAppStore();
  if (app.domain.meta.setup?.status !== "installed" && hasSetupResources(app.domain.meta.setup)) {
    throw new Error("Roll back the previous partial installation before starting another setup.");
  }
  const accessToken = app.genesys.accessToken?.trim();
  const region = app.genesys.region?.trim();
  if (!accessToken || !region) {
    throw new Error("Flow import requires an authenticated Genesys session and region.");
  }
  const setupApiHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "x-genesys-region": region,
    "Content-Type": "application/json",
  };
  const dataActionCategory = "survey";

  const projectTag = projectName.trim().replace(/[^A-Za-z0-9_-]/g, "");
  if (!projectTag) {
    throw new Error("Project tag is required.");
  }

  const names = {
    division: `${projectTag}_division`,
    dataTable: `${projectTag}_polly_surveys`,
    mappingDataTable: `${projectTag}_polly_mapping`,
    backendGroup: `${projectTag}_backend_group`,
    backendRole: `${projectTag}_backend_role`,
    backendClient: `${projectTag}_backend_client`,
    dataActionIntegration: `${projectTag}_data_actions`,
    dataActionCredential: `${projectTag}_credentials`,
    dataAction: `${projectTag}_submit_survey_response`,
    botFlow: `${projectTag}_polly_bot_flow`,
    inboundFlow: `${projectTag}_polly_inbound_flow`,
  };

  app.domain.meta.setup = {
    status: "installing",
    projectTag,
    domainName: window.location.origin,
    launchUrl: "",
    oauthFrontend: { id: oauthFrontendId },
    integrationApp: { id: integrationAppId },
    division: { id: "", name: names.division, createdBySetup: false },
    backendGroup: { id: "", name: names.backendGroup },
    backendRole: { id: "", name: names.backendRole },
    backendAuth: { clientId: "", tokenUrl: "" },
    backendClient: { id: "", name: names.backendClient },
    dataTable: { id: "", name: names.dataTable },
    mappingDataTable: { id: "", name: names.mappingDataTable },
    dataActionIntegration: { id: "", name: names.dataActionIntegration },
    dataActionCredential: { id: "", name: names.dataActionCredential },
    dataAction: { id: "", name: names.dataAction },
    botFlow: { id: "", name: names.botFlow },
    inboundFlow: { id: "", name: names.inboundFlow },
  } satisfies SetupMeta;
  const setupState = app.domain.meta.setup as SetupMeta;

  try {
    const appIntegration = await getIntegrationWithID(integrationAppId);
    const appUrl = resolveAppUrl(appIntegration?.properties?.url);
    const appOrigin = appUrl.origin;
    setupState.domainName = appOrigin;
    const frontendOAuth = await getOAuthClientWithID(oauthFrontendId);
    setupState.oauthFrontend.name = frontendOAuth.name;
    setupState.integrationApp.name = appIntegration.name;
    // Nur die veränderten OAuth-Felder sichern, insbesondere kein Client-Secret.
    setupState.original = {
      oauthFrontend: {
        name: frontendOAuth.name,
        registeredRedirectUri: frontendOAuth.registeredRedirectUri,
        authorizedGrantType: frontendOAuth.authorizedGrantType,
        scope: frontendOAuth.scope,
      },
      integrationApp: {
        name: appIntegration.name,
        properties: appIntegration.properties ?? {},
        advanced: appIntegration.advanced ?? {},
        credentials: appIntegration.credentials ?? {},
        notes: appIntegration.notes,
      },
      oauthUpdateAttempted: false,
      integrationUpdateAttempted: false,
    };
    const gcContext = getLaunchContext();

    onProgress(`Using app origin ${appOrigin}`);
    onProgress(`Using frontend OAuth client ${oauthFrontendId}`);
    onProgress(`Using app integration ${integrationAppId}`);

    const hasExistingDivision = Boolean(divisionId?.trim());
    const targetDivision = hasExistingDivision
      ? { id: divisionId, name: divisionName || names.division, createdBySetup: false }
      : await createNewDivision(names.division, projectTag, onProgress);
    setupState.division = targetDivision;

    onProgress(`Preparing data table ${names.dataTable}...`);
    const dataTable = await createDataTable(names.dataTable, buildSurveyTableSchema(), targetDivision.id);
    const datatableId = dataTable.id;
    setupState.dataTable.id = datatableId;

    await addDataTableRow(datatableId, buildEmptySurveyRow("__lock"));
    await addDataTableRow(datatableId, buildMetaRow({ appTitle: projectTag, setup: null }));
    await addDataTableRow(datatableId, {
      ...buildEmptySurveyRow("survey_list"),
      Draft: "[]",
    });
    onProgress(`Data table created (${datatableId})`);

    onProgress(`Preparing data table ${names.mappingDataTable}...`);
    const mappingDataTable = await createDataTable(names.mappingDataTable, buildMappingTableSchema(), targetDivision.id);
    const mappingDataTableId = mappingDataTable.id;
    setupState.mappingDataTable.id = mappingDataTableId;
    onProgress(`Mapping data table created (${mappingDataTableId})`);

    onProgress("Preparing backend role from template...");
    const roleTemplateResponse = await fetch("/permissionsStructure.json");
    const roleTemplateRaw = await roleTemplateResponse.text();
    const processedRoleJson = applyRolePlaceholder(roleTemplateRaw, names.backendRole);
    const roleConfig = JSON.parse(processedRoleJson);

    onProgress(`Creating backend role ${names.backendRole}...`);
    const backendRole = await createRole(roleConfig, names.backendRole, `Backend role for ${projectTag}`);
    setupState.backendRole.id = backendRole.id;
    onProgress(`Backend role created (${backendRole.id})`);

    onProgress(`Creating backend group ${names.backendGroup}...`);
    const backendGroup = await createGroup(names.backendGroup, false, "public", "official");
    setupState.backendGroup.id = backendGroup.id;
    onProgress(`Backend group created (${backendGroup.id})`);

    onProgress(`Assigning backend role to backend group...`);
    await GroupWithRole(backendGroup.id, targetDivision.id, backendRole.id);

    onProgress(`Creating backend OAuth client ${names.backendClient}...`);
    const backendClient = await createBackendClient(
      names.backendClient,
      "CLIENT-CREDENTIALS",
      86400,
      [backendRole.id],
      targetDivision.id,
      `Backend client for ${projectTag}`
    );
    setupState.backendClient.id = backendClient.id;
    onProgress(`Backend OAuth client created (${backendClient.id})`);

    onProgress("Starting backend onboarding...");
    const startResponse = await fetch(`${appOrigin}/api/onboarding/start`, {
      method: "POST",
      headers: setupApiHeaders,
      body: JSON.stringify({
        tenantName: projectTag,
        frontendVersion: "1.0.0",
        tenantId: oauthFrontendId,
      }),
    });

    if (!startResponse.ok) {
      throw new Error("Backend onboarding start failed.");
    }

    const startData = await startResponse.json();
    const backendAuth = startData.backendAuth;
    const tokenUrl = startData.tokenUrl;
    setupState.backendAuth = { clientId: backendAuth.clientId, tokenUrl };

    onProgress(`Creating data actions integration ${names.dataActionIntegration}...`);
    const dataActionIntegration = await createIntegrationOfType(names.dataActionIntegration);
    setupState.dataActionIntegration.id = dataActionIntegration.id;
    await enableIntegration(dataActionIntegration.id, "ENABLED");
    await updateIntegrationProperties(
      dataActionIntegration.id,
      names.dataActionCredential,
      names.dataActionIntegration,
      backendAuth.clientId,
      backendAuth.clientSecret,
      tokenUrl,
      onProgress,
      credentialId => { setupState.dataActionCredential.id = credentialId; }
    );
    onProgress(`Data actions integration ready (${dataActionIntegration.id})`);

    onProgress(`Creating data action ${names.dataAction}...`);
    const dataActionTemplate = JSON.parse(
      applyDomainDatActPlaceholder(JSON.stringify(surveyResponseActionJson), appOrigin)
    );
    const dataAction = await createDataAction({
      name: names.dataAction,
      integrationId: dataActionIntegration.id,
      categoryName: dataActionCategory,
      config: dataActionTemplate.config,
      contract: dataActionTemplate.contract,
    });
    setupState.dataAction.id = dataAction.id;
    onProgress(`Data action created (${dataAction.id})`);

    onProgress("Completing backend onboarding...");
    const completeResponse = await fetch(`${appOrigin}/api/onboarding/complete`, {
      method: "POST",
      headers: setupApiHeaders,
      body: JSON.stringify({
        backendClientId: backendAuth.clientId,
        genesysRegion: region,
        genesysClientId: backendClient.id,
        genesysClientSecret: backendClient.secret,
        allowedDataTableIds: [datatableId, mappingDataTableId],
      }),
    });

    if (!completeResponse.ok) {
      throw new Error("Backend onboarding completion failed.");
    }

    onProgress("Preparing flow templates...");
    const flowReplacements = {
      BOTFLOW_NAME: names.botFlow,
      INBOUNDFLOW_NAME: names.inboundFlow,
      DIVISION_NAME: targetDivision.name,
      DATA_TABLE_NAME: names.dataTable,
      MAPPING_DATA_TABLE_NAME: names.mappingDataTable,
      INTEGRATION_NAME: dataActionCategory,
      DA_PREFIX: projectTag,
    };
    const botYaml = applyFlowPlaceholders(botFlowTemplate, flowReplacements);
    const inboundYaml = applyFlowPlaceholders(inboundFlowTemplate, flowReplacements);

    await importFlow(botYaml, setupState.botFlow, appOrigin, setupApiHeaders, onProgress);
    await importFlow(inboundYaml, setupState.inboundFlow, appOrigin, setupApiHeaders, onProgress);

    const launchUrl = buildLaunchUrl(appUrl, gcContext, oauthFrontendId, datatableId, mappingDataTableId);
    setupState.launchUrl = launchUrl;

    onProgress("Updating frontend OAuth redirect URL...");
    setupState.original.oauthUpdateAttempted = true;
    await apiLinks.putOauthClient(oauthFrontendId, {
      name: frontendOAuth.name,
      registeredRedirectUri: [launchUrl],
      authorizedGrantType: "CODE",
      scope: frontendOAuth.scope ?? [
        "integrations",
        "dialog",
        "routing",
        "architect",
        "content-management",
      ],
    } as any);

    onProgress("Updating app integration URL...");
    const currentIntegrationConfig = await apiIntegration.getIntegrationConfigCurrent(integrationAppId);
    const currentProperties = (currentIntegrationConfig.properties ?? {}) as Record<string, any>;
    setupState.original.integrationUpdateAttempted = true;
    await apiIntegration.putIntegrationConfigCurrent(integrationAppId, {
      body: {
        name: currentIntegrationConfig.name,
        version: currentIntegrationConfig.version,
        properties: {
          ...currentProperties,
          url: launchUrl,
          displayType: currentProperties.displayType ?? "standalone",
          sandbox:
            currentProperties.sandbox ??
            "allow-scripts,allow-same-origin,allow-forms,allow-modals,allow-downloads",
        },
        advanced: currentIntegrationConfig.advanced ?? {},
        credentials: currentIntegrationConfig.credentials ?? {},
        notes: "Updated by app setup",
      },
    } as any);

    setupState.status = "installed";
    setupState.installedAt = new Date().toISOString();

    await updateDataTableRow(datatableId, "__meta", buildMetaRow({ appTitle: projectTag, setup: setupState }));
    onProgress("Setup metadata stored in __meta.");
    onProgress("Installation complete.");

    return {
      integrationUrl: launchUrl,
      params: {
        clientId: oauthFrontendId,
        datatableId,
        mappingDataTableId,
      },
    };
  } catch (err: any) {
    setupState.status = "failed";
    onProgress(`--ERROR-- Setup failed: ${getErrorMessage(err)}`);
    const failure = new Error(getErrorMessage(err), { cause: err });
    Object.assign(failure, { partialSetup: setupState });
    throw failure;
  }
}

export function applyFlowPlaceholders(template: string, replacements: Record<string, string>): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_token, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(replacements, key)) {
      throw new Error(`Missing flow placeholder replacement: ${key}`);
    }
    // Vollständige YAML-Namen quoten; DA_PREFIX ist Teil eines bereits bereinigten Namens.
    return key === "DA_PREFIX" ? replacements[key] : JSON.stringify(replacements[key]);
  });
}

export async function importFlow(
  yaml: string,
  flowState: FlowSetupResource,
  appOrigin: string,
  authHeaders: Record<string, string>,
  onProgress: (msg: string) => void
): Promise<string> {
  const flowName = flowState.name;
  onProgress(`Creating Architect import job for ${flowName}...`);
  const job = await makeJobForFlow();
  flowState.jobId = job.id;
  if (!job.id || !job.presignedUrl) {
    throw new Error(`Architect returned an incomplete import job for ${flowName}.`);
  }

  onProgress(`Uploading ${flowName}...`);
  flowState.uploadAttempted = true;
  const response = await fetch(`${appOrigin}/api/archy-upload`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      url: job.presignedUrl,
      headers: job.headers,
      contentType: "application/x-yaml",
      body: yaml,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Flow upload failed for ${flowName} (${response.status}): ${detail}`);
  }

  onProgress(`Waiting for Architect to import ${flowName}...`);
  const deadline = Date.now() + 5 * 60 * 1000;
  let lastStatus: string | undefined;
  while (Date.now() < deadline) {
    const result = await flowFetch(job.id);
    flowState.jobStatus = result.status;
    if (result.flow?.id) flowState.id = result.flow.id;
    if (result.status !== lastStatus) {
      onProgress(`Architect status for ${flowName}: ${result.status}`);
      lastStatus = result.status;
    }
    if (result.status === "Success") {
      if (!result.flow?.id) {
        throw new Error(`Architect imported ${flowName} without returning a flow ID.`);
      }
      onProgress(`Flow imported: ${flowName} (${result.flow.id})`);
      return result.flow.id;
    }
    if (result.status === "Failure") {
      const details = JSON.stringify(result.messages ?? []);
      throw new Error(`Architect import failed for ${flowName}: ${details}`);
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error(`Architect import timed out after 5 minutes for ${flowName} (job ${job.id}).`);
}

async function createNewDivision(name: string, projectTag: string, onProgress: (msg: string) => void) {
  onProgress(`Creating division ${name}...`);
  const division = await createDivision(name, `Division for ${projectTag}`);
  onProgress(`Division created (${division.id})`);
  return {
    id: division.id,
    name,
    createdBySetup: true,
  };
}

function buildSurveyTableSchema() {
  return {
    $schema: "http://json-schema.org/draft-04/schema#",
    type: "object",
    required: ["key"],
    properties: {
      key: { title: "key", type: "string", $id: "/properties/key" },
      Draft: { title: "Draft", type: "string", $id: "/properties/Draft", default: "{}" },
      Stage: { title: "Stage", type: "string", $id: "/properties/Stage", default: "{}" },
      Prod: { title: "Prod", type: "string", $id: "/properties/Prod", default: "{}" },
      Backup: { title: "Backup", type: "string", $id: "/properties/Backup", default: "{}" },
      lock: { title: "lock", type: "string", $id: "/properties/lock", default: JSON.stringify({ locked_by: "", locked_since: "" }) },
    },
    additionalProperties: false,
  };
}

function buildMappingTableSchema() {
  return {
    $schema: "http://json-schema.org/draft-04/schema#",
    type: "object",
    required: ["key"],
    properties: {
      key: { title: "QueueName", type: "string", $id: "/properties/key" },
      DeliveryRate: { title: "DeliveryRate", type: "integer", $id: "/properties/DeliveryRate" },
      SurveyId: { title: "SurveyId", type: "string", $id: "/properties/SurveyId" },
    },
    additionalProperties: false,
  };
}

function buildEmptySurveyRow(key: string) {
  return {
    key,
    Draft: "{}",
    Stage: "{}",
    Prod: "{}",
    Backup: "{}",
    lock: JSON.stringify({ locked_by: "", locked_since: "" }),
  };
}

function buildMetaRow(meta: Record<string, unknown>) {
  return {
    ...buildEmptySurveyRow("__meta"),
    Draft: JSON.stringify(meta),
  };
}

function resolveAppUrl(rawUrl?: string) {
  if (!rawUrl) return new URL(window.location.href);
  try {
    const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    return new URL(url);
  } catch {
    return new URL(window.location.href);
  }
}

function getLaunchContext() {
  const params = new URLSearchParams(window.location.search);
  return {
    gcHostOrigin: params.get("gcHostOrigin") || `https://apps.${getGenesysRegion()}`,
    gcTargetEnv: params.get("gcTargetEnv") || "prod",
  };
}

function buildLaunchUrl(
  appUrl: URL,
  launchContext: { gcHostOrigin: string; gcTargetEnv: string },
  clientId: string,
  datatableId?: string,
  mappingDataTableId?: string
) {
  const url = new URL(appUrl.toString());
  url.hash = "";
  url.searchParams.set("gcHostOrigin", launchContext.gcHostOrigin);
  url.searchParams.set("gcTargetEnv", launchContext.gcTargetEnv);
  url.searchParams.set("client_id", clientId);
  if (datatableId) {
    url.searchParams.set("datatable_id", datatableId);
  }
  if (mappingDataTableId) {
    url.searchParams.set("mapping_datatable_id", mappingDataTableId);
  }
  return url.toString();
}
