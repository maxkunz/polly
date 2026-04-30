export class Question {
	id: string;
	name: string;
	prompt: string;
	reprompt: string;
	minValue: number;
	maxValue: number;
	enabled: boolean;

	constructor(init?: Partial<Question>) {
		this.id = init?.id ?? crypto.randomUUID();
		this.name = init?.name ?? "";
		this.prompt = init?.prompt ?? "";
		this.reprompt = init?.reprompt ?? "";
		this.minValue = Number.isFinite(init?.minValue) ? Number(init?.minValue) : 1;
		this.maxValue = Number.isFinite(init?.maxValue) ? Number(init?.maxValue) : 5;
		this.enabled = init?.enabled ?? true;
	}

	static fromJSON(json: unknown): Question {
		if (!json || typeof json !== "object") {
			return new Question();
		}

		const raw = json as Partial<Question>;
		return new Question({
			id: raw.id,
			name: raw.name ?? "",
			prompt: raw.prompt ?? "",
			reprompt: raw.reprompt ?? "",
			minValue: typeof raw.minValue === "number" ? raw.minValue : Number(raw.minValue ?? 1),
			maxValue: typeof raw.maxValue === "number" ? raw.maxValue : Number(raw.maxValue ?? 5),
			enabled: typeof raw.enabled === "boolean" ? raw.enabled : true
		});
	}

	toJSON(): unknown {
		return {
			id: this.id,
			name: this.name,
			prompt: this.prompt,
			reprompt: this.reprompt,
			minValue: this.minValue,
			maxValue: this.maxValue,
			enabled: this.enabled
		};
	}
}

export class Questions {
	private items: Map<string, Question>;
	idSupplier!: () => string;

	constructor(items?: Map<string, Question>, idSupplier?: (() => string) | null) {
		this.items = items ?? new Map();
		if (idSupplier) this.idSupplier = idSupplier;
	}

	static fromJSON(json: unknown): Questions {
		const map = new Map<string, Question>();

		if (json && typeof json === "object") {
			for (const [id, value] of Object.entries(json as Record<string, unknown>)) {
				const question = Question.fromJSON(value);
				question.id = id;
				map.set(id, question);
			}
		}

		return new Questions(map);
	}

	toJSON(): unknown {
		const obj: Record<string, unknown> = {};
		for (const [id, question] of this.items.entries()) {
			obj[id] = question.toJSON();
		}
		return obj;
	}

	get(id: string): Question | undefined {
		return this.items.get(id);
	}

	all(): Question[] {
		return Array.from(this.items.values());
	}

	create(name = "*Neue Frage"): Question {
		const question = new Question({ id: this.idSupplier(), name });
		this.items.set(question.id, question);
		return question;
	}

	remove(id: string): void {
		this.items.delete(id);
	}
}
