"use client";

import { useApiQuery } from "@/api/client";
import { listProjectSuggestions, type suggestionSummarySchema } from "@/api/endpoints";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import {
	createColumnHelper,
	getCoreRowModel,
	type PaginationState,
	useReactTable,
} from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import {
	GitMergeConflictIcon,
	GitMergeIcon,
	GitPullRequestArrowIcon,
	GitPullRequestClosedIcon,
	GitPullRequestDraftIcon,
	GitPullRequestIcon,
	UserCircle2Icon,
	XIcon,
} from "lucide-react";
import {
	parseAsArrayOf,
	parseAsInteger,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";
import type React from "react";
import { useMemo } from "react";
import type z from "zod";

type SuggestionSummary = z.infer<typeof suggestionSummarySchema>;
type SuggestionStatus = SuggestionSummary["status"];

const SUGGESTION_STATUSES = [
	"pending",
	"accepted",
	"declined",
	"superseded",
	"stale",
	"applied",
] as const satisfies readonly SuggestionStatus[];

const STATUS_LABELS: Record<SuggestionStatus, string> = {
	pending: "Pending",
	accepted: "Accepted",
	declined: "Declined",
	superseded: "Superseded",
	stale: "Stale",
	applied: "Applied",
};

const pageParser = parseAsInteger.withDefault(1);
const statusParser = parseAsArrayOf(
	parseAsStringLiteral(SUGGESTION_STATUSES),
).withDefault([]);

const PAGE_SIZE = 10;

const columnHelper = createColumnHelper<SuggestionSummary>();
const columns = [columnHelper.display({ id: "suggestion" })];

/* ----- Public component ----------------------------------------------------- */

export function SuggestionsList({ projectId }: { projectId: string }) {
	const [page, setPage] = useQueryState("sPage", pageParser);
	const [statusFilter, setStatusFilter] = useQueryState("sStatus", statusParser);

	const { data, isLoading } = useApiQuery(
		listProjectSuggestions({
			projectId,
			page,
			pageSize: PAGE_SIZE,
			status: statusFilter.length > 0 ? statusFilter : undefined,
		}),
	);

	const pagination = useMemo<PaginationState>(
		() => ({ pageIndex: page - 1, pageSize: PAGE_SIZE }),
		[page],
	);

	const table = useReactTable({
		data: data?.data ?? [],
		columns,
		pageCount: data?.pagination.totalPages ?? -1,
		state: { pagination },
		onPaginationChange: (updater) => {
			const next = typeof updater === "function" ? updater(pagination) : updater;
			setPage(next.pageIndex + 1);
		},
		manualPagination: true,
		getCoreRowModel: getCoreRowModel(),
	});

	const handleStatusToggle = (status: SuggestionStatus) => {
		const isActive = statusFilter.includes(status);
		const next = isActive
			? statusFilter.filter((s) => s !== status)
			: [...statusFilter, status];
		setStatusFilter(next);
		setPage(1);
	};

	const rows = table.getRowModel().rows;

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2 flex-wrap">
				{SUGGESTION_STATUSES.map((status) => {
					const isActive = statusFilter.includes(status);
					return (
						<button
							key={status}
							type="button"
							onClick={() => handleStatusToggle(status)}
							className={cn(
								"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer select-none",
								isActive
									? "bg-stone-800 text-white border-stone-800"
									: "bg-white text-stone-600 border-stone-200 hover:border-stone-300",
							)}
						>
							<SuggestionStatusIcon status={status} className="size-3" />
							{STATUS_LABELS[status]}
						</button>
					);
				})}
			</div>

			<ul className="space-y-2">
				{isLoading ? (
					<SuggestionsLoadingSkeleton />
				) : rows.length === 0 ? (
					<li className="border border-stone-200 rounded-md px-4 py-8 text-center text-sm text-stone-500">
						No suggestions found.
					</li>
				) : (
					rows.map((row) => (
						<li key={row.id} className="border border-stone-200 rounded-md">
							<SuggestionRow suggestion={row.original} />
						</li>
					))
				)}
			</ul>

			{data?.pagination && data.pagination.totalPages > 1 && (
				<div className="flex justify-between items-center">
					<p className="text-sm text-stone-500">
						{data.pagination.total} suggestion
						{data.pagination.total !== 1 ? "s" : ""}
					</p>
					<Pagination className="w-auto mx-0 justify-end">
						<PaginationContent>
							<PaginationItem>
								<PaginationPrevious
									onClick={() => table.previousPage()}
									aria-disabled={!table.getCanPreviousPage()}
									className={
										!table.getCanPreviousPage()
											? "pointer-events-none opacity-50"
											: "cursor-pointer"
									}
								/>
							</PaginationItem>
							<PaginationItem>
								<span className="text-sm text-stone-500 px-2 select-none">
									{page} / {data.pagination.totalPages}
								</span>
							</PaginationItem>
							<PaginationItem>
								<PaginationNext
									onClick={() => table.nextPage()}
									aria-disabled={!table.getCanNextPage()}
									className={
										!table.getCanNextPage()
											? "pointer-events-none opacity-50"
											: "cursor-pointer"
									}
								/>
							</PaginationItem>
						</PaginationContent>
					</Pagination>
				</div>
			)}
		</div>
	);
}

