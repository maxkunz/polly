import { defineFunction } from "@aws-amplify/backend";

export const surveysApi = defineFunction({
  runtime: 20,
  // Die HTTP API bricht nach 30 s ab, die Lambda muss davor antworten.
  timeoutSeconds: 29,
  memoryMB: 512,
  resourceGroupName: "AppInfrastructure",
});
