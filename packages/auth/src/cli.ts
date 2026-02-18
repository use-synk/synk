import { createAuth } from "./server.js";

// This auth instance is used by the CLI to generate the auth schema and
// should not be used in any production environment.
export const auth = createAuth({
	secret: "RANDOM_SECRET_THAT_IS_AT_LEAST_32_CHARACTERS_LONG",
});
