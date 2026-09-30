// Entspricht einer Zeile der Genesys Data Table POLLY_MAPPING_DATA_TABLE_NAME
// (Bund_KSC_Atip_Polly_Mapping): queueName = Key-Spalte "QueueName",
// surveyId = Spalte "SurveyId", deliveryRate = Spalte "DeliveryRate".
export interface QueueMappingEntry {
	queueName: string;
	surveyId: string;
	deliveryRate: number; // 1 - 100
}

export type QueueMappingData = QueueMappingEntry[];

export interface QueueConflict {
	queueName: string;
	surveyId: string;
	deliveryRate: number;
}
