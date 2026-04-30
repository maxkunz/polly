import { defineFunction } from "@aws-amplify/backend";

export const onboarding = defineFunction({
  runtime: 20,
  timeoutSeconds: 30,
  resourceGroupName: "AppInfrastructure",
  environment: {
    RESOURCE_SERVER_IDENTIFIER: "backend",
    CLIENT_SCOPE: "invoke",
    SECRETS_PREFIX: "gc-clients",
  },
});
