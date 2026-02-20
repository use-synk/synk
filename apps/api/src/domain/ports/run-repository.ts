import type { RunDetail } from "../models/dashboard";

export interface RunRepository {
	findRunDetail(runId: string): Promise<RunDetail | null>;
}
