import type { Logger } from "./logger";
import type { AuthService, createAuthService } from "./modules/auth/auth.service";

export type DashboardAuth = {
	userId: string;
};

export type AppVariables = {
	requestId?: string;
	logger?: Logger;
	dashboardAuth?: DashboardAuth;
};

export type AppEnv = {
	Variables: AppVariables;
};

export type AuthenticatedAppEnv = AppEnv & {
	Variables: AppVariables & {
		user: ReturnType<typeof createAuthService>["auth"]["$Infer"]["Session"]["user"];
		session: ReturnType<typeof createAuthService>["auth"]["$Infer"]["Session"]["session"];
	};
};

export type RouteContext = {
	auth: AuthService;
	gitSha: string;
};
