import { useAppStore } from "@/stores/appStore";




// Get ALL Integration

export async function getAllIntegrations() {
  const { integrationsApi } = useAppStore().genesys;
  const res = await integrationsApi.getIntegrations({
    pageSize: 100
  })

  return res.entities || []
}



// Get One Integration

export async function getIntegrationWithID(integrationId: string) {
  const { integrationsApi } = useAppStore().genesys;
  return integrationsApi.getIntegrationConfigCurrent(integrationId);
}



// ENABLE Integration 

export async function enableIntegration(
  integrationId: string,
  intendedState: 'ENABLED' | 'DISABLED' = 'ENABLED'
) {
  const { integrationsApi } = useAppStore().genesys;

  const opts = {
    body: {
      intendedState,
    },
  };

  return integrationsApi.patchIntegration(integrationId, opts);
}



// 1

export async function createIntegrationOfType(
    integrationName: string,
    integrationTypeName = 'Web Services Data Actions'
) {
    const { integrationsApi } = useAppStore().genesys;

    const res = await integrationsApi.getIntegrationsTypes();
    const type = res.entities.find((t: any) => t.name === integrationTypeName);

    if (!type) {
      throw new Error(`Integration type "${integrationTypeName}" not found`);
    }

    const opts = {
      body: {
        name: integrationName,
        integrationType: {
          id: type.id
        }
      }
    };

    const createdIntegration = await integrationsApi.postIntegrations(opts);

    return createdIntegration;
}






export async function createDataAction(data: {
  name: string,
  secure?: boolean,
  integrationId: string,
  categoryName: string, 
  config: any,
  contract: any
}) {
  const { integrationsApi } = useAppStore().genesys;

  const body = {
      name: data.name,
      category: data.categoryName, 
      integrationId: data.integrationId,
      secure: data.secure || false,
      config: data.config,
      contract: data.contract
  };

  return await integrationsApi.postIntegrationsActions(body);
}



export async function deleteDataAction(actionId: string) {
    const { integrationsApi } = useAppStore().genesys;
    return integrationsApi.deleteIntegrationsAction(actionId);
}



// Add Domain 

export function applyDomainDatActPlaceholder(
  jsonTemplate: string,
  domainName: string
) {
  return jsonTemplate.replace(
    "{{DOMAIN_NAME}}",
    domainName
  );
}
