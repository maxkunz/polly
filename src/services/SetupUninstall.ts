import platformClient from "purecloud-platform-client-v2";
import { i18n } from "@/i18n";
import { useAppStore } from "@/stores/appStore";
import { getGenesysRegion } from "@/services/genesysRegion";
import { API_PREFIX } from "@/constants/apiConstants";
import { deleteDivision } from "@/services/genesys/division";
import { deleteDataTable } from "@/services/genesys/dataTable";
import { deleteIntegration } from "@/services/genesys/integration";
import { deleteDataAction } from "@/services/genesys/dataAction";
import { deleteFlow, flowFetch } from "@/services/genesys/botFlow";
import { deleteGroup, deleteRole } from "@/services/genesys/groups";
import { inactiveOAuth, deleteBackend, DEFAULT_FRONTEND_SCOPES, updateCodeGrantRedirectUris } from "@/services/genesys/oauth_backend";
import { getErrorStatus, getErrorMessage, sleep } from "@/services/genesys/retry";
import { disableMcp } from "@/services/SetupMcp";
import { loadSetupMcpClient } from "@/services/metaSettingsService";
import { belongsToInstallation, installationDatatableIds, replaceInstallationRedirectUris, restoreInstallationRedirectUris } from "@/domain/setup/redirectUris";

