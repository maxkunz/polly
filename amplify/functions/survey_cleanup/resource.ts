import { defineFunction } from "@aws-amplify/backend";

export const surveyCleanup = defineFunction({
  runtime: 20,
  timeoutSeconds: 30,
  resourceGroupName: "AppInfrastructure",
});
