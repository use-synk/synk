import z from "zod";
import { ValidationError } from "../errors";
import { paginationResultSchema } from "../shared";
import type { ApiQuery } from "../types";

const patchRepositoryPropsSchema = z.object({
	repositoryId: z.string().min(1),
	isActive: z.boolean().optional(),
});

export function patchRepository(props: z.infer<typeof patchRepositoryPropsSchema>) {
	const parsed = patchRepositoryPropsSchema.safeParse(props);
	if (!parsed.success) {
		throw new ValidationError("params", parsed.error.issues);
	}

	const { repositoryId, ...body } = parsed.data;

	return {
		url: `/repositories/${repositoryId}`,
		init: {
			method: "PATCH",
			body: JSON.stringify(body),
		},
		response: z.object({
			data: z.object({
				id: z.string(),
				installationId: z.string(),
				defaultBranch: z.string(),
				status: z.string(),
				isActive: z.boolean(),
				docsConfig: z.unknown(),
				createdAt: z.string(),
				updatedAt: z.string(),
			}),
		}),
		key: ["repositories", repositoryId],
	} satisfies ApiQuery;
}

const listInstallationRepositoriesPropsSchema = z.object({
	installationId: z.string().min(1),
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).default(10),
});

export function listInstallationRepositories(
	props: z.infer<typeof listInstallationRepositoriesPropsSchema>,
) {
	const parsed = listInstallationRepositoriesPropsSchema.safeParse(props);
	if (!parsed.success) {
		throw new ValidationError("params", parsed.error.issues);
	}

	const params = new URLSearchParams({
		page: parsed.data.page.toString(),
		pageSize: parsed.data.pageSize.toString(),
	});

	return {
		url: `/repositories/installations/${parsed.data.installationId}?${params.toString()}`,
		init: {
			method: "GET",
		},
		response: z.object({
			data: z.array(
				z.object({
					id: z.string(),
					installationId: z.string(),
					fullName: z.string(),
					defaultBranch: z.string(),
					status: z.string(),
					isActive: z.boolean(),
					docsConfig: z.unknown(),
					updatedAt: z.string(),
				}),
			),
			pagination: paginationResultSchema,
		}),
		key: [
			"repositories",
			"list",
			parsed.data.installationId,
			`${parsed.data.page}`,
			`${parsed.data.pageSize}`,
		],
	} satisfies ApiQuery;
}
