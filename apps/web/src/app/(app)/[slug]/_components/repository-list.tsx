"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useInstallationRepositories } from "@/lib/api/repositories";
import type { Repository } from "@/lib/api/schemas";

type RepositoryStatus = Repository["status"];

const STATUS_BADGE_VARIANT: Record<RepositoryStatus, "default" | "outline" | "destructive"> = {
	active: "default",
	archived: "outline",
	removed: "destructive",
};

function RepositoryCard({ repository }: { repository: Repository }): React.ReactElement {
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle className="font-mono">{repository.fullName}</CardTitle>
				<div className="flex items-center gap-2 mt-1">
					<Badge variant={STATUS_BADGE_VARIANT[repository.status]}>{repository.status}</Badge>
					{!repository.isActive && (
						<Badge variant="outline" className="text-muted-foreground">
							disabled
						</Badge>
					)}
				</div>
			</CardHeader>
			<CardContent className="text-muted-foreground text-xs">
				Default branch: {repository.defaultBranch}
			</CardContent>
		</Card>
	);
}

function RepositoryListSkeleton(): React.ReactElement {
	return (
		<div className="grid gap-3">
			{Array.from({ length: 3 }).map((_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton has no meaningful key
				<Skeleton key={i} className="h-24 w-full rounded-xl" />
			))}
		</div>
	);
}

type Props = {
	installationId: string;
};

export function RepositoryList({ installationId }: Props): React.ReactElement {
	const { data, isLoading, isError } = useInstallationRepositories(installationId);

	if (isLoading) {
		return <RepositoryListSkeleton />;
	}

	if (isError) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Failed to load repositories</EmptyTitle>
					<EmptyDescription>Please try refreshing the page.</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	if (!data || data.data.length === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>No repositories found</EmptyTitle>
					<EmptyDescription>
						No repositories are connected to this installation yet.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div className="grid gap-3">
			{data.data.map((repository) => (
				<RepositoryCard key={repository.id} repository={repository} />
			))}
		</div>
	);
}
