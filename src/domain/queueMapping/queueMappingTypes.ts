// Entspricht einer Zeile der Mapping-Data-Table (meta.setup.mappingDataTable,
// Name <projectTag>_polly_mapping): queueName = Key-Spalte "QueueName",
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
