const GIT_HEADS_PREFIX = "refs/heads/";

export function getBranchNameFromGitReference(
	gitReference: string | null | undefined,
): string {
	if (!gitReference) {
		return "";
	}

	if (gitReference.startsWith(GIT_HEADS_PREFIX)) {
		return gitReference.slice(GIT_HEADS_PREFIX.length);
	}

	return gitReference;
}
