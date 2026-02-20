import type { RunDetail } from "../models/dashboard.js";

export interface RunRepository {
	findRunDetail(runId: string): Promise<RunDetail | null>;
}
