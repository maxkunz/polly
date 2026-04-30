import { Meta } from "./Meta";
import { Questions } from "./Questions";

function ensureObject<T>(value: unknown, fallback: T): T {
	if (typeof value === "string") {
		try {
			return JSON.parse(value) as T;
		} catch {
			return fallback;
		}
	}

	if (value === undefined || value === null) {
		return fallback;
	}

	return value as T;
}

export class Domain {
	meta: Meta;
	questions: Questions;

	constructor(init?: Partial<Domain>) {
		this.meta = init?.meta ?? new Meta();
		this.questions = init?.questions ?? new Questions();
		this.questions.idSupplier = () => crypto.randomUUID();
	}

	static fromJSON(json: unknown): Domain {
		if (!json || typeof json !== "object") {
			return new Domain();
		}

		const raw = json as Record<string, unknown>;
		return new Domain({
			meta: Meta.fromJSON(ensureObject(raw.meta, {})),
			questions: Questions.fromJSON(ensureObject(raw.questions, {}))
		});
	}

	toJSON(): Record<string, unknown> {
		return {
			meta: this.meta.toJSON(),
			questions: this.questions.toJSON()
		};
	}
}
