import { defineFunction } from "@aws-amplify/backend";

export const questionAnswers = defineFunction({
  runtime: 20,
  timeoutSeconds: 10,
  resourceGroupName: "AppInfrastructure",
});