export async function runFullDelete(
  setup: any,
  onProgress: (msg: string) => void,
  toast: any,
  options: { rollback?: boolean } = {}
) {
  if (!setup) return;
  const app = useAppStore();
  app.initGenesysClients();
  const apiIntegration = new platformClient.IntegrationsApi();
  const domainName = setup.domainName || window.location.origin;
  const oauthFrontendId = setup.oauthFrontend?.id || setup.oauthFrontendId;
  const integrationAppId = setup.integrationApp?.id;

  const ignoreAlreadyDeleted = async (action: () => Promise<any>, label: string) => {
    try {
      return await action();
    } catch (err: any) {
      const status = getErrorStatus(err);
      if (status === 404 || status === 410 || err?.body?.code === "architect.flow.deleted") {
        onProgress(`${label} already removed. Continuing...`);
        return;
      }
      throw err;
    }
  };
  const removeResource = async (resource: any, label: string, action: (id: string) => Promise<any>) => {
    if (!resource?.id) return;
    onProgress(`Deleting ${label} ${resource.id}...`);
    await ignoreAlreadyDeleted(() => action(resource.id), label);
    // Nach erfolgreichem Löschen aus dem Zwischenstand entfernen; Wiederholungen bleiben möglich.
    resource.id = "";
  };

  try {
    // Ein noch laufender Import darf nach dem Rollback keine neue Ressource mehr anlegen.
    await resolvePendingFlow(setup.botFlow, onProgress);
    await resolvePendingFlow(setup.inboundFlow, onProgress);
    for (const flow of [setup.inboundFlow, setup.botFlow]) {
      await removeResource(flow, `flow ${flow?.name ?? ""}`, async id => {
        try {
          await deleteFlow(id);
        } catch (err: any) {
          if (getErrorStatus(err) === 409) {
            throw new Error(`Dependency found: Flow ${flow.name} is still in use. ${getErrorMessage(err)}`, { cause: err });
          }
          throw err;
        }
      });
      if (flow) flow.uploadAttempted = false;
    }

    if (options.rollback) {
      if (setup.original?.oauthUpdateAttempted && oauthFrontendId) {
        onProgress("Restoring original frontend OAuth configuration...");
        // Nicht die ganze gesicherte Liste zurückschreiben: Andere Installationen (Branches) können während des
        // Setups eigene Einträge ergänzt haben. Nur die Einträge dieser Installation auf den gesicherten Stand setzen.
        const installation = {
          appUrl: setup.launchUrl || buildSetupModeLink(domainName, oauthFrontendId, setup.launchUrl),
          datatableIds: installationDatatableIds(setup),
        };
        await updateCodeGrantRedirectUris(
          oauthFrontendId,
          current => restoreInstallationRedirectUris(current, setup.original.oauthFrontend?.registeredRedirectUri, installation),
          setup.original.oauthFrontend?.scope?.length ? setup.original.oauthFrontend.scope : DEFAULT_FRONTEND_SCOPES
        );
        setup.original.oauthUpdateAttempted = false;
      }
      if (setup.original?.integrationUpdateAttempted && integrationAppId) {
        onProgress("Restoring original app integration configuration...");
        const current = await apiIntegration.getIntegrationConfigCurrent(integrationAppId);
        await apiIntegration.putIntegrationConfigCurrent(integrationAppId, {
          body: { ...setup.original.integrationApp, version: current.version },
        });
        setup.original.integrationUpdateAttempted = false;
      }
    } else {
      const setupModeLink = buildSetupModeLink(domainName, oauthFrontendId, setup.launchUrl);
      // Nur Einträge dieser Installation anfassen: Frontend-OAuth-Client und Integration können
      // von anderen Installationen (z. B. Branches) mitbenutzt werden.
      const installation = { appUrl: setupModeLink, datatableIds: installationDatatableIds(setup) };
      if (oauthFrontendId) {
        onProgress("Restoring frontend OAuth redirect URL...");
        await updateCodeGrantRedirectUris(
          oauthFrontendId,
          current => replaceInstallationRedirectUris(current, setupModeLink, installation),
          DEFAULT_FRONTEND_SCOPES
        );
      }
      if (integrationAppId) {
        const current = await apiIntegration.getIntegrationConfigCurrent(integrationAppId);
        const currentUrl = (current.properties as Record<string, any> | undefined)?.url;
        // Zeigt die Integration inzwischen auf eine andere Installation, bleibt sie unverändert.
        if (typeof currentUrl === "string" && currentUrl && !belongsToInstallation(currentUrl, installation)) {
          onProgress("App integration URL points to another installation. Leaving it unchanged.");
        } else {
          onProgress("Restoring app integration URL...");
          await apiIntegration.putIntegrationConfigCurrent(integrationAppId, {
            body: {
              name: current.name,
              version: current.version,
              properties: { ...current.properties, url: setupModeLink },
              advanced: current.advanced ?? {},
              credentials: current.credentials ?? {},
              notes: "Reset by app uninstall",
            },
          } as any);
        }
      }
    }

    // Bei älteren Installationen wurde die Credentials-ID noch nicht separat gespeichert.
    if (setup.dataActionIntegration?.id && !setup.dataActionCredential?.id) {
      const config = await ignoreAlreadyDeleted(
        () => apiIntegration.getIntegrationConfigCurrent(setup.dataActionIntegration.id),
        "Data action integration"
      );
      const credentialId = config?.credentials?.basicAuth?.id;
      if (credentialId) setup.dataActionCredential = { id: credentialId };
    }
    await removeResource(setup.dataAction, "data action", deleteDataAction);
    await removeResource(setup.dataActionIntegration, "data action integration", deleteIntegration);
    await removeResource(setup.dataActionCredential, "integration credentials", id => apiIntegration.deleteIntegrationsCredential(id));

    // `setup` stammt vom Login: Hat eine andere Sitzung MCP später aktiviert, steht der Client nur frisch in `__meta`.
    // Ohne diesen Abgleich bliebe der Genesys-Client samt Secret verwaist zurück.
    if (!options.rollback && !setup.mcpClient?.id && setup.dataTable?.id) {
      // Nur Beiwerk: Ist `__meta` nicht lesbar, läuft der Uninstall weiter (das Backend räumt MCP serverseitig ab)
      try {
        const mcpClient = await loadSetupMcpClient(setup.dataTable.id);
        if (mcpClient) setup.mcpClient = mcpClient;
      } catch (err) {
        if (getErrorStatus(err) !== 404) {
          console.warn("Could not read MCP client from __meta, continuing uninstall:", getErrorMessage(err));
          onProgress("MCP client could not be read from __meta. Continuing...");
        }
      }
    }
    // MCP vor dem Backend-Cleanup abschalten: danach ist der Mandant DELETED und /mcp-settings nicht mehr erreichbar
    if (setup.mcpClient?.id) {
      await disableMcp({ setup, onProgress, ignoreBackendErrors: true });
    }

    if (setup.backendAuth?.clientId) {
      onProgress(`Marking backend tenant ${setup.backendAuth.clientId} as deleted...`);
      const accessToken = app.genesys.accessToken;
      const region = app.genesys.region;
      if (!accessToken || !region) throw new Error("Backend cleanup requires an authenticated Genesys session and region.");
      const response = await fetch(`${domainName}${API_PREFIX}/onboarding/uninstall`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "x-genesys-region": region,
        },
        body: JSON.stringify({ backendClientId: setup.backendAuth.clientId }),
      });
      if (!response.ok) {
        const detail = await response.text();
        let alreadyDeleted = false;
        try {
          alreadyDeleted = response.status === 404 && JSON.parse(detail).message === "Tenant not found";
        } catch { /* Andere 404-Antworten bestätigen keine erfolgreiche Bereinigung. */ }
        if (!alreadyDeleted) throw new Error(`Backend cleanup failed (${response.status}): ${detail}`);
      }
      onProgress("Backend tenant marked as DELETED. Cognito client and secret are retained for admin cleanup.");
      setup.backendAuth.clientId = "";
    }

    await removeResource(setup.backendClient, "backend OAuth client", async id => {
      await inactiveOAuth(id, setup.backendClient.name || `${setup.projectTag || "app"}_polly_backend_client`);
      await sleep(2000);
      await deleteBackend(id);
    });
    await removeResource(setup.backendGroup, "backend group", deleteGroup);
    await removeResource(setup.backendRole, "backend role", deleteRole);
    for (const role of setup.frontendRoles ?? []) {
      await removeResource(role, `Polly role ${role.name}`, deleteRole);
    }
    await removeResource(setup.mappingDataTable, "mapping data table", deleteDataTable);
    await removeResource(setup.dataTable, "survey data table", deleteDataTable);

    if (setup.division?.id && setup.division.createdBySetup) {
      try {
        await removeResource(setup.division, "division", deleteDivision);
      } catch (err: any) {
        toast.add({
          severity: "info",
          summary: i18n.global.t("uninstall.toast.divisionKeptSummary"),
          detail: i18n.global.t("uninstall.toast.divisionKeptDetail"),
          life: 5000,
        });
        throw err;
      }
    } else if (setup.division?.id) {
      onProgress("Keeping existing division.");
    }
    onProgress(options.rollback ? "Rollback complete." : "Uninstallation complete.");
  } catch (err: any) {
    onProgress(`--ERROR-- ${getErrorMessage(err)}`);
    throw err;
  }
}

