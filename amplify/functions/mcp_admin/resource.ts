import { defineFunction } from "@aws-amplify/backend";

// Schalter pro Mandant (/mcp-settings), Gerüst, Inhalt kommt in M6
export const mcpAdmin = defineFunction({
  runtime: 20,
  // Token-Prüfung, Rollen und Genesys-Client (je max. 6 s, siehe shared/http.ts) plus DynamoDB
  timeoutSeconds: 20,
  resourceGroupName: "AppInfrastructure",
});
