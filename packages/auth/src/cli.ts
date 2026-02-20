import { createAuth } from "./server";

// This auth instance is used by the CLI to generate the auth schema and
// should not be used in any production environment.
export const auth = createAuth({
	secret: "RANDOM_SECRET_THAT_IS_AT_LEAST_32_CHARACTERS_LONG",
	github: {
		clientId: "env.BETTER_AUTH_GITHUB_CLIENT_ID",
		clientSecret: "env.BETTER_AUTH_GITHUB_CLIENT_SECRET",
	},
});
