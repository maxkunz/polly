# app

A Genesys Cloud app ("Polly") for post-call surveys:

- tenant setup and onboarding
- a frontend for editing surveys and mapping them to queues
- publishing surveys to a Genesys Data Table, played back by an Architect flow
- a backend that stores survey responses in DynamoDB and exports them as CSV

## Overview

- surveys are edited in the frontend (draft) and deployed to stage/prod
- each survey is stored as a row (`survey_<id>`) in a Genesys Data Table
- a second Data Table maps queues to surveys
- the Architect flow submits answers step by step via a Genesys Data Action
- the backend stores sessions and aggregates in DynamoDB

## Architecture

### Frontend

The frontend is a Vue 3 application using Pinia and PrimeVue.

Main areas:

- `Dashboard`
  - entry point into the available modules
- `Surveys`
  - survey editor, deploy/rollback, queue mapping and response export
- `Settings`
  - displays setup context

### Setup

The setup flow consists of:

- selecting the existing app integration
- selecting the existing frontend OAuth client
- selecting an existing division or creating a new division
- installing the required resources

During setup, the following resources are created or configured:

- a Genesys Data Table for surveys (`<projectTag>_polly_surveys`)
- a Genesys Data Table for the queue mapping (`<projectTag>_polly_mapping`)
- a Genesys backend OAuth client
- a Web Services Data Actions integration
- a Data Action for submitting survey responses
- backend onboarding in AWS
- the redirect URL of the frontend OAuth client
- the launch URL of the app integration

All created resources are stored in `meta.setup` in the `__meta` row of the Data Table. These metadata are used by the uninstall flow.

### Backend

The backend is implemented with Amplify Gen 2 and contains the components required for authentication, onboarding, and response processing:

- `auth`
  - base Cognito resource for the backend
- `onboarding`
  - creates tenant-specific backend clients
  - stores tenant metadata in DynamoDB
  - manages tenant-specific Genesys credentials in Secrets Manager
- `survey_responses`
  - processes step-by-step answers from Genesys call flows
  - upserts session answers into `SurveyResponsesTable` (supports partial / completed states)
  - incrementally updates live statistics in `SurveyAggregatesTable`
  - exposes reporting endpoints for aggregates and raw session exports
- `survey_cleanup`
  - scheduled job (EventBridge, every 15 minutes)
  - flags abandoned sessions older than 30 minutes as `timed_out`

Additional infrastructure:

- `TenantsTable`
  - stores tenant metadata for onboarding
- `SurveyResponsesTable`
  - stores raw call session responses and question answers per tenant
- `SurveyAggregatesTable`
  - stores real-time aggregated survey statistics per tenant and question
- `HttpApi`
  - exposes onboarding and survey responses endpoints

### Onboarding

The onboarding flow connects Genesys Cloud to the AWS backend.

Flow:

1. Setup calls `/api/onboarding/start`
2. The backend creates a tenant-specific Cognito app client
3. Setup creates a Genesys backend OAuth client
4. Setup creates a Data Action integration and a Data Action
5. Setup completes backend onboarding through `/api/onboarding/complete`
6. Genesys credentials and allowed Data Table IDs are stored per tenant

This allows the backend to authenticate and process requests in a tenant-specific way.

## Genesys Data Tables

Surveys are stored in a Genesys Data Table with the columns `key`, `Draft`, `Stage`, `Prod`, `Backup`, `lock`:

- `__meta`
  - global app metadata and setup metadata
- `__lock`
  - lock information for the full configuration
- `survey_list`
  - index of all surveys
- `survey_<id>`
  - one row per survey

The queue mapping is stored in a separate Data Table (`QueueName`, `SurveyId`, `DeliveryRate`), see `documentation/datatablerow_queue_mapping.md`.

## Response Storage

Responses are not stored in the Data Table. They are stored in DynamoDB (`SurveyResponsesTable`, `SurveyAggregatesTable`), see `documentation/survey_responses_api.md`.

## Install and Uninstall

### Install

The install flow:

1. creates or selects a division
2. creates the survey and mapping Data Tables
3. writes `__lock`, `__meta` and `survey_list`
4. creates the Genesys backend OAuth client
5. starts AWS onboarding
6. creates the Data Action integration and Data Action
7. completes AWS onboarding
8. updates the frontend OAuth client and app integration to the launch URL
9. stores all created resources in `meta.setup`

### Botflow aktualisieren

In den Settings steht links neben „Deinstallieren“ der Button „Botflow aktualisieren“.
Er verwendet dieselbe Git-Vorlage (`src/templates/genesys/botFlowStructure.yaml`) und
denselben Architect-Import wie die Installation. Die Ressourcennamen werden aus
`meta.setup` eingesetzt; der vorhandene Botflow wird aktualisiert. Eigene Anpassungen
im Botflow werden dabei überschrieben. Die Vorlage entspricht dem Stand der
bereitgestellten App. Während des Updates sind Export und Deinstallation gesperrt;
Erfolg und Fehler werden als Meldung angezeigt.

### Uninstall

The uninstall flow uses `meta.setup` to remove the installation:

- reset frontend OAuth redirect URL
- reset app integration URL
- delete the Data Action
- delete the Data Action integration
- delete the Genesys backend OAuth client
- delete AWS onboarding resources
  - Cognito backend app client
  - tenant entry in DynamoDB
  - tenant-specific secret
- delete the Data Tables
- delete the division if it was created by setup

## Important Files

Frontend:

- `src/pages/surveys.vue`
- `src/pages/SetupOrchestrator.vue`
- `src/pages/SetupUninstall.vue`
- `src/stores/appStore.ts`
- `src/services/genesys_helper.ts`

Backend:

- `amplify/backend.ts`
- `amplify/functions/onboarding/handler.ts`
- `amplify/functions/survey_responses/handler.ts`
- `amplify/functions/survey_cleanup/handler.ts`
- `amplify/functions/shared/tenant_auth.ts`

Documentation:

- `documentation/survey_definition.md`
- `documentation/survey_responses_api.md`

## Development

Install dependencies:

```bash
npm install
```

Build the frontend:

```bash
npm run build
```

Start the local dev server:

```bash
npm run dev
```

## Notes

- The template uses the existing `/api/...` path for backend requests.
- The Genesys region is derived from `gcHostOrigin` at runtime.
