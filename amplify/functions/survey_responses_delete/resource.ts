import { defineFunction } from "@aws-amplify/backend";

export const surveyResponsesDelete = defineFunction({
  runtime: 20,
  timeoutSeconds: 300,
  resourceGroupName: "AppInfrastructure",
});