/* ----- Internal sub-components ---------------------------------------------- */

function SuggestionRow({ suggestion }: { suggestion: SuggestionSummary }) {
	return (
		<div
			className={cn(
				"flex justify-start items-center gap-2 h-11 px-4 py-1",
				suggestion.status === "superseded" && "opacity-60",
			)}
		>
			<SuggestionStatusIcon status={suggestion.status} className="size-4" />
			<p className="text-sm font-medium text-stone-800 ml-2">
				<span className="text-sm text-stone-500">#{suggestion.readableId}:</span>{" "}
				{suggestion.title ?? "Untitled suggestion"}
			</p>
			<Badge variant="outline" className="font-normal text-stone-500 ml-2">
				{suggestion.docPath}
			</Badge>
			<div className="flex justify-center items-center gap-1 ml-2">
				<span className="text-xs text-green-500 font-medium">
					+{suggestion.diffAdditions}
				</span>
				<span className="text-xs text-red-500 font-medium">
					-{suggestion.diffDeletions}
				</span>
			</div>
			<p className="text-sm text-stone-500 ml-auto">
				{formatDistanceToNow(new Date(suggestion.createdAt), { addSuffix: true })}
			</p>
			<div className="ml-2">
				{suggestion.decidedByUser !== null ? (
					<Avatar className="shrink-0 size-4">
						<AvatarImage src={suggestion.decidedByUser.image ?? ""} />
						<AvatarFallback>
							{suggestion.decidedByUser.name.charAt(0)}
						</AvatarFallback>
					</Avatar>
				) : (
					<UserCircle2Icon className="size-4 text-stone-500" />
				)}
			</div>
		</div>
	);
}

export function SuggestionStatusIcon({
	status,
	className,
	...props
}: React.ComponentProps<"svg"> & { status: SuggestionStatus }) {
	switch (status) {
		case "accepted":
			return (
				<GitPullRequestArrowIcon className={cn("text-green-500", className)} {...props} />
			);
		case "applied":
			return (
				<GitPullRequestIcon className={cn("text-violet-500", className)} {...props} />
			);
		case "declined":
			return (
				<GitPullRequestClosedIcon className={cn("text-red-500", className)} {...props} />
			);
		case "pending":
			return (
				<GitPullRequestDraftIcon className={cn("text-gray-500", className)} {...props} />
			);
		case "stale":
			return <GitMergeIcon className={cn("text-gray-500", className)} {...props} />;
		case "superseded":
			return (
				<GitMergeConflictIcon className={cn("text-red-500", className)} {...props} />
			);
		default:
			return <XIcon className={cn("text-gray-500", className)} {...props} />;
	}
}

function SuggestionsLoadingSkeleton() {
	return (
		<>
			{Array.from({ length: 5 }).map((_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: skeleton positions are stable
				<li
					key={i}
					className="border border-stone-200 rounded-md h-11 animate-pulse bg-stone-100"
				/>
			))}
		</>
	);
}
