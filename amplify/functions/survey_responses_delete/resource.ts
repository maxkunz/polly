import { defineFunction } from "@aws-amplify/backend";

export const surveyResponsesDelete = defineFunction({
  runtime: 24,
  timeoutSeconds: 300,
  resourceGroupName: "AppInfrastructure",
});
