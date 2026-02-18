export interface DiffFile {
	filename: string;
	status: string;
	additions: number;
	deletions: number;
	patch: string | null;
	previousFilename: string | null;
}

export interface FetchPushDiffRequest {
	owner: string;
	repo: string;
	before: string;
	after: string;
}

export interface FetchPRDiffRequest {
	owner: string;
	repo: string;
	prNumber: number;
}

interface GitHubApiDiffFile {
	filename: string;
	status: string;
	additions: number;
	deletions: number;
	patch?: string;
	previous_filename?: string;
}

interface GitHubDiffOctokit {
	rest: {
		repos: {
			compareCommitsWithBasehead(params: {
				owner: string;
				repo: string;
				basehead: string;
			}): Promise<{ data: { files?: readonly GitHubApiDiffFile[] } }>;
		};
		pulls: {
			listFiles(params: {
				owner: string;
				repo: string;
				pull_number: number;
				per_page: number;
				page: number;
			}): Promise<{ data: readonly GitHubApiDiffFile[] }>;
		};
	};
}

const normalizePath = (value: string): string => value.replaceAll("\\", "/").replace(/^\.\//u, "");

const toDiffFile = (file: GitHubApiDiffFile): DiffFile => ({
	filename: file.filename,
	status: file.status,
	additions: file.additions,
	deletions: file.deletions,
	patch: file.patch ?? null,
	previousFilename: file.previous_filename ?? null,
});

const escapeRegexCharacters = (value: string): string =>
	value.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");

const globToRegex = (pattern: string): RegExp => {
	const normalizedPattern = normalizePath(pattern);
	let regexText = "";

	for (let index = 0; index < normalizedPattern.length; index += 1) {
		const currentCharacter = normalizedPattern[index];
		const nextCharacter = normalizedPattern[index + 1];

		if (currentCharacter === "*" && nextCharacter === "*") {
			regexText += ".*";
			index += 1;
			continue;
		}

		if (currentCharacter === "*") {
			regexText += "[^/]*";
			continue;
		}

		if (currentCharacter === "?") {
			regexText += "[^/]";
			continue;
		}

		regexText += escapeRegexCharacters(currentCharacter ?? "");
	}

	return new RegExp(`^${regexText}$`, "iu");
};

const shouldAddTrimmedPattern = (pattern: string): boolean => pattern.startsWith("**/");

const compileGlobPattern = (pattern: string): readonly RegExp[] => {
	const matchers = [globToRegex(pattern)];
	if (shouldAddTrimmedPattern(pattern)) {
		matchers.push(globToRegex(pattern.slice(3)));
	}
	return matchers;
};

const matchesAnyPattern = (path: string, patterns: readonly string[]): boolean => {
	const normalizedPath = normalizePath(path);
	return patterns.some((pattern) =>
		compileGlobPattern(pattern).some((matcher) => matcher.test(normalizedPath)),
	);
};

export const DEFAULT_DIFF_IGNORE_PATTERNS: readonly string[] = [
	"package-lock.json",
	"pnpm-lock.yaml",
	"yarn.lock",
	"bun.lockb",
	"npm-shrinkwrap.json",
	"**/*.lock",
	"node_modules/**",
	"**/node_modules/**",
	"dist/**",
	"**/dist/**",
	"**/*.min.js",
	"**/*.png",
	"**/*.jpg",
	"**/*.jpeg",
	"**/*.gif",
	"**/*.webp",
	"**/*.svg",
	"**/*.ico",
	"**/*.avif",
	"**/*.bmp",
	"**/*.tiff",
	"**/*.woff",
	"**/*.woff2",
	"**/*.ttf",
	"**/*.otf",
	"**/*.eot",
];

export const fetchPushDiff = async (
	octokit: GitHubDiffOctokit,
	request: FetchPushDiffRequest,
): Promise<DiffFile[]> => {
	const comparison = await octokit.rest.repos.compareCommitsWithBasehead({
		owner: request.owner,
		repo: request.repo,
		basehead: `${request.before}...${request.after}`,
	});

	return (comparison.data.files ?? []).map(toDiffFile);
};

export const fetchPRDiff = async (
	octokit: GitHubDiffOctokit,
	request: FetchPRDiffRequest,
): Promise<DiffFile[]> => {
	const files: DiffFile[] = [];
	let page = 1;

	while (true) {
		const response = await octokit.rest.pulls.listFiles({
			owner: request.owner,
			repo: request.repo,
			pull_number: request.prNumber,
			per_page: 100,
			page,
		});

		files.push(...response.data.map(toDiffFile));
		if (response.data.length < 100) {
			return files;
		}

		page += 1;
	}
};

export const filterDiff = (
	files: readonly DiffFile[],
	ignorePatterns: readonly string[] = DEFAULT_DIFF_IGNORE_PATTERNS,
): DiffFile[] =>
	files.filter((file) => {
		const filenameIgnored = matchesAnyPattern(file.filename, ignorePatterns);
		const previousFilenameIgnored = file.previousFilename
			? matchesAnyPattern(file.previousFilename, ignorePatterns)
			: false;
		return !filenameIgnored && !previousFilenameIgnored;
	});
