import { db } from "@synk-ai/db";
import { AccessDeniedError } from "../../domain/errors";
import type { AuthorizationRepository } from "../../domain/ports";

export const createPrismaAuthorizationRepository = (
	client: typeof db = db,
): AuthorizationRepository => {
	const assertAccess = (hasAccess: boolean, message: string): void => {
		if (!hasAccess) {
			throw new AccessDeniedError(message);
		}
	};
	const authorizationRepository: AuthorizationRepository = {
		hasInstallationAccess: async ({ installationId, userId }) => {
			const installation = await client.providerInstallation.findFirst({
				where: {
					id: installationId,
					organization: { members: { some: { userId } } },
				},
				select: { id: true },
			});
			return installation !== null;
		},
		hasRepositoryAccess: async ({ repositoryId, userId }) => {
			const repository = await client.providerRepository.findFirst({
				where: {
					id: repositoryId,
					installation: {
						organization: { members: { some: { userId } } },
					},
				},
				select: { id: true },
			});
			return repository !== null;
		},
		hasRunAccess: async ({ runId, userId }) => {
			const run = await client.analysisRun.findFirst({
				where: {
					id: runId,
					repository: {
						installation: {
							organization: { members: { some: { userId } } },
						},
					},
				},
				select: { id: true },
			});
			return run !== null;
		},
		assertInstallationAccess: async (query) => {
			const hasAccess = await authorizationRepository.hasInstallationAccess(query);
			assertAccess(hasAccess, "You do not have access to this installation");
		},
		assertRepositoryAccess: async (query) => {
			const hasAccess = await authorizationRepository.hasRepositoryAccess(query);
			assertAccess(hasAccess, "You do not have access to this repository");
		},
		assertRunAccess: async (query) => {
			const hasAccess = await authorizationRepository.hasRunAccess(query);
			assertAccess(hasAccess, "You do not have access to this run");
		},
		assertOrganizationMembership: async ({ userId, organizationId }) => {
			const membership = await client.member.findFirst({
				where: { userId, organizationId },
				select: { id: true },
			});
			assertAccess(membership !== null, "You are not a member of this organization");
		},
	};

	return authorizationRepository;
};
