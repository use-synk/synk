import type { RepositoryPayload } from "./github.schemas.js";
import type { WebhookRepository } from "../../../domain/ports/index.js";
import type { GitHubInstallationRepository, ListInstallationRepositories } from "./types.js";

const PROVIDER_GITHUB = "github" as const;
const REPOSITORY_ACTIVE = "active" as const;

export type PersistableRepository = {
	providerRepositoryId: string;
	ownerLogin: string;
	name: string;
	fullName: string;
	defaultBranch: string;
};

export type RepositoryHydrationResult = {
	complete: readonly PersistableRepository[];
	missingProviderRepositoryIds: readonly string[];
};

const chunkArray = <T>(values: readonly T[], size: number): T[][] => {
	const chunks: T[][] = [];
	for (let i = 0; i < values.length; i += size) {
		chunks.push(values.slice(i, i + size));
	}
	return chunks;
};

export const toPersistableRepository = (
	repository: RepositoryPayload,
): PersistableRepository | null => {
	const providerRepositoryId = repository.id !== undefined ? String(repository.id) : null;
	const ownerLogin = repository.owner?.login?.trim() ?? null;
	const name = repository.name?.trim() ?? null;
	const fullName = repository.full_name?.trim() ?? null;
	const defaultBranch = repository.default_branch?.trim() ?? null;
	if (
		providerRepositoryId === null ||
		ownerLogin === null ||
		name === null ||
		fullName === null ||
		defaultBranch === null
	) {
		return null;
	}
	return {
		providerRepositoryId,
		ownerLogin,
		name,
		fullName,
		defaultBranch,
	};
};

export const toPersistableRepositoryFromGitHub = (
	repository: GitHubInstallationRepository,
): PersistableRepository => ({
	providerRepositoryId: String(repository.id),
	ownerLogin: repository.owner.login,
	name: repository.name,
	fullName: repository.full_name,
	defaultBranch: repository.default_branch,
});

const upsertOne = async (
	repository: Pick<WebhookRepository, "upsertRepository">,
	installationId: string,
	persistableRepository: PersistableRepository,
): Promise<void> => {
	await repository.upsertRepository({
		installationId,
		provider: PROVIDER_GITHUB,
		providerRepositoryId: persistableRepository.providerRepositoryId,
		ownerLogin: persistableRepository.ownerLogin,
		name: persistableRepository.name,
		fullName: persistableRepository.fullName,
		defaultBranch: persistableRepository.defaultBranch,
		status: REPOSITORY_ACTIVE,
		isActive: true,
		lastSyncedAt: new Date(),
	});
};

export const upsertRepositories = async (
	repository: Pick<WebhookRepository, "upsertRepository">,
	installationId: string,
	repositories: readonly PersistableRepository[],
): Promise<void> => {
	const batchSize = 25;
	for (const batch of chunkArray(repositories, batchSize)) {
		await Promise.all(batch.map((r) => upsertOne(repository, installationId, r)));
	}
};

export const getRepositoryIds = (repositories: readonly RepositoryPayload[]): readonly string[] =>
	repositories
		.map((r) => (r.id !== undefined ? String(r.id) : null))
		.filter((id): id is string => id !== null);

export const hydrateRepositories = async (
	repositories: readonly RepositoryPayload[],
	providerInstallationNumericId: number | undefined,
	listInstallationRepositories: ListInstallationRepositories,
): Promise<RepositoryHydrationResult> => {
	const complete: PersistableRepository[] = [];
	const missingIds: string[] = [];

	for (const repository of repositories) {
		const persistable = toPersistableRepository(repository);
		if (persistable !== null) {
			complete.push(persistable);
			continue;
		}
		if (repository.id !== undefined) {
			missingIds.push(String(repository.id));
		}
	}

	if (missingIds.length === 0 || providerInstallationNumericId === undefined) {
		return { complete, missingProviderRepositoryIds: missingIds };
	}

	const missingSet = new Set(missingIds);
	const synced = await listInstallationRepositories(providerInstallationNumericId);
	for (const repository of synced) {
		const id = String(repository.id);
		if (!missingSet.has(id)) continue;
		complete.push(toPersistableRepositoryFromGitHub(repository));
		missingSet.delete(id);
	}

	return {
		complete,
		missingProviderRepositoryIds: [...missingSet],
	};
};

export const markRepositoriesAsRemoved = async (
	repository: Pick<WebhookRepository, "markRepositoriesRemoved">,
	providerInstallationId: string,
	repositoryIds: readonly string[],
): Promise<void> => {
	await repository.markRepositoriesRemoved({
		provider: PROVIDER_GITHUB,
		providerInstallationId,
		providerRepositoryIds: repositoryIds,
	});
};

export const syncInstallationRepositories = async (
	repository: Pick<WebhookRepository, "upsertRepository">,
	listInstallationRepositories: ListInstallationRepositories,
	installationId: string,
	providerInstallationNumericId: number,
): Promise<void> => {
	const repositories = await listInstallationRepositories(providerInstallationNumericId);
	const persistable = repositories.map(toPersistableRepositoryFromGitHub);
	await upsertRepositories(repository, installationId, persistable);
};
