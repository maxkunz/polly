import { defineFunction } from "@aws-amplify/backend";

export const invitations = defineFunction({
  runtime: 20,
  // Bis zu vier verkettete Genesys-Aufrufe (je max. 6 s, siehe shared/http.ts); unter dem 30-s-Limit von API Gateway
  timeoutSeconds: 29,
  // 5000 Einladungen auf einmal signieren
  memoryMB: 512,
  resourceGroupName: "AppInfrastructure",
});
