import { describe, expect, it } from "bun:test";
import { cn } from "./utils";

describe("cn", () => {
	it("merges tailwind classes with conflict resolution", () => {
		expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
	});
});
