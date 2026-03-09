"use client";

import { useApiMutation, useApiQuery } from "@/api/client";
import { createProjectSuggestionsPr, listProjectSuggestions } from "@/api/endpoints";
import { getQueryClient } from "@/api/make-query-client";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CopyIcon, GitPullRequestIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type React from "react";
import { Fragment, useState } from "react";
import { toast } from "sonner";

function formatExclusionReason(reason: "file-missing" | "base-sha-mismatch" | "already-applied") {
	switch (reason) {
		case "file-missing":
			return "File missing";
		case "base-sha-mismatch":
			return "Base branch changed";
		case "already-applied":
			return "Already applied";
		default:
			return "Unknown reason";
	}
}

function CreateSuggestionsPR({ className, ...props }: React.ComponentProps<"button">) {
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [prDialogUrl, setPrDialogUrl] = useState<string | null>(null);

	const handlePrCreated = (url: string) => {
		setIsSheetOpen(false);
		setPrDialogUrl(url);
	};

	return (
		<Fragment>
			<Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
				<SheetTrigger
					render={
						<button
							type="button"
							className={cn(
								"text-sm font-medium text-center px-2.5 h-7 rounded-sm bg-linear-to-b from-violet-500 to-violet-600 text-violet-50 border border-violet-600 inset-shadow-2xs inset-shadow-white/25 shadow-xs shadow-violet-500/30 [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-violet-200 flex justify-center items-center gap-2 cursor-pointer",
								className,
							)}
							{...props}
						>
							<GitPullRequestIcon />
							Create PR
						</button>
					}
				/>
				<SheetContent className={"data-[side=right]:sm:max-w-2xl"}>
					<CreateSuggestionsPRContent onPrCreated={handlePrCreated} />
				</SheetContent>
			</Sheet>
			<Dialog open={prDialogUrl !== null} onOpenChange={(open) => !open && setPrDialogUrl(null)}>
				<DialogContent className={"sm:max-w-xl"}>
					<DialogHeader>
						<DialogTitle className={"flex justify-start items-center"}>
							<GitPullRequestIcon className="size-4 text-violet-500 mr-2" />
							Pull request created
						</DialogTitle>
						<DialogDescription>
							Your accepted suggestions were submitted successfully.
						</DialogDescription>
					</DialogHeader>
					{prDialogUrl && (
						<div className="flex justify-start items-center px-3 py-1.5 bg-stone-100 rounded-sm gap-4">
							<Link href={prDialogUrl} target="_blank" rel="noopener noreferrer" className="">
								<span className="truncate">{prDialogUrl}</span>
							</Link>
							<CopyIcon className="size-4 ms-auto" />
						</div>
					)}
					<DialogFooter showCloseButton />
				</DialogContent>
			</Dialog>
		</Fragment>
	);
}

function CreateSuggestionsPRContent({
	onPrCreated,
	className,
	...props
}: React.ComponentProps<"div"> & {
	onPrCreated: (url: string) => void;
}) {
	const { project } = useParams<{ slug: string; project: string }>();
	const router = useRouter();
	const queryClient = getQueryClient();

	const { data, isLoading } = useApiQuery(
		listProjectSuggestions({ projectId: project, pageSize: 100, status: "accepted" }),
		{
			staleTime: 0,
		},
	);
	const createPr = useApiMutation(createProjectSuggestionsPr({ projectId: project }), {
		onSuccess: (result) => {
			const includedCount = result.data.includedSuggestionIds.length;
			const excludedCount = result.data.excluded.length;
			const statusPrefix =
				result.data.status === "completed"
					? "Pull request created"
					: "Pull request creation failed";

			toast[result.data.status === "completed" ? "success" : "error"](statusPrefix, {
				description: `${includedCount} included, ${excludedCount} excluded.`,
			});
			if (result.data.status === "completed" && result.data.prUrl) {
				onPrCreated(result.data.prUrl);
			}

			queryClient.invalidateQueries({
				queryKey: ["projects", project, "suggestions"],
			});
			router.refresh();
		},
		onError: (error) => {
			toast.error("Failed to create pull request", {
				description: error.message,
			});
		},
	});

	if (isLoading) {
		return <Skeleton className="w-full h-48" />;
	}

	return (
		<Fragment>
			<SheetHeader>
				<SheetTitle>Review suggestions</SheetTitle>
				<SheetDescription>
					The following suggestions were accepted and will be added to the next PR.
				</SheetDescription>
			</SheetHeader>
			<div
				className={cn(
					"p-4",
					createPr.isPending && "opacity-50 cursor-not-allowed relative",
					className,
				)}
				{...props}
			>
				{createPr.isPending && (
					<div className="flex justify-center items-center absolute w-full h-full top-0 left-0">
						<Spinner />
					</div>
				)}
				<p className="font-medium text-stone-800 mb-4">Accepted Suggestions</p>

				<ul className="space-y-4">
					{data?.data.map((suggestion) => (
						<li key={suggestion.id} className="rounded-md border border-stone-200 px-4 py-2">
							<p className="text-sm font-medium text-stone-800">
								<span className="text-stone-500">#{suggestion.readableId}: </span>
								{suggestion.title}
							</p>
							<p className="text-xs text-stone-500 mt-0.5">
								Last updated on {format(suggestion.updatedAt, "PPPp")}{" "}
								{suggestion.decidedByUser && (
									<>
										by{" "}
										<span className="underline underline-offset-2">
											{suggestion.decidedByUser.name}
										</span>
									</>
								)}
							</p>
						</li>
					))}
				</ul>
				{data?.data.length === 0 && (
					<Empty className="border border-stone-200 border-dashed">
						<EmptyHeader>
							<EmptyTitle>No accepted suggestions</EmptyTitle>
							<EmptyDescription>You haven't accepted any suggestions yet.</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
				<p className="text-xs text-stone-500 max-w-md mt-6">
					Once applied, the suggestions above cannot be updated anymore.
				</p>
				{createPr.data?.data && createPr.data.data.excluded.length > 0 && (
					<div className="rounded-md border border-stone-200 bg-stone-50 px-4 py-3 mt-4 space-y-2">
						<p className="text-sm font-medium text-stone-800">Excluded suggestions</p>
						<ul className="space-y-1">
							{createPr.data.data.excluded.map((item) => (
								<li key={item.suggestionId} className="text-xs text-stone-600">
									#{item.suggestionId}: {formatExclusionReason(item.reason)} ({item.docPath})
								</li>
							))}
						</ul>
					</div>
				)}
			</div>
			<SheetFooter className={cn("flex justify-end flex-row", className)} {...props}>
				<button
					type="button"
					disabled={data?.data.length === 0 || createPr.isPending}
					onClick={() => createPr.mutate("create-pr")}
					className={cn(
						"text-sm font-medium text-center px-2.5 h-7 rounded-sm bg-linear-to-b from-violet-500 to-violet-600 text-violet-50 border border-violet-600 inset-shadow-2xs inset-shadow-white/25 shadow-xs shadow-violet-500/30 [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-violet-200 flex justify-center items-center gap-2 cursor-pointer w-fit disabled:opacity-50 disabled:cursor-not-allowed",
					)}
				>
					<GitPullRequestIcon />
					{createPr.isPending ? "Submitting..." : "Submit and create"}
				</button>
			</SheetFooter>
		</Fragment>
	);
}

export { CreateSuggestionsPR };
