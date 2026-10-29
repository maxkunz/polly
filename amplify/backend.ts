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
import { reportingApi } from "./functions/reporting_api/resource";
import { surveysApi } from "./functions/surveys_api/resource";
import { surveyResponsesDelete } from "./functions/survey_responses_delete/resource";
import { pollyArchyUpload } from "./functions/polly_archy_upload/resource";
import { invitations } from "./functions/invitations/resource";
import { webSurvey } from "./functions/web_survey/resource";
import { webThemes } from "./functions/web_themes/resource";
import { API_RESOURCE_SERVER, API_SCOPES, API_SCOPE_DESCRIPTIONS } from "./functions/shared/api_scopes";

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
// Ursprung der Polly-Umfrageseite für Einladungslinks der Kunden-API ohne base_url. Amplify-Hosting-Domain:
// Branch mit "-" statt Zeichen, die im Hostnamen nicht erlaubt sind ("/", "_", "." …), nicht gekürzt
// (anders als safeBranchName). Eigene Domain oder abweichender Branch-Name: Variable WEB_SURVEY_ORIGIN setzen.
const webSurveyOriginFromEnv = process.env.WEB_SURVEY_ORIGIN?.trim();
const webSurveyOrigin = (
  webSurveyOriginFromEnv ||
  `https://${rawBranchName.replace(/[^a-z0-9-]/g, "-")}.${appId}.amplifyapp.com`
).replace(/\/+$/, "");
if (!webSurveyOriginFromEnv && appId === "app") {
  // Sandbox ohne Amplify-Hosting: abgeleitete Domain existiert nicht
  console.warn(`[backend] WEB_SURVEY_ORIGIN fehlt, Links der Kunden-API ohne base_url zeigen auf ${webSurveyOrigin}`);
}
const tenantSecretsPrefix = `gc-clients/${envSuffix}`;
// Optionale Genesys-Region (Amplify-Hosting-Umgebungsvariable), Default liegt in shared/tenant_auth.ts.
const genesysRegion = (process.env.GENESYS_REGION ?? "").trim();

// Drosselung der öffentlichen Web-Umfrage-Routen. Gilt pro Route für alle Mandanten zusammen (nicht pro IP)
// und schützt nur das Backend vor Überlast; daher großzügig, damit große Kampagnen nicht ausgebremst werden.
// Begründung: documentation/polly_web.md, Abschnitt „Drosselung“.
const WEB_SURVEY_GET_THROTTLE = { rateLimit: 200, burstLimit: 500 };
const WEB_SURVEY_SUBMIT_THROTTLE = { rateLimit: 100, burstLimit: 300 };
// Reservierte Parallelität der Lambda web_survey, damit eine Flut auf der öffentlichen Seite nicht das
// Lambda-Kontingent des Kontos aufbraucht (Data Action des Telefon-Flows). Nur per Amplify-Umgebungsvariable
// WEB_SURVEY_RESERVED_CONCURRENCY (z. B. "50"); ohne sie keine Reservierung, weil AWS mindestens 100 nicht
// reservierte Ausführungen verlangt und der Deploy auf Konten mit kleinem Kontingent sonst scheitert.
const webSurveyReservedConcurrency = Number.parseInt(process.env.WEB_SURVEY_RESERVED_CONCURRENCY ?? "0", 10);

