import type { Project as PrismaProject } from "@synk-ai/db/client";

export type Project = PrismaProject;

export type RepositorySummary = {
	id: string;
	fullName: string;
	defaultBranch: string;
	isActive: boolean;
};

export type ProjectDetail = {
	id: string;
	name: string;
	organizationId: string;
	config: Record<string, unknown>;
	sourceRepository: RepositorySummary;
	docsRepository: RepositorySummary | null;
	createdAt: Date;
	updatedAt: Date;
};
