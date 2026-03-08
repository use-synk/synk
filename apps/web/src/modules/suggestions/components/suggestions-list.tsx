"use client";

import { useApiQuery } from "@/api/client";
import { listProjectSuggestions, type suggestionSummarySchema } from "@/api/endpoints";
import { Input } from "@/components/ui/input";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { SuggestionStatusIcon } from "@/modules/suggestion/components/suggestion-status-icon";
import {
	type PaginationState,
	createColumnHelper,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { SearchIcon } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import {
	parseAsArrayOf,
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryStates,
} from "nuqs";
import type React from "react";
import { useMemo, useRef, useState } from "react";
import type z from "zod";
import { SuggestionsRow } from "./suggestions-row";

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
const statusParser = parseAsArrayOf(parseAsStringLiteral(SUGGESTION_STATUSES)).withDefault([]);
const searchParser = parseAsString;

const PAGE_SIZE = 10;

const columnHelper = createColumnHelper<SuggestionSummary>();
const columns = [columnHelper.display({ id: "suggestion" })];

/* ----- Public component ----------------------------------------------------- */

const queryParsers = {
	sPage: pageParser,
	sStatus: statusParser,
	sSearch: searchParser,
};

function SuggestionsList({ projectId }: { projectId: string }) {
	const [{ sPage: page, sStatus: statusFilter, sSearch: searchQuery }, setQueryState] =
		useQueryStates(queryParsers, { shallow: false });
	const pathname = usePathname();
	const searchParams = useSearchParams();

	// Local input value updates immediately; the URL param is debounced.
	const [searchInput, setSearchInput] = useState(searchQuery ?? "");
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setSearchInput(value);
		if (debounceRef.current !== null) {
			clearTimeout(debounceRef.current);
		}
		// Batch sSearch + sPage into one atomic URL update to prevent race conditions.
		debounceRef.current = setTimeout(() => {
			setQueryState({ sSearch: value.length > 0 ? value : null, sPage: 1 });
		}, 300);
	};

	const { data, isLoading } = useApiQuery(
		listProjectSuggestions({
			projectId,
			page,
			pageSize: PAGE_SIZE,
			status: statusFilter.length > 0 ? statusFilter : undefined,
			search: searchQuery ?? undefined,
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
			setQueryState({ sPage: next.pageIndex + 1 });
		},
		manualPagination: true,
		getCoreRowModel: getCoreRowModel(),
	});

	const handleStatusToggle = (status: SuggestionStatus) => {
		const isActive = statusFilter.includes(status);
		const next = isActive ? statusFilter.filter((s) => s !== status) : [...statusFilter, status];
		setQueryState({ sStatus: next, sPage: 1 });
	};

	const rows = table.getRowModel().rows;
	const detailBaseQuery = useMemo(() => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("tab", "suggestions");
		return params.toString();
	}, [searchParams]);

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3 flex-wrap">
				<div className="relative w-64">
					<SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-stone-400 pointer-events-none" />
					<Input
						type="text"
						placeholder="Search suggestions…"
						value={searchInput}
						onChange={handleSearchChange}
						className="pl-8 h-7 text-sm"
					/>
				</div>
				<div className="w-px h-5 bg-stone-200 shrink-0" />
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
							<SuggestionsRow
								suggestion={row.original}
								detailHref={`${pathname}/${row.original.id}?${detailBaseQuery}`}
							/>
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
										!table.getCanNextPage() ? "pointer-events-none opacity-50" : "cursor-pointer"
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

function SuggestionsLoadingSkeleton() {
	return (
		<>
			{Array.from({ length: 5 }).map((_, i) => (
				<li
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton positions are stable
					key={i}
					className="border border-stone-200 rounded-md h-11 animate-pulse bg-stone-100"
				/>
			))}
		</>
	);
}

export { SuggestionsList };
