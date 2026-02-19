import { describe, expect, it } from "vitest";
import { estimateTokenCount } from "../token-count.js";

describe("estimateTokenCount", () => {
	it("returns zero for an empty string", () => {
		expect(estimateTokenCount("")).toBe(0);
	});

	it("returns a deterministic character-based estimate", () => {
		expect(estimateTokenCount("abcd")).toBe(1);
		expect(estimateTokenCount("abcdefgh")).toBe(2);
		expect(estimateTokenCount("abcdefghij")).toBe(3);
	});
});
