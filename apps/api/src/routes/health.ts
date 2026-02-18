import { Hono } from "hono";
import type { AppEnv } from "../types.js";

type HealthResponse = {
	status: "ok";
	version: string;
};

export const createHealthRoute = (gitSha: string): Hono<AppEnv> => {
	const route = new Hono<AppEnv>();

	route.get("/", (c) => c.json<HealthResponse>({ status: "ok", version: gitSha }));

	return route;
};