const backend = defineBackend({
  auth,
  onboarding,
  surveyResponses,
  surveyResponsesExport,
  surveyResponsesDelete,
  surveyCleanup,
  pollyArchyUpload,
  invitations,
  webSurvey,
  webThemes,
  reportingApi,
  surveysApi,
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

// Benutzte Einmal-Einladungen des Web-Kanals (nur diese, erzeugte Tokens werden nicht gespeichert).
// Das Ablaufdatum der Einladung heißt exp (JWT), die Löschfrist des Eintrags ttl (Nutzung + 180 Tage).
const invitationTokensTable = new dynamodb.Table(stack, "InvitationTokensTable", {
  partitionKey: { name: "tenantId", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "tokenId", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: "ttl",
  removalPolicy: RemovalPolicy.RETAIN,
});

// Für den Lösch-Worker: alle Tokens einer Umfrage
invitationTokensTable.addGlobalSecondaryIndex({
  indexName: "byTenantSurvey",
  partitionKey: { name: "tenantSurveyId", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "usedAt", type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.KEYS_ONLY,
});

// Web-Designs der öffentlichen Umfrageseite (Tokens, kein CSS), gepflegt in der App. Höchstens 50 pro
// Mandant (prüft die Lambda web_themes); web_survey liest sie mit einer Query auf tenantId.
const webSurveyThemesTable = new dynamodb.Table(stack, "WebSurveyThemesTable", {
  partitionKey: { name: "tenantId", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "themeId", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
});

// API-Clients der Kunden-API (/ext/v1): Cognito-Client (Client Credentials) → Mandant und Status.
// Legt das Betriebsteam über /onboarding/api-clients/* an; ohne Eintrag mit Status ACTIVE wird jedes
// Token abgelehnt (resolveApiClient in shared/api_client_auth.ts).
const apiClientsTable = new dynamodb.Table(stack, "ApiClientsTable", {
  partitionKey: { name: "clientId", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
});

// Clients eines Mandanten (Liste, Aufräumen beim Löschen des Mandanten)
apiClientsTable.addGlobalSecondaryIndex({
  indexName: "byTenantId",
  partitionKey: { name: "tenantId", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "clientId", type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
});

// Signaturschlüssel der Einladungen (HS256), ein Schlüssel pro Umgebung. Verlässt AWS nie: Die Lambdas
// bekommen nur den ARN. RETAIN, weil ein neuer Schlüssel alle verschickten Links ungültig machen würde.
const webSurveyJwtSecret = new secretsmanager.Secret(stack, "WebSurveyJwtSecret", {
  secretName: `polly-web-survey-jwt-${envSuffix}`,
  description: "Signaturschlüssel der Einladungslinks des Web-Kanals (HS256)",
  generateSecretString: {
    passwordLength: 64,
    excludePunctuation: true,
  },
  removalPolicy: RemovalPolicy.RETAIN,
});

const tenantAuthIssuer = `https://cognito-idp.${stack.region}.amazonaws.com/${backend.auth.resources.userPool.userPoolId}`;

const tenantSecretsArn = stack.formatArn({
  service: "secretsmanager",
  resource: "secret",
  resourceName: `${tenantSecretsPrefix}/*`,
  arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
});

// Nur Cognito-Prüfung und Mandanteneintrag, ohne Zugriff auf die Genesys-Secrets (Kunden-API über resolveApiClient)
function attachApiClientAuth(fn: lambda.Function) {
  tenantsTable.grantReadData(fn);
  fn.addEnvironment("TENANTS_TABLE_NAME", tenantsTable.tableName);
  fn.addEnvironment("USER_POOL_ID", backend.auth.resources.userPool.userPoolId);
  fn.addEnvironment("COGNITO_ISSUER", tenantAuthIssuer);
}

function attachTenantAuth(fn: lambda.Function) {
  attachApiClientAuth(fn);
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

apiClientsTable.grantReadWriteData(onboardingLambda);
onboardingCfn.addPropertyOverride(
  "Environment.Variables.API_CLIENTS_TABLE_NAME",
  apiClientsTable.tableName,
);

new cognito.UserPoolResourceServer(stack, "BackendResourceServer", {
  userPool: backend.auth.resources.userPool,
  identifier: "backend",
  scopes: [{ scopeName: "invoke", scopeDescription: "Invoke backend APIs" }],
});

// Fachliche Scopes der Kunden-API, ohne Mandant und ohne Version (siehe shared/api_scopes.ts)
new cognito.UserPoolResourceServer(stack, "PollyApiResourceServer", {
  userPool: backend.auth.resources.userPool,
  identifier: API_RESOURCE_SERVER,
  scopes: API_SCOPES.map((scopeName) => ({
    scopeName,
    scopeDescription: API_SCOPE_DESCRIPTIONS[scopeName],
  })),
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

// API-Clients der Kunden-API verwalten (Admin-Token), Anleitung: documentation/betrieb_api_zugaenge.md
for (const action of ["create", "list", "delete"]) {
  httpApi.addRoutes({
    path: `/onboarding/api-clients/${action}`,
    methods: [apigw.HttpMethod.POST],
    integration: onboardingHttpIntegration,
  });
}

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
invitationTokensTable.grantReadWriteData(surveyResponsesDeleteLambda);
surveyResponsesDeleteLambda.addEnvironment(
  "INVITATION_TOKENS_TABLE_NAME",
  invitationTokensTable.tableName,
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

// ---------------------------------------------------------------------------
// Web-Kanal: Einladungen (Genesys-User mit polly_deploy) und öffentliche Umfrageseite
// ---------------------------------------------------------------------------

const invitationsLambda = backend.invitations.resources.lambda as lambda.Function;

webSurveyJwtSecret.grantRead(invitationsLambda);
invitationsLambda.addEnvironment("WEB_SURVEY_JWT_SECRET_ARN", webSurveyJwtSecret.secretArn);
// Prüfung auf laufende Löschung der Umfrage (loadProdSurvey)
surveyDeletionJobsTable.grantReadData(invitationsLambda);
invitationsLambda.addEnvironment(
  "SURVEY_DELETION_JOBS_TABLE_NAME",
  surveyDeletionJobsTable.tableName,
);
attachTenantAuth(invitationsLambda);
// Kunden-API: Anmeldung über resolveApiClient, Links ohne base_url zeigen auf die Polly-Umfrageseite
apiClientsTable.grantReadData(invitationsLambda);
invitationsLambda.addEnvironment("API_CLIENTS_TABLE_NAME", apiClientsTable.tableName);
invitationsLambda.addEnvironment("WEB_SURVEY_ORIGIN", webSurveyOrigin);

const invitationsInteg = new integrations.HttpLambdaIntegration("InvitationsInteg", invitationsLambda);

httpApi.addRoutes({
  path: "/invitations",
  methods: [apigw.HttpMethod.POST],
  integration: invitationsInteg,
});
// Webvorschau des Stage-Stands (Token mit stage: true, 7 Tage gültig)
httpApi.addRoutes({
  path: "/invitations/preview",
  methods: [apigw.HttpMethod.POST],
  integration: invitationsInteg,
});

const extInvitationsRoutes = httpApi.addRoutes({
  path: "/ext/v1/invitations",
  methods: [apigw.HttpMethod.POST],
  integration: invitationsInteg,
});

const webSurveyLambda = backend.webSurvey.resources.lambda as lambda.Function;

webSurveyJwtSecret.grantRead(webSurveyLambda);
webSurveyLambda.addEnvironment("WEB_SURVEY_JWT_SECRET_ARN", webSurveyJwtSecret.secretArn);
invitationTokensTable.grantReadWriteData(webSurveyLambda);
webSurveyLambda.addEnvironment(
  "INVITATION_TOKENS_TABLE_NAME",
  invitationTokensTable.tableName,
);
surveyResponsesTable.grantReadWriteData(webSurveyLambda);
webSurveyLambda.addEnvironment(
  "SURVEY_RESPONSES_TABLE_NAME",
  surveyResponsesTable.tableName,
);
surveyAggregatesTable.grantReadWriteData(webSurveyLambda);
webSurveyLambda.addEnvironment(
  "SURVEY_AGGREGATES_TABLE_NAME",
  surveyAggregatesTable.tableName,
);
surveyDeletionJobsTable.grantReadData(webSurveyLambda);
webSurveyLambda.addEnvironment(
  "SURVEY_DELETION_JOBS_TABLE_NAME",
  surveyDeletionJobsTable.tableName,
);
webSurveyThemesTable.grantReadData(webSurveyLambda);
webSurveyLambda.addEnvironment("WEB_THEMES_TABLE_NAME", webSurveyThemesTable.tableName);
// Öffentlich ohne Login: attachTenantAuth liefert hier nur Tenants-Tabelle und Tenant-Secret
// (Genesys-Credentials zum Lesen des Prod-Stands), der Handler ruft resolveTenantContext nicht auf.
attachTenantAuth(webSurveyLambda);

if (Number.isInteger(webSurveyReservedConcurrency) && webSurveyReservedConcurrency > 0) {
  (webSurveyLambda.node.defaultChild as lambda.CfnFunction).reservedConcurrentExecutions =
    webSurveyReservedConcurrency;
}

const webSurveyInteg = new integrations.HttpLambdaIntegration("WebSurveyInteg", webSurveyLambda);

const webSurveyRoutes = [
  ...httpApi.addRoutes({
    path: "/web-survey",
    methods: [apigw.HttpMethod.GET],
    integration: webSurveyInteg,
  }),
  ...httpApi.addRoutes({
    path: "/web-survey/submit",
    methods: [apigw.HttpMethod.POST],
    integration: webSurveyInteg,
  }),
];

// Kunden-API (/ext/v1), Anmeldung über resolveApiClient (Cognito Client Credentials + ApiClientsTable)
const reportingApiLambda = backend.reportingApi.resources.lambda as lambda.Function;

surveyResponsesTable.grantReadData(reportingApiLambda);
reportingApiLambda.addEnvironment("SURVEY_RESPONSES_TABLE_NAME", surveyResponsesTable.tableName);
apiClientsTable.grantReadData(reportingApiLambda);
reportingApiLambda.addEnvironment("API_CLIENTS_TABLE_NAME", apiClientsTable.tableName);
// Aggregate und die Prüfung auf laufende Löschungen (nur lesend)
surveyAggregatesTable.grantReadData(reportingApiLambda);
reportingApiLambda.addEnvironment("SURVEY_AGGREGATES_TABLE_NAME", surveyAggregatesTable.tableName);
surveyDeletionJobsTable.grantReadData(reportingApiLambda);
reportingApiLambda.addEnvironment("SURVEY_DELETION_JOBS_TABLE_NAME", surveyDeletionJobsTable.tableName);
attachApiClientAuth(reportingApiLambda);

const reportingApiInteg = new integrations.HttpLambdaIntegration("ReportingApiInteg", reportingApiLambda);

const reportingApiRoutes = [
  ...httpApi.addRoutes({
    path: "/ext/v1/reporting/data",
    methods: [apigw.HttpMethod.GET],
    integration: reportingApiInteg,
  }),
  ...httpApi.addRoutes({
    path: "/ext/v1/reporting/summary",
    methods: [apigw.HttpMethod.GET],
    integration: reportingApiInteg,
  }),
  ...httpApi.addRoutes({
    path: "/ext/v1/reporting/aggregates",
    methods: [apigw.HttpMethod.GET],
    integration: reportingApiInteg,
  }),
];

// Umfragedetails: liest den Prod-Stand über die Genesys-Credentials des Mandanten (attachTenantAuth), dazu Designs
// und laufende Löschungen
const surveysApiLambda = backend.surveysApi.resources.lambda as lambda.Function;

apiClientsTable.grantReadData(surveysApiLambda);
surveysApiLambda.addEnvironment("API_CLIENTS_TABLE_NAME", apiClientsTable.tableName);
surveyDeletionJobsTable.grantReadData(surveysApiLambda);
surveysApiLambda.addEnvironment("SURVEY_DELETION_JOBS_TABLE_NAME", surveyDeletionJobsTable.tableName);
webSurveyThemesTable.grantReadData(surveysApiLambda);
surveysApiLambda.addEnvironment("WEB_THEMES_TABLE_NAME", webSurveyThemesTable.tableName);
attachTenantAuth(surveysApiLambda);

const surveysApiInteg = new integrations.HttpLambdaIntegration("SurveysApiInteg", surveysApiLambda);

const surveysApiRoutes = [
  ...httpApi.addRoutes({
    path: "/ext/v1/surveys",
    methods: [apigw.HttpMethod.GET],
    integration: surveysApiInteg,
  }),
  ...httpApi.addRoutes({
    path: "/ext/v1/surveys/{surveyId}",
    methods: [apigw.HttpMethod.GET],
    integration: surveysApiInteg,
  }),
];

// Drosselung der Kunden-API pro Route, für alle Mandanten und Clients zusammen (keine Grenze pro Client).
// Ein Client in einer Schleife kann damit andere ausbremsen; dokumentiert in polly_customer_api.md, Abschnitt 3.
const REPORTING_API_THROTTLE = { rateLimit: 20, burstLimit: 40 };
// Jeder Aufruf zählt bis zu 31 Tage Sitzungen im Speicher
const REPORTING_SUMMARY_THROTTLE = { rateLimit: 10, burstLimit: 20 };
// Jeder Aufruf signiert bis zu 5000 Einladungen und ruft Genesys auf
const EXT_INVITATIONS_THROTTLE = { rateLimit: 5, burstLimit: 10 };
// Jeder Aufruf der Liste liest die Zeilen der Data Table bei Genesys (Antworten werden 60 s gecacht)
const EXT_SURVEYS_THROTTLE = { rateLimit: 10, burstLimit: 20 };
// Export liest alle Designs des Mandanten, der Import schreibt bis zu 50 in einer Transaktion
const EXT_THEMES_EXPORT_THROTTLE = { rateLimit: 10, burstLimit: 20 };
const EXT_THEMES_IMPORT_THROTTLE = { rateLimit: 5, burstLimit: 10 };

// Drosselung pro Route in der Default-Stage (L2 kennt nur stage-weite Werte)
const defaultStage = httpApi.defaultStage;
if (defaultStage) {
  const defaultStageCfn = defaultStage.node.defaultChild as apigw.CfnStage;
  defaultStageCfn.routeSettings = {
    "GET /web-survey": {
      ThrottlingRateLimit: WEB_SURVEY_GET_THROTTLE.rateLimit,
      ThrottlingBurstLimit: WEB_SURVEY_GET_THROTTLE.burstLimit,
    },
    "POST /web-survey/submit": {
      ThrottlingRateLimit: WEB_SURVEY_SUBMIT_THROTTLE.rateLimit,
      ThrottlingBurstLimit: WEB_SURVEY_SUBMIT_THROTTLE.burstLimit,
    },
    "GET /ext/v1/reporting/data": {
      ThrottlingRateLimit: REPORTING_API_THROTTLE.rateLimit,
      ThrottlingBurstLimit: REPORTING_API_THROTTLE.burstLimit,
    },
    "GET /ext/v1/reporting/summary": {
      ThrottlingRateLimit: REPORTING_SUMMARY_THROTTLE.rateLimit,
      ThrottlingBurstLimit: REPORTING_SUMMARY_THROTTLE.burstLimit,
    },
    "GET /ext/v1/reporting/aggregates": {
      ThrottlingRateLimit: REPORTING_API_THROTTLE.rateLimit,
      ThrottlingBurstLimit: REPORTING_API_THROTTLE.burstLimit,
    },
    "POST /ext/v1/invitations": {
      ThrottlingRateLimit: EXT_INVITATIONS_THROTTLE.rateLimit,
      ThrottlingBurstLimit: EXT_INVITATIONS_THROTTLE.burstLimit,
    },
    "GET /ext/v1/surveys": {
      ThrottlingRateLimit: EXT_SURVEYS_THROTTLE.rateLimit,
      ThrottlingBurstLimit: EXT_SURVEYS_THROTTLE.burstLimit,
    },
    "GET /ext/v1/surveys/{surveyId}": {
      ThrottlingRateLimit: EXT_SURVEYS_THROTTLE.rateLimit,
      ThrottlingBurstLimit: EXT_SURVEYS_THROTTLE.burstLimit,
    },
    "GET /ext/v1/web-themes": {
      ThrottlingRateLimit: EXT_THEMES_EXPORT_THROTTLE.rateLimit,
      ThrottlingBurstLimit: EXT_THEMES_EXPORT_THROTTLE.burstLimit,
    },
    "POST /ext/v1/web-themes/import": {
      ThrottlingRateLimit: EXT_THEMES_IMPORT_THROTTLE.rateLimit,
      ThrottlingBurstLimit: EXT_THEMES_IMPORT_THROTTLE.burstLimit,
    },
  };
  // Die Routen müssen existieren, bevor die Stage auf sie verweist
  defaultStage.node.addDependency(...webSurveyRoutes, ...reportingApiRoutes, ...extInvitationsRoutes, ...surveysApiRoutes);
}

// Pflege der Web-Designs (lesen: jeder App-Nutzer, schreiben: Genesys-User mit polly_deploy)
const webThemesLambda = backend.webThemes.resources.lambda as lambda.Function;

webSurveyThemesTable.grantReadWriteData(webThemesLambda);
webThemesLambda.addEnvironment("WEB_THEMES_TABLE_NAME", webSurveyThemesTable.tableName);
// Kunden-API (Export/Import): Prüfung des API-Clients über resolveApiClient
apiClientsTable.grantReadData(webThemesLambda);
webThemesLambda.addEnvironment("API_CLIENTS_TABLE_NAME", apiClientsTable.tableName);
attachTenantAuth(webThemesLambda);

const webThemesInteg = new integrations.HttpLambdaIntegration("WebThemesInteg", webThemesLambda);

httpApi.addRoutes({
  path: "/web-themes",
  methods: [apigw.HttpMethod.GET],
  integration: webThemesInteg,
});

httpApi.addRoutes({
  path: "/web-themes/{id}",
  methods: [apigw.HttpMethod.PUT, apigw.HttpMethod.DELETE],
  integration: webThemesInteg,
});

// Kunden-API: Web-Designs exportieren und importieren (Scopes themes.read / themes.write)
const extWebThemesRoutes = [
  ...httpApi.addRoutes({
    path: "/ext/v1/web-themes",
    methods: [apigw.HttpMethod.GET],
    integration: webThemesInteg,
  }),
  ...httpApi.addRoutes({
    path: "/ext/v1/web-themes/import",
    methods: [apigw.HttpMethod.POST],
    integration: webThemesInteg,
  }),
];
// Die Stage verweist über routeSettings auf diese Routen (der Block steht weiter oben)
defaultStage?.node.addDependency(...extWebThemesRoutes);

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
