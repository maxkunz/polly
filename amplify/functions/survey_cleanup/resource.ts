import { defineFunction } from "@aws-amplify/backend";

export const surveyCleanup = defineFunction({
  runtime: 24,
  timeoutSeconds: 30,
  resourceGroupName: "AppInfrastructure",
});
