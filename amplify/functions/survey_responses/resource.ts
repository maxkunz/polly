import { defineFunction } from "@aws-amplify/backend";

export const surveyResponses = defineFunction({
  runtime: 20,
  timeoutSeconds: 15,
  resourceGroupName: "AppInfrastructure",
});
