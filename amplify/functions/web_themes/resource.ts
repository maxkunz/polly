import { defineFunction } from "@aws-amplify/backend";

export const webThemes = defineFunction({
  runtime: 20,
  // Token-Prüfung, dann Rollen und __meta parallel (je max. 6 s, siehe shared/http.ts) plus DynamoDB
  timeoutSeconds: 20,
  resourceGroupName: "AppInfrastructure",
});
