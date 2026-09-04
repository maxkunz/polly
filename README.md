# app

A compact Genesys Cloud app template built around a small, complete vertical slice:

- tenant setup and onboarding
- a frontend for managing rating questions
- publishing questions to a Genesys Data Table
- a backend Lambda for counting numeric responses
- displaying current response totals in the frontend

## Overview

The template implements a small survey application:

- questions are managed in the frontend
- questions are stored as individual rows in a Genesys Data Table
- a dialog or a Genesys Data Action can submit answers to the backend
- the backend increments response counters per question and numeric value in DynamoDB
- the frontend displays configuration and current response totals side by side

## Architecture

### Frontend

The frontend is a Vue 3 application using Pinia and PrimeVue.

Main areas:

- `Dashboard`
  - entry point into the available modules
- `Questions`
  - manages questions with `name`, `prompt`, `reprompt`, `minValue`, `maxValue`, `enabled`
  - displays current response counts per question
- `Settings`
  - displays setup context

Question configuration is loaded from a Genesys Data Table and synchronized back to it.

### Setup

The setup flow consists of:

- selecting the existing app integration
- selecting the existing frontend OAuth client
- selecting an existing division or creating a new division
- installing the required resources

During setup, the following resources are created or configured:

- a Genesys Data Table for questions
- a Genesys backend OAuth client
- a Web Services Data Actions integration
- a Data Action for `question-answers`
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
- `question_answers`
  - accepts `questionId` and `value`
  - increments the matching counter atomically in DynamoDB
  - returns aggregated response totals
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
- `QuestionAnswersTable`
  - stores response aggregates per tenant and question (PoC)
- `SurveyResponsesTable`
  - stores raw call session responses and question answers per tenant
- `SurveyAggregatesTable`
  - stores real-time aggregated survey statistics per tenant and question
- `HttpApi`
  - exposes onboarding, question answers, and survey responses endpoints

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

## Genesys Data Table

Questions are stored in a Genesys Data Table. The schema is tailored to survey questions:

- `key`
- `meta`
- `name`
- `prompt`
- `reprompt`
- `min_value`
- `max_value`
- `enabled`

Usage:

- `__meta`
  - global app metadata and setup metadata
- `__lock`
  - lock information for the full configuration
- one row per question
  - `key = question.id`

## Response Storage

Responses are not stored in the Data Table. They are aggregated in DynamoDB.

Each question has one item with:

- `tenantId`
- `questionId`
- `count_<value>`
- `totalResponses`
- `updatedAt`
- `lastValue`

Example:

- `count_1`
- `count_2`
- `count_3`
- `count_4`
- `count_5`

The backend increments exactly one of these counters atomically per request.

## Install and Uninstall

### Install

The install flow:

1. creates or selects a division
2. creates the questions Data Table
3. writes `__lock` and `__meta`
4. creates the Genesys backend OAuth client
5. starts AWS onboarding
6. creates the Data Action integration and Data Action
7. completes AWS onboarding
8. updates the frontend OAuth client and app integration to the launch URL
9. stores all created resources in `meta.setup`

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
- delete the Data Table
- delete the division if it was created by setup

## Important Files

Frontend:

- `src/pages/questions.vue`
- `src/pages/SetupOrchestrator.vue`
- `src/pages/SetupUninstall.vue`
- `src/stores/appStore.ts`
- `src/services/genesys_helper.ts`

Backend:

- `amplify/backend.ts`
- `amplify/functions/onboarding/handler.ts`
- `amplify/functions/question_answers/handler.ts`
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
- The frontend currently uses `mypurecloud.de` as the region when loading response totals.
