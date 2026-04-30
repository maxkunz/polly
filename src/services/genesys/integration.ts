import { useAppStore } from "@/stores/appStore";


export async function deleteIntegration(integrationId: string) {
    const { integrationsApi } = useAppStore().genesys;
    return integrationsApi.deleteIntegration(integrationId);
  }
