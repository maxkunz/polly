import { defineBackend } from "@aws-amplify/backend";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Fn, RemovalPolicy, Stack } from "aws-cdk-lib";
import { auth } from "./auth/resource";
import { onboarding } from "./functions/onboarding/resource";
import { questionAnswers } from "./functions/question_answers/resource";

const rawBranchName = (
  process.env.AWS_BRANCH ||
  process.env.AMPLIFY_BRANCH ||
  "local"
).toLowerCase();
const safeBranchName =
  rawBranchName
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20) || "local";

const appId = (
  process.env.AMPLIFY_APP_ID ||
  process.env.AWS_APP_ID ||
  "app"
).toLowerCase();
const envSuffix = `${appId}-${safeBranchName}`;
const tenantSecretsPrefix = `gc-clients/${envSuffix}`;

const backend = defineBackend({
  auth,
  onboarding,
  questionAnswers,
});

const stack = Stack.of(backend.onboarding.resources.lambda);

const httpApi = new apigw.HttpApi(stack, "AppHttpApi", {
  apiName: `app-api-${envSuffix}`,
  corsPreflight: {
    allowMethods: [apigw.CorsHttpMethod.ANY],
    allowOrigins: ["*"],
    allowHeaders: ["content-type", "authorization"],
  },
});

const tokenUrl = `https://app-m2m-${envSuffix}.auth.${stack.region}.amazoncognito.com/oauth2/token`;

const tenantsTable = new dynamodb.Table(stack, "TenantsTable", {
  partitionKey: {
    name: "backendClientId",
    type: dynamodb.AttributeType.STRING,
  },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
});

tenantsTable.addGlobalSecondaryIndex({
  indexName: "byTenantId",
  partitionKey: { name: "tenantId", type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
});

const questionAnswersTable = new dynamodb.Table(stack, "QuestionAnswersTable", {
  partitionKey: { name: "tenantId", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "questionId", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
});

const tenantAuthIssuer = `https://cognito-idp.${stack.region}.amazonaws.com/${backend.auth.resources.userPool.userPoolId}`;

const tenantSecretsArn = stack.formatArn({
  service: "secretsmanager",
  resource: "secret",
  resourceName: `${tenantSecretsPrefix}/*`,
  arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
});

function attachTenantAuth(fn: lambda.Function) {
  tenantsTable.grantReadData(fn);
  fn.addEnvironment("TENANTS_TABLE_NAME", tenantsTable.tableName);
  fn.addEnvironment("USER_POOL_ID", backend.auth.resources.userPool.userPoolId);
  fn.addEnvironment("COGNITO_ISSUER", tenantAuthIssuer);
  fn.addEnvironment("SECRETS_PREFIX", tenantSecretsPrefix);
  fn.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [tenantSecretsArn],
    }),
  );
}

const onboardingLambda = backend.onboarding.resources.lambda as lambda.Function;
const onboardingCfn = onboardingLambda.node.defaultChild as lambda.CfnFunction;

tenantsTable.grantReadWriteData(onboardingLambda);

const onboardingAdminToken = new secretsmanager.Secret(
  stack,
  "OnboardingAdminToken",
  {
    generateSecretString: {
      passwordLength: 48,
      excludePunctuation: true,
    },
  },
);

onboardingAdminToken.grantRead(onboardingLambda);

onboardingCfn.addPropertyOverride(
  "Environment.Variables.ADMIN_TOKEN_SECRET_ARN",
  onboardingAdminToken.secretArn,
);
onboardingCfn.addPropertyOverride(
  "Environment.Variables.TENANTS_TABLE_NAME",
  tenantsTable.tableName,
);
onboardingCfn.addPropertyOverride(
  "Environment.Variables.USER_POOL_ID",
  backend.auth.resources.userPool.userPoolId,
);
onboardingCfn.addPropertyOverride("Environment.Variables.TOKEN_URL", tokenUrl);
onboardingCfn.addPropertyOverride(
  "Environment.Variables.SECRETS_PREFIX",
  tenantSecretsPrefix,
);

new cognito.UserPoolResourceServer(stack, "BackendResourceServer", {
  userPool: backend.auth.resources.userPool,
  identifier: "backend",
  scopes: [{ scopeName: "invoke", scopeDescription: "Invoke backend APIs" }],
});

new cognito.CfnUserPoolDomain(stack, "UserPoolDomain", {
  userPoolId: backend.auth.resources.userPool.userPoolId,
  domain: Fn.sub(`app-m2m-${envSuffix}`),
});

onboardingLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: [
      "cognito-idp:CreateUserPoolClient",
      "cognito-idp:UpdateUserPoolClient",
      "cognito-idp:DescribeUserPoolClient",
      "cognito-idp:DeleteUserPoolClient",
    ],
    resources: [backend.auth.resources.userPool.userPoolArn],
  }),
);

onboardingLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: [
      "secretsmanager:CreateSecret",
      "secretsmanager:PutSecretValue",
      "secretsmanager:UpdateSecret",
      "secretsmanager:DescribeSecret",
      "secretsmanager:GetSecretValue",
      "secretsmanager:TagResource",
    ],
    resources: ["*"],
  }),
);

const onboardingHttpIntegration = new integrations.HttpLambdaIntegration(
  "OnboardingHttpIntegration",
  onboardingLambda,
);

httpApi.addRoutes({
  path: "/onboarding/start",
  methods: [apigw.HttpMethod.POST],
  integration: onboardingHttpIntegration,
});

httpApi.addRoutes({
  path: "/onboarding/complete",
  methods: [apigw.HttpMethod.POST],
  integration: onboardingHttpIntegration,
});

httpApi.addRoutes({
  path: "/onboarding/approve",
  methods: [apigw.HttpMethod.POST],
  integration: onboardingHttpIntegration,
});

httpApi.addRoutes({
  path: "/onboarding/delete",
  methods: [apigw.HttpMethod.POST],
  integration: onboardingHttpIntegration,
});

const questionAnswersLambda = backend.questionAnswers.resources
  .lambda as lambda.Function;

questionAnswersTable.grantReadWriteData(questionAnswersLambda);
questionAnswersLambda.addEnvironment(
  "QUESTION_ANSWERS_TABLE_NAME",
  questionAnswersTable.tableName,
);
attachTenantAuth(questionAnswersLambda);

httpApi.addRoutes({
  path: "/question-answers",
  methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST],
  integration: new integrations.HttpLambdaIntegration(
    "QuestionAnswersInteg",
    questionAnswersLambda,
  ),
});

backend.addOutput({
  custom: {
    apiUrl: httpApi.url,
    tokenUrl,
    envDebug: {
      awsBranch: process.env.AWS_BRANCH ?? "",
      amplifyBranch: process.env.AMPLIFY_BRANCH ?? "",
      amplifyAppId: process.env.AMPLIFY_APP_ID ?? "",
      awsAppId: process.env.AWS_APP_ID ?? "",
      stackName: stack.stackName,
      stackId: stack.stackId,
      stackRegion: stack.region,
      rawBranchName,
      safeBranchName,
      envSuffix,
    },
  },
});
