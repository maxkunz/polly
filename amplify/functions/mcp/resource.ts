import { defineFunction } from "@aws-amplify/backend";

// MCP-Server mit OAuth-Fassade (Gerüst, Inhalt kommt in M7/M8); reservedConcurrentExecutions wird in backend.ts gesetzt.
export const mcp = defineFunction({
  runtime: 20,
  // Unter dem 30-s-Limit der HttpApi, damit Antworten der Lambda ankommen und kein 503 des Gateways
  timeoutSeconds: 28,
  memoryMB: 1024,
  resourceGroupName: "AppInfrastructure",
});