async function resolvePendingFlow(flow: any, onProgress: (msg: string) => void) {
  if (!flow?.jobId || !flow.uploadAttempted || flow.jobStatus === "Failure"
    || (flow.jobStatus === "Success" && flow.id)) return;
  onProgress(`Waiting for pending import ${flow.name} before cleanup...`);
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const result = await flowFetch(flow.jobId);
    if (result.flow?.id) flow.id = result.flow.id;
    if (result.status !== flow.jobStatus) onProgress(`Architect status for ${flow.name}: ${result.status}`);
    flow.jobStatus = result.status;
    if (result.status === "Failure") return;
    if (result.status === "Success") {
      if (!flow.id) throw new Error(`Import ${flow.name} completed without a flow ID; cleanup cannot be confirmed.`);
      return;
    }
    await sleep(3000);
  }
  throw new Error(`Import ${flow.name} is still pending. Retry cleanup once Architect has finished.`);
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
  url.searchParams.delete("mapping_datatable_id");
  return url.toString();
}

function getLaunchContext(launchUrl?: string) {
  const params = launchUrl ? new URL(launchUrl).searchParams : new URLSearchParams(window.location.search);
  return {
    gcHostOrigin: params.get("gcHostOrigin") || `https://apps.${getGenesysRegion()}`,
    gcTargetEnv: params.get("gcTargetEnv") || "prod",
  };
}
