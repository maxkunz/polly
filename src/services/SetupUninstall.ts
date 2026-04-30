import platformClient from "purecloud-platform-client-v2";
import { deleteDivision } from "@/services/genesys/division";
import { deleteDataTable } from "@/services/genesys/dataTable";
import { deleteIntegration } from "@/services/genesys/integration";
import { deleteDataAction } from "@/services/genesys/dataAction";
import { deleteGroup, deleteRole } from "@/services/genesys/groups";
import { inactiveOAuth, deleteBackend, getOAuthClientWithID } from "@/services/genesys/oauth_backend";

export async function runFullDelete(
  setup: any,
  onProgress: (msg: string) => void,
  toast: any
) {
  const apiLinks = new platformClient.OAuthApi();
  const apiIntegration = new platformClient.IntegrationsApi();

  const domainName = setup?.domainName || window.location.origin;
  const oauthFrontendId = setup?.oauthFrontend?.id || setup?.oauthFrontendId;
  const integrationAppId = setup?.integrationApp?.id;
  const dataTableId = setup?.dataTable?.id;
  const backendGroupId = setup?.backendGroup?.id;
  const backendRoleId = setup?.backendRole?.id;
  const backendAuthClientId = setup?.backendAuth?.clientId;
  const backendClientId = setup?.backendClient?.id;
  const backendClientName = setup?.backendClient?.name || `${setup?.projectTag || "app"}_backend_client`;
  const dataActionIntegrationId = setup?.dataActionIntegration?.id;
  const dataActionId = setup?.dataAction?.id;
  const divisionId = setup?.division?.id;
  const divisionCreatedBySetup = Boolean(setup?.division?.createdBySetup);

  try {
    const setupModeLink = buildSetupModeLink(domainName, oauthFrontendId, setup?.launchUrl);

    if (oauthFrontendId) {
      onProgress("Restoring frontend OAuth redirect URL...");
      const frontendOAuth = await getOAuthClientWithID(oauthFrontendId);
      await apiLinks.putOauthClient(oauthFrontendId, {
        name: frontendOAuth.name,
        registeredRedirectUri: [setupModeLink],
        authorizedGrantType: "TOKEN",
        scope: frontendOAuth.scope ?? [
          "integrations",
          "dialog",
          "routing",
          "architect",
          "content-management",
        ],
      } as any);
    }

    if (integrationAppId) {
      onProgress("Restoring app integration URL...");
      const currentIntegrationConfig = await apiIntegration.getIntegrationConfigCurrent(integrationAppId);
      const currentProperties = (currentIntegrationConfig.properties ?? {}) as Record<string, any>;
      await apiIntegration.putIntegrationConfigCurrent(integrationAppId, {
        body: {
          name: currentIntegrationConfig.name,
          version: currentIntegrationConfig.version,
          properties: {
            ...currentProperties,
            url: setupModeLink,
            displayType: currentProperties.displayType ?? "standalone",
            sandbox:
              currentProperties.sandbox ??
              "allow-scripts,allow-same-origin,allow-forms,allow-modals,allow-downloads",
          },
          advanced: currentIntegrationConfig.advanced ?? {},
          credentials: currentIntegrationConfig.credentials ?? {},
          notes: "Reset by app uninstall",
        },
      } as any);
    }

    if (dataActionId) {
      onProgress(`Deleting data action ${dataActionId}...`);
      await deleteDataAction(dataActionId);
    }

    if (dataActionIntegrationId) {
      onProgress(`Deleting data action integration ${dataActionIntegrationId}...`);
      await deleteIntegration(dataActionIntegrationId);
    }

    if (backendClientId) {
      onProgress(`Deleting backend OAuth client ${backendClientId}...`);
      await inactiveOAuth(backendClientId, backendClientName);
      await wait(2000);
      await deleteBackend(backendClientId);
    }

    if (backendGroupId) {
      onProgress(`Deleting backend group ${backendGroupId}...`);
      await deleteGroup(backendGroupId);
    }

    if (backendRoleId) {
      onProgress(`Deleting backend role ${backendRoleId}...`);
      await deleteRole(backendRoleId);
    }

    // if (backendAuthClientId) {
    //   onProgress(`Deleting backend onboarding resources ${backendAuthClientId}...`);
    //   const response = await fetch(`${domainName}/api/onboarding/delete`, {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({
    //       backendClientId: backendAuthClientId,
    //       forceDeleteSecret: true,
    //     }),
    //   });
    //
    //   if (!response.ok) {
    //     throw new Error("Backend onboarding delete failed.");
    //   }
    // }

    if (dataTableId) {
      onProgress(`Deleting data table ${dataTableId}...`);
      await deleteDataTable(dataTableId);
    }

    if (divisionId && divisionCreatedBySetup) {
      try {
        onProgress(`Deleting division ${divisionId}...`);
        await deleteDivision(divisionId);
      } catch (error: any) {
        onProgress(`Division ${divisionId} could not be deleted automatically.`);
        toast.add({
          severity: "info",
          summary: "Division bleibt erhalten",
          detail: "Die erzeugte Division konnte nicht gelöscht werden und bleibt bestehen.",
          life: 5000,
        });
      }
    } else if (divisionId) {
      onProgress("Keeping existing division.");
    }

    onProgress("Uninstallation complete.");
  } catch (err: any) {
    const detail = err.body?.message || err.message || "Unknown uninstall error";
    onProgress(`--ERROR-- ${detail}`);
    throw err;
  }
}

function buildSetupModeLink(domainName: string, clientId: string, launchUrl?: string) {
  const launchContext = getLaunchContext(launchUrl);
  const url = launchUrl ? new URL(launchUrl) : new URL(`${domainName}/`);
  url.hash = "";
  url.searchParams.set("gcHostOrigin", launchContext.gcHostOrigin);
  url.searchParams.set("gcTargetEnv", launchContext.gcTargetEnv);
  if (clientId) {
    url.searchParams.set("client_id", clientId);
  }
  url.searchParams.delete("datatable_id");
  return url.toString();
}

function getLaunchContext(launchUrl?: string) {
  const params = launchUrl ? new URL(launchUrl).searchParams : new URLSearchParams(window.location.search);
  return {
    gcHostOrigin: params.get("gcHostOrigin") || "https://apps.mypurecloud.de",
    gcTargetEnv: params.get("gcTargetEnv") || "prod",
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
