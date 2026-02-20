export type GitHubInstallationRepository = {
	id: number;
	name: string;
	full_name: string;
	default_branch: string;
	owner: {
		login: string;
	};
};

export type ListInstallationRepositories = (
	installationId: number,
) => Promise<readonly GitHubInstallationRepository[]>;
