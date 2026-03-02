import type { StandardSchemaV1 } from "@/lib/types/standard-schema";

export type ApiQuery<R extends StandardSchemaV1 = StandardSchemaV1> = {
	url: string;
	init: RequestInit;
	response: R;
	key: string[];
};
