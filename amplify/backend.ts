import { defineBackend } from "@aws-amplify/backend";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Fn, RemovalPolicy, Stack } from "aws-cdk-lib";
import { auth } from "./auth/resource";
import { onboarding } from "./functions/onboarding/resource";
import { surveyResponses } from "./functions/survey_responses/resource";
import { surveyCleanup } from "./functions/survey_cleanup/resource";
import { surveyResponsesExport } from "./functions/survey_responses_export/resource";
import { surveyResponsesDelete } from "./functions/survey_responses_delete/resource";
import { pollyArchyUpload } from "./functions/polly_archy_upload/resource";

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
// Optionale Genesys-Region (Amplify-Hosting-Umgebungsvariable), Default liegt in shared/tenant_auth.ts.
const genesysRegion = (process.env.GENESYS_REGION ?? "").trim();

const backend = defineBackend({
  auth,
  onboarding,
  surveyResponses,
  surveyResponsesExport,
  surveyResponsesDelete,
  surveyCleanup,
  pollyArchyUpload,
});

const stack = Stack.of(backend.onboarding.resources.lambda);

const httpApi = new apigw.HttpApi(stack, "AppHttpApi", {
  apiName: `app-api-${envSuffix}`,
  corsPreflight: {
    allowMethods: [apigw.CorsHttpMethod.ANY],
    allowOrigins: ["*"],
    allowHeaders: ["content-type", "authorization", "x-genesys-region"],
  },
});

const tokenUrl = `https://app-m2m-${envSuffix}.auth.${stack.region}.amazoncognito.com/oauth2/token`;

const archyUploadLambda = backend.pollyArchyUpload.resources.lambda as lambda.Function;
httpApi.addRoutes({
  path: "/archy-upload",
  methods: [apigw.HttpMethod.POST, apigw.HttpMethod.GET, apigw.HttpMethod.OPTIONS],
  integration: new integrations.HttpLambdaIntegration("ArchyUploadInteg", archyUploadLambda),
});

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

