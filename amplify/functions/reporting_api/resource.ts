import { defineFunction } from "@aws-amplify/backend";

export const reportingApi = defineFunction({
  runtime: 20,
  // Die HTTP API bricht nach 30 s ab, die Lambda muss davor antworten.
  timeoutSeconds: 29,
  memoryMB: 1024,
  resourceGroupName: "AppInfrastructure",
});
