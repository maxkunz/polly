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
