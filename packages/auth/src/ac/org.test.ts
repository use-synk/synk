import { describe, expect, it } from "bun:test";
import { roles } from "./org";

describe("organization roles", () => {
	it("exposes all default organization roles", () => {
		expect(roles.member).toBeDefined();
		expect(roles.admin).toBeDefined();
		expect(roles.owner).toBeDefined();
	});
});
