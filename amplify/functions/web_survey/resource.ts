import { defineFunction } from "@aws-amplify/backend";

// Öffentliche Lambda des Web-Kanals; reservedConcurrentExecutions wird in backend.ts gesetzt.
export const webSurvey = defineFunction({
  runtime: 20,
  // Zwei verkettete Genesys-Aufrufe (je max. 6 s, siehe shared/http.ts) plus DynamoDB
  timeoutSeconds: 20,
  resourceGroupName: "AppInfrastructure",
});
