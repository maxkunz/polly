import platformClient from "purecloud-platform-client-v2";
import { createDivision } from "@/services/genesys/division";
import { createDataTable, addDataTableRow, updateDataTableRow } from "@/services/genesys/dataTable";
import { createIntegrationOfType, createDataAction, enableIntegration, getIntegrationWithID, applyDomainDatActPlaceholder } from "@/services/genesys/dataAction";
import { applyRolePlaceholder, createGroup, createRole, GroupWithRole } from "@/services/genesys/groups";
import { updateIntegrationProperties } from "@/services/genesys/auth";
import { createBackendClient, getOAuthClientWithID } from "@/services/genesys/oauth_backend";
import surveyResponseActionJson from "@/templates/genesys/dataActionStructure_survey_responses.json";

type SetupMeta = {
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
  dataAction: { id: string; name: string };
  installedAt: string;
};

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
  };

  const appIntegration = await getIntegrationWithID(integrationAppId);
  const appUrl = resolveAppUrl(appIntegration?.properties?.url);
  const appOrigin = appUrl.origin;
  const gcContext = getLaunchContext();

  onProgress(`Using app origin ${appOrigin}`);
  onProgress(`Using frontend OAuth client ${oauthFrontendId}`);
  onProgress(`Using app integration ${integrationAppId}`);

  const hasExistingDivision = Boolean(divisionId?.trim());
  const targetDivision = hasExistingDivision
    ? { id: divisionId, name: divisionName || names.division, createdBySetup: false }
    : await createNewDivision(names.division, projectTag, onProgress);

  onProgress(`Preparing data table ${names.dataTable}...`);
  const dataTable = await createDataTable(names.dataTable, buildSurveyTableSchema(), targetDivision.id);
  const datatableId = dataTable.id;

  await addDataTableRow(datatableId, buildEmptySurveyRow("__lock"));
  await addDataTableRow(datatableId, buildMetaRow({ appTitle: projectTag, setup: null }));
  onProgress(`Data table created (${datatableId})`);

  onProgress(`Preparing data table ${names.mappingDataTable}...`);
  const mappingDataTable = await createDataTable(names.mappingDataTable, buildMappingTableSchema(), targetDivision.id);
  const mappingDataTableId = mappingDataTable.id;
  onProgress(`Mapping data table created (${mappingDataTableId})`);

  onProgress("Preparing backend role from template...");
  const roleTemplateResponse = await fetch("/permissionsStructure.json");
  const roleTemplateRaw = await roleTemplateResponse.text();
  const processedRoleJson = applyRolePlaceholder(roleTemplateRaw, names.backendRole);
  const roleConfig = JSON.parse(processedRoleJson);

  onProgress(`Creating backend role ${names.backendRole}...`);
  const backendRole = await createRole(roleConfig, names.backendRole, `Backend role for ${projectTag}`);
  onProgress(`Backend role created (${backendRole.id})`);

  onProgress(`Creating backend group ${names.backendGroup}...`);
  const backendGroup = await createGroup(names.backendGroup, false, "public", "official");
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
  onProgress(`Backend OAuth client created (${backendClient.id})`);

  onProgress("Starting backend onboarding...");
  const startResponse = await fetch(`${appOrigin}/api/onboarding/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

  onProgress(`Creating data actions integration ${names.dataActionIntegration}...`);
  const dataActionIntegration = await createIntegrationOfType(names.dataActionIntegration);
  await enableIntegration(dataActionIntegration.id, "ENABLED");
  await updateIntegrationProperties(
    dataActionIntegration.id,
    names.dataActionCredential,
    names.dataActionIntegration,
    backendAuth.clientId,
    backendAuth.clientSecret,
    tokenUrl,
    onProgress
  );
  onProgress(`Data actions integration ready (${dataActionIntegration.id})`);

  onProgress(`Creating data action ${names.dataAction}...`);
  const dataActionTemplate = JSON.parse(
    applyDomainDatActPlaceholder(JSON.stringify(surveyResponseActionJson), appOrigin)
  );
  const dataAction = await createDataAction({
    name: names.dataAction,
    integrationId: dataActionIntegration.id,
    categoryName: "survey",
    config: dataActionTemplate.config,
    contract: dataActionTemplate.contract,
  });
  onProgress(`Data action created (${dataAction.id})`);

  onProgress("Completing backend onboarding...");
  const completeResponse = await fetch(`${appOrigin}/api/onboarding/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      backendClientId: backendAuth.clientId,
      genesysRegion: "mypurecloud.de",
      genesysClientId: backendClient.id,
      genesysClientSecret: backendClient.secret,
      allowedDataTableIds: [datatableId, mappingDataTableId],
    }),
  });

  if (!completeResponse.ok) {
    throw new Error("Backend onboarding completion failed.");
  }

  const launchUrl = buildLaunchUrl(appUrl, gcContext, oauthFrontendId, datatableId, mappingDataTableId);

  onProgress("Updating frontend OAuth redirect URL...");
  const frontendOAuth = await getOAuthClientWithID(oauthFrontendId);
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

  const setupMeta: SetupMeta = {
    projectTag,
    domainName: appOrigin,
    launchUrl,
    oauthFrontend: { id: oauthFrontendId, name: frontendOAuth.name },
    integrationApp: { id: integrationAppId, name: currentIntegrationConfig.name ?? undefined },
    division: targetDivision,
    backendGroup: { id: backendGroup.id, name: names.backendGroup },
    backendRole: { id: backendRole.id, name: names.backendRole },
    backendAuth: { clientId: backendAuth.clientId, tokenUrl },
    backendClient: { id: backendClient.id, name: names.backendClient },
    dataTable: { id: datatableId, name: names.dataTable },
    mappingDataTable: { id: mappingDataTableId, name: names.mappingDataTable },
    dataActionIntegration: { id: dataActionIntegration.id, name: names.dataActionIntegration },
    dataAction: { id: dataAction.id, name: names.dataAction },
    installedAt: new Date().toISOString(),
  };

  await updateDataTableRow(datatableId, "__meta", buildMetaRow({ appTitle: projectTag, setup: setupMeta }));
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
    gcHostOrigin: params.get("gcHostOrigin") || "https://apps.mypurecloud.de",
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
