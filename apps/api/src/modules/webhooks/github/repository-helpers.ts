import type { RepositoryPayload } from "./github.schemas.js";
import type { GitHubInstallationRepository, ListInstallationRepositories } from "./types.js";
import type { WebhookDatabase } from "./types.js";

const PROVIDER_GITHUB = "github" as const;
const REPOSITORY_ACTIVE = "active" as const;
const REPOSITORY_REMOVED = "removed" as const;

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
	db: Pick<WebhookDatabase, "providerRepository">,
	installationId: string,
	repository: PersistableRepository,
): Promise<void> => {
	await db.providerRepository.upsert({
		where: {
			provider_providerRepositoryId: {
				provider: PROVIDER_GITHUB,
				providerRepositoryId: repository.providerRepositoryId,
			},
		},
		create: {
			installationId,
			provider: PROVIDER_GITHUB,
			providerRepositoryId: repository.providerRepositoryId,
			ownerLogin: repository.ownerLogin,
			name: repository.name,
			fullName: repository.fullName,
			defaultBranch: repository.defaultBranch,
			status: REPOSITORY_ACTIVE,
			isActive: true,
			lastSyncedAt: new Date(),
		},
		update: {
			installationId,
			ownerLogin: repository.ownerLogin,
			name: repository.name,
			fullName: repository.fullName,
			defaultBranch: repository.defaultBranch,
			status: REPOSITORY_ACTIVE,
			isActive: true,
			lastSyncedAt: new Date(),
		},
	});
};

export const upsertRepositories = async (
	db: Pick<WebhookDatabase, "providerRepository">,
	installationId: string,
	repositories: readonly PersistableRepository[],
): Promise<void> => {
	const batchSize = 25;
	for (const batch of chunkArray(repositories, batchSize)) {
		await Promise.all(batch.map((r) => upsertOne(db, installationId, r)));
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
	db: Pick<WebhookDatabase, "providerRepository">,
	providerInstallationId: string,
	repositoryIds: readonly string[],
): Promise<void> => {
	if (repositoryIds.length === 0) return;
	await db.providerRepository.updateMany({
		where: {
			installation: {
				provider: PROVIDER_GITHUB,
				providerInstallationId,
			},
			providerRepositoryId: { in: [...repositoryIds] },
		},
		data: { status: REPOSITORY_REMOVED, isActive: false },
	});
};

export const syncInstallationRepositories = async (
	db: Pick<WebhookDatabase, "providerRepository">,
	listInstallationRepositories: ListInstallationRepositories,
	installationId: string,
	providerInstallationNumericId: number,
): Promise<void> => {
	const repositories = await listInstallationRepositories(providerInstallationNumericId);
	const persistable = repositories.map(toPersistableRepositoryFromGitHub);
	await upsertRepositories(db, installationId, persistable);
};