const surveyResponsesTable = new dynamodb.Table(stack, "SurveyResponsesTable", {
  partitionKey: { name: "tenantId", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "responseId", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
});

surveyResponsesTable.addGlobalSecondaryIndex({
  indexName: "byTenantSurvey",
  partitionKey: { name: "tenantId", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "surveyStartedAt", type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
});

surveyResponsesTable.addGlobalSecondaryIndex({
  indexName: "byStatus",
  partitionKey: { name: "status", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "updatedAt", type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.INCLUDE,
  nonKeyAttributes: ["tenantId", "surveyId", "surveyStartedAt"],
});

const surveyAggregatesTable = new dynamodb.Table(stack, "SurveyAggregatesTable", {
  partitionKey: { name: "tenantSurveyId", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "questionName", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
});

surveyAggregatesTable.addGlobalSecondaryIndex({
  indexName: "byTenant",
  partitionKey: { name: "tenantId", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "surveyId", type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
});

// Lösch-Jobs für Umfrage-Ergebnisse; ein Eintrag dient zugleich als Tombstone gegen neue Antworten.
// Abgeschlossene Jobs (done) laufen über TTL (expiresAt) ab.
const surveyDeletionJobsTable = new dynamodb.Table(stack, "SurveyDeletionJobsTable", {
  partitionKey: { name: "tenantId", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "surveyId", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: "expiresAt",
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
  if (genesysRegion) {
    fn.addEnvironment("GENESYS_REGION", genesysRegion);
  }
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
      "secretsmanager:DeleteSecret",
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
  path: "/onboarding/uninstall",
  methods: [apigw.HttpMethod.POST],
  integration: onboardingHttpIntegration,
});

httpApi.addRoutes({
  path: "/onboarding/delete",
  methods: [apigw.HttpMethod.POST],
  integration: onboardingHttpIntegration,
});

const surveyResponsesLambda = backend.surveyResponses.resources
  .lambda as lambda.Function;

surveyResponsesTable.grantReadWriteData(surveyResponsesLambda);
surveyAggregatesTable.grantReadWriteData(surveyResponsesLambda);
surveyResponsesLambda.addEnvironment(
  "SURVEY_RESPONSES_TABLE_NAME",
  surveyResponsesTable.tableName,
);
surveyResponsesLambda.addEnvironment(
  "SURVEY_AGGREGATES_TABLE_NAME",
  surveyAggregatesTable.tableName,
);
surveyDeletionJobsTable.grantReadData(surveyResponsesLambda);
surveyResponsesLambda.addEnvironment(
  "SURVEY_DELETION_JOBS_TABLE_NAME",
  surveyDeletionJobsTable.tableName,
);
attachTenantAuth(surveyResponsesLambda);

const surveyResponsesInteg = new integrations.HttpLambdaIntegration(
  "SurveyResponsesInteg",
  surveyResponsesLambda,
);

httpApi.addRoutes({
  path: "/survey-responses",
  methods: [apigw.HttpMethod.POST],
  integration: surveyResponsesInteg,
});

httpApi.addRoutes({
  path: "/survey-responses/aggregates",
  methods: [apigw.HttpMethod.GET],
  integration: surveyResponsesInteg,
});

httpApi.addRoutes({
  path: "/survey-responses/raw",
  methods: [apigw.HttpMethod.GET],
  integration: surveyResponsesInteg,
});

httpApi.addRoutes({
  path: "/survey-responses/session",
  methods: [apigw.HttpMethod.GET],
  integration: surveyResponsesInteg,
});

const surveyResponsesExportLambda = backend.surveyResponsesExport.resources
  .lambda as lambda.Function;

surveyResponsesTable.grantReadData(surveyResponsesExportLambda);
surveyResponsesExportLambda.addEnvironment(
  "SURVEY_RESPONSES_TABLE_NAME",
  surveyResponsesTable.tableName,
);
attachTenantAuth(surveyResponsesExportLambda);

const surveyResponsesExportInteg = new integrations.HttpLambdaIntegration(
  "SurveyResponsesExportInteg",
  surveyResponsesExportLambda,
);

httpApi.addRoutes({
  path: "/survey-responses/export",
  methods: [apigw.HttpMethod.GET],
  integration: surveyResponsesExportInteg,
});

httpApi.addRoutes({
  path: "/survey-responses/export/summary",
  methods: [apigw.HttpMethod.GET],
  integration: surveyResponsesExportInteg,
});

const surveyResponsesDeleteLambda = backend.surveyResponsesDelete.resources
  .lambda as lambda.Function;

const surveyDeletionDlq = new sqs.Queue(stack, "SurveyDeletionDlq", {
  queueName: `survey-deletion-dlq-${envSuffix}`,
  retentionPeriod: cdk.Duration.days(14),
});
const surveyDeletionQueue = new sqs.Queue(stack, "SurveyDeletionQueue", {
  queueName: `survey-deletion-${envSuffix}`,
  // Muss größer als das Lambda-Timeout (300 s) sein
  visibilityTimeout: cdk.Duration.seconds(330),
  deadLetterQueue: { queue: surveyDeletionDlq, maxReceiveCount: 3 },
});

surveyResponsesTable.grantReadWriteData(surveyResponsesDeleteLambda);
surveyAggregatesTable.grantReadWriteData(surveyResponsesDeleteLambda);
surveyDeletionJobsTable.grantReadWriteData(surveyResponsesDeleteLambda);
surveyDeletionQueue.grantSendMessages(surveyResponsesDeleteLambda);
surveyResponsesDeleteLambda.addEventSource(
  new SqsEventSource(surveyDeletionQueue, { batchSize: 1 }),
);
surveyResponsesDeleteLambda.addEnvironment(
  "SURVEY_RESPONSES_TABLE_NAME",
  surveyResponsesTable.tableName,
);
surveyResponsesDeleteLambda.addEnvironment(
  "SURVEY_AGGREGATES_TABLE_NAME",
  surveyAggregatesTable.tableName,
);
surveyResponsesDeleteLambda.addEnvironment(
  "SURVEY_DELETION_JOBS_TABLE_NAME",
  surveyDeletionJobsTable.tableName,
);
surveyResponsesDeleteLambda.addEnvironment(
  "SURVEY_DELETION_QUEUE_URL",
  surveyDeletionQueue.queueUrl,
);
attachTenantAuth(surveyResponsesDeleteLambda);

const surveyResponsesDeleteInteg = new integrations.HttpLambdaIntegration(
  "SurveyResponsesDeleteInteg",
  surveyResponsesDeleteLambda,
);

httpApi.addRoutes({
  path: "/survey-responses",
  methods: [apigw.HttpMethod.DELETE],
  integration: surveyResponsesDeleteInteg,
});

httpApi.addRoutes({
  path: "/survey-responses/delete-status",
  methods: [apigw.HttpMethod.GET],
  integration: surveyResponsesDeleteInteg,
});

const surveyCleanupLambda = backend.surveyCleanup.resources
  .lambda as lambda.Function;

surveyResponsesTable.grantReadWriteData(surveyCleanupLambda);
surveyCleanupLambda.addEnvironment(
  "SURVEY_RESPONSES_TABLE_NAME",
  surveyResponsesTable.tableName,
);
surveyCleanupLambda.addEnvironment("TIMEOUT_MINUTES", "30");

new events.Rule(stack, "SurveyCleanupRule", {
  schedule: events.Schedule.rate(cdk.Duration.minutes(15)),
  targets: [new targets.LambdaFunction(surveyCleanupLambda)],
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
