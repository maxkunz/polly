import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

/**
 * Gemeinsame Schreib-/Prüflogik für Umfrage-Ergebnisse, genutzt von `survey_responses` (Architect Flow)
 * und `web_survey` (Web-Kanal). Tabellennamen kommen aus den Env-Variablen der jeweiligen Lambda.
 */

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const SURVEY_AGGREGATES_TABLE_NAME = process.env.SURVEY_AGGREGATES_TABLE_NAME ?? "";
const SURVEY_DELETION_JOBS_TABLE_NAME = process.env.SURVEY_DELETION_JOBS_TABLE_NAME ?? "";

export interface AggregateAnswer {
  surveyId: string;
  surveyName?: string;
  questionName?: string;
  questionType?: string;
  value?: any;
}

/**
 * Normalisiert den Wert für Aggregatszählungen (counts-Map).
 */
function normalizeCountKey(value: any): string {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
}

/**
 * Liegt für die Umfrage ein aktiver oder abgeschlossener Lösch-Job vor, werden keine neuen Antworten
 * mehr gespeichert (sonst entstünden nach dem Löschen wieder verwaiste Ergebnisse).
 * Abgebrochene/fehlgeschlagene Jobs sperren nicht.
 */
export async function isSurveyBeingDeleted(tenantId: string, surveyId: string): Promise<boolean> {
  if (!SURVEY_DELETION_JOBS_TABLE_NAME) return false;
  const result = await ddb.send(
    new GetCommand({
      TableName: SURVEY_DELETION_JOBS_TABLE_NAME,
      Key: { tenantId, surveyId },
    })
  );
  const status = result.Item?.status;
  return status === "queued" || status === "running" || status === "done";
}

/**
 * Aktualisiert das Aggregat-Item in SurveyAggregatesTable.
 * Wirft bei DynamoDB-Fehlern; die Aufrufer entscheiden, ob das die gespeicherte Antwort betrifft.
 */
export async function updateSurveyAggregate(
  tenantId: string,
  answer: AggregateAnswer,
  now: string
) {
  const {
    surveyId,
    surveyName = "",
    questionName,
    questionType,
    value,
  } = answer;

  if (!questionName || value === undefined) return;

  const tenantSurveyId = `${tenantId}#${surveyId}`;
  const isNumeric = typeof value === "number" && !isNaN(value);
  const countKey = normalizeCountKey(value);
  const isComment = questionType === "comment";

  const executeAggregateUpdate = async (withNestedCount: boolean, withInitCount: boolean) => {
    let updateExp = "SET #tenantId = :tenantId, #surveyId = :surveyId, #surveyName = :surveyName, #questionType = :qType, #updatedAt = :now";
    let addExp = "ADD #totalResponses :one";

    const expNames: Record<string, string> = {
      "#tenantId": "tenantId",
      "#surveyId": "surveyId",
      "#surveyName": "surveyName",
      "#questionType": "questionType",
      "#updatedAt": "updatedAt",
      "#totalResponses": "totalResponses",
    };

    const expValues: Record<string, any> = {
      ":tenantId": tenantId,
      ":surveyId": surveyId,
      ":surveyName": surveyName,
      ":qType": questionType ?? "unknown",
      ":now": now,
      ":one": 1,
    };

    if (isNumeric && (questionType === "rating" || questionType === "nps")) {
      addExp += ", #sum :numValue";
      expNames["#sum"] = "sum";
      expValues[":numValue"] = value;
    }

    if (!isComment) {
      if (withNestedCount) {
        updateExp += ", #counts.#countKey = if_not_exists(#counts.#countKey, :zero) + :one";
        expNames["#counts"] = "counts";
        expNames["#countKey"] = countKey;
        expValues[":zero"] = 0;
      } else if (withInitCount) {
        updateExp += ", #counts = :initCounts";
        expNames["#counts"] = "counts";
        expValues[":initCounts"] = { [countKey]: 1 };
      }
    }

    const fullExp = `${updateExp} ${addExp}`.trim();

    return await ddb.send(
      new UpdateCommand({
        TableName: SURVEY_AGGREGATES_TABLE_NAME,
        Key: { tenantSurveyId, questionName },
        UpdateExpression: fullExp,
        ExpressionAttributeNames: expNames,
        ExpressionAttributeValues: expValues,
        // Die Map nur anlegen, solange sie fehlt: sonst überschriebe eine gleichzeitige erste Antwort die andere
        ...(withInitCount ? { ConditionExpression: "attribute_not_exists(#counts)" } : {}),
      })
    );
  };

  if (isComment) {
    await executeAggregateUpdate(false, false);
    return;
  }

  try {
    await executeAggregateUpdate(true, false);
    return;
  } catch (err: any) {
    // Verschachteltes SET scheitert, solange die Map `counts` fehlt (erste Antwort auf die Frage)
    if (!(err?.name === "ValidationException" || err?.message?.includes("document path"))) throw err;
  }

  try {
    await executeAggregateUpdate(false, true);
  } catch (err: any) {
    // Ein gleichzeitiger Aufruf hat die Map inzwischen angelegt: jetzt verschachtelt zählen
    if (err?.name !== "ConditionalCheckFailedException") throw err;
    await executeAggregateUpdate(true, false);
  }
}
