import { useAppStore } from "@/stores/appStore";


// 1) /api/v2/integrations/credentials
// 2) /api/v2/integrations/{integrationId}/config/current
// type: "userDefinedOAuth"


export async function updateIntegrationProperties(
  integrationId: string, 
  name: string,
  integrationName: string,
  awsClientId: string, 
  awsClientSecret: string, 
  tokenUrl: string,
  onProgress: (msg: string) => void 
) {
  const { integrationsApi } = useAppStore().genesys;

  try {

    // --- Make Credentials Place ---
    onProgress("Creating integration credentials...");
    
    const credBody = {
      name: name,
      type: {
        name: "userDefinedOAuth" 
      },
      credentialFields: {
        loginURL: tokenUrl,
        clientId: awsClientId,
        clientSecret: awsClientSecret,
      }
    };


    const createdCreds = await integrationsApi.postIntegrationsCredentials({ 
      body: credBody 
    } as any);
      
    // UUID ->
    const credentialUuid = createdCreds.id;
    onProgress(`Credentials created! UUID: ${credentialUuid}`);
  

    // current version check
    const currentConfig = await integrationsApi.getIntegrationConfigCurrent(integrationId);
    const currentVersion = currentConfig.version;



    // --- Integration gets Credentials ---
    const updateBody: any = {
      name: integrationName, 
      version: currentVersion, 
      properties: currentConfig.properties,  
      advanced: {},   
      notes: "Using User Defined OAuth",   
      credentials: {
        "basicAuth": {       // mit BASIC key
          "id": credentialUuid 
        }
      }
    };

    onProgress(`Linking credentials (ID: ${credentialUuid}) to integration...`);

    const data = await integrationsApi.putIntegrationConfigCurrent(integrationId, { body: updateBody });
    
    onProgress("Integration configuration linked successfully!");
    return data; 

  } catch (err: any) {

    const errorDetail = err.body?.message || err.message || "Unknown error";
    const errorCode = err.body?.code || err.status;
    
    onProgress(`Error: ${errorCode} - ${errorDetail}`);
    console.error("Full error details:", err);
    throw err;
  }
}
