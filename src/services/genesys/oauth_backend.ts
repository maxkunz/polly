
import { useAppStore } from "@/stores/appStore";


// create Client

export async function createBackendClient(name: string, authorizedGrantType = 'CLIENT-CREDENTIALS', accessTokenValiditySeconds = 86400, roleIds: string[], divisionId: string, description?: string) {
  const { oAuthApi } = useAppStore().genesys;

  const body = {
    name: name,
    description: description,
    authorizedGrantType: authorizedGrantType,
    accessTokenValiditySeconds: accessTokenValiditySeconds,
    roleIds: roleIds,
    roleDivisions: roleIds.map(rId => ({
        roleId: rId,
        divisionId: divisionId
      }))

  }

  return oAuthApi.postOauthClients(body);
}


// create Authorization-Code-Client (MCP-Anmeldung über die Polly-Fassade), das Secret steht nur in dieser Antwort

export async function createCodeGrantClient(name: string, redirectUri: string, scopes: string[], accessTokenValiditySeconds: number, description?: string) {
  const { oAuthApi } = useAppStore().genesys;

  return oAuthApi.postOauthClients({
    name,
    description,
    authorizedGrantType: 'CODE',
    accessTokenValiditySeconds,
    registeredRedirectUri: [redirectUri],
    scope: scopes
  } as any);
}


// get One Client with ID

export async function getOAuthClientWithID(clientId: string) {  //getBackendClientWithID
    const { oAuthApi } = useAppStore().genesys;
    return oAuthApi.getOauthClient(clientId);
  }
  

// get All Clients

export async function getAllClients() {
    const { oAuthApi } = useAppStore().genesys;
    const all: any[] = [];
    let pageNumber = 1;
    let pageCount = 1;
    do {
      const res: any = await oAuthApi.getOauthClients({
        pageSize: 100,
        pageNumber
      })
      all.push(...(res.entities || []));
      pageCount = res.pageCount || 1;
      pageNumber++;
    } while (pageNumber <= pageCount);

    return all
  }

 // inactivate OAuth:

 export async function inactiveOAuth(clientId: string, name: string, authorizedGrantType = "CLIENT-CREDENTIALS", state = "inactive") {
  const { oAuthApi } = useAppStore().genesys;
  let body = {
    name: name,
    authorizedGrantType: authorizedGrantType,
    state: state
  };
  return oAuthApi.putOauthClient(clientId, body);
}


 // PUT-Body eines Authorization-Code-Clients aus dem frisch gelesenen Stand: Der PUT ersetzt den ganzen Client,
 // fehlende Felder (z. B. Beschreibung, Token-Laufzeit) setzt Genesys sonst auf den Standard zurück.

function codeGrantClientBody(client: any) {
  return {
    name: client.name,
    description: client.description,
    authorizedGrantType: 'CODE',
    accessTokenValiditySeconds: client.accessTokenValiditySeconds,
    registeredRedirectUri: client.registeredRedirectUri,
    scope: client.scope,
    state: client.state
  };
}


 // inactivate Authorization-Code-Client: Genesys verlangt beim PUT Redirect-URIs und Scopes, deshalb vorher lesen

export async function inactivateCodeGrantClient(clientId: string) {
  const { oAuthApi } = useAppStore().genesys;
  const client: any = await oAuthApi.getOauthClient(clientId);
  return oAuthApi.putOauthClient(clientId, { ...codeGrantClientBody(client), state: 'inactive' } as any);
}


 // Scopes des Frontend-Clients, falls Genesys keine liefert (Rückfall beim PUT)

export const DEFAULT_FRONTEND_SCOPES = ["integrations", "dialog", "routing", "architect", "content-management"];


 // Redirect-URIs eines Authorization-Code-Clients ändern (z. B. des Frontend-Clients, den sich Branches teilen):
 // frisch lesen, nur die Redirect-URIs über `update` ersetzen, alle übrigen Felder unverändert mitschicken.

export async function updateCodeGrantRedirectUris(clientId: string, update: (current: string[]) => string[], fallbackScope: string[] = []) {
  const { oAuthApi } = useAppStore().genesys;
  const client: any = await oAuthApi.getOauthClient(clientId);
  const body = codeGrantClientBody(client);
  return oAuthApi.putOauthClient(clientId, {
    ...body,
    registeredRedirectUri: update(client.registeredRedirectUri ?? []),
    scope: body.scope?.length ? body.scope : fallbackScope
  } as any);
}


 // delete BackendClient

 export async function deleteBackend(clientId: string) {
  const { oAuthApi } = useAppStore().genesys;
  return oAuthApi.deleteOauthClient(clientId);
}

