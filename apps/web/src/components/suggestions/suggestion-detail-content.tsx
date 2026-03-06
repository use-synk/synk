import { getProjectSuggestion } from "@/api/endpoints";
import { RequestError } from "@/api/errors";
import { fetchQuery } from "@/api/server";
import { Badge } from "@/components/ui/badge";
import { useMDXComponents } from "@/mdx-components";
import { formatDistanceToNow } from "date-fns";
import { BrainIcon, UserCircle2Icon } from "lucide-react";
import { compileMDX } from "next-mdx-remote/rsc";
import { notFound } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { DiffView } from "./diff-view";
import { SuggestionDecisionActions } from "./suggestion-decision-actions";
import { SuggestionStatusIcon } from "./suggestions-list";

type SuggestionDetailContentProps = {
	projectId: string;
	suggestionId: string;
};

export async function SuggestionDetailContent({
	projectId,
	suggestionId,
}: SuggestionDetailContentProps) {
	const suggestion = await fetchSuggestion(projectId, suggestionId);

	const mdx = await compileMDX({
		source: suggestion.reasoning ?? "",
		components: useMDXComponents(),
	});

	return (
		<div className="h-full min-h-0 flex flex-col">
			<div className="px-6 py-4 border-b border-stone-200 space-y-3 pb-12">
				<div className="flex justify-start items-start gap-4 flex-wrap">
					<SuggestionStatusIcon status={suggestion.status} className="size-4 mt-1.5" />
					<div>
						<p className="grow max-w-xl text-lg font-medium text-stone-800">
							<span className="text-stone-500">#{suggestion.readableId}:</span>{" "}
							{suggestion.title ?? "Untitled suggestion"}
						</p>
						<p className="mt-2 text-xs text-stone-500">
							Last updated{" "}
							{formatDistanceToNow(new Date(suggestion.updatedAt), { addSuffix: true })}
						</p>
					</div>
					<div className="ml-auto">
						<SuggestionDecisionActions
							projectId={projectId}
							suggestionId={suggestionId}
							status={suggestion.status}
						/>
					</div>
				</div>
				<div className="flex items-center gap-6 flex-wrap text-xs text-stone-500 mt-6">
					<div>
						{suggestion.decidedByUser ? (
							<Avatar className="shrink-0 size-4">
								<AvatarImage src={suggestion.decidedByUser.image ?? ""} />
								<AvatarFallback>{suggestion.decidedByUser.name.charAt(0)}</AvatarFallback>
							</Avatar>
						) : (
							<UserCircle2Icon className="size-4 text-stone-500" />
						)}
					</div>
					<Badge variant="outline" className="font-normal">
						{suggestion.docPath}
					</Badge>
					<div className="flex justify-center items-center gap-1">
						<span className="text-xs text-green-500 font-medium">+{suggestion.diffAdditions}</span>
						<span className="text-xs text-red-500 font-medium">-{suggestion.diffDeletions}</span>
					</div>
				</div>
				{suggestion.reasoning !== null && suggestion.reasoning.length > 0 && (
					<div className="mt-12">
						<div className="flex items-center gap-2 justify-start">
							<BrainIcon className="size-3.5 text-stone-500" />
							<p className="text-sm font-medium text-stone-800">AI Reasoning</p>
						</div>
						<div className="max-w-prose mt-2">{mdx.content}</div>
						<p className=" text-xs mt-4 text-stone-500">
							Written for{" "}
							<span className="text-stone-800 underline underline-offset-2">
								#{suggestion.baseDocSha.slice(0, 8)}
							</span>
						</p>
					</div>
				)}
			</div>
			<div className="min-h-0 overflow-auto">
				<DiffView
					oldContent={suggestion.beforeContent ?? ""}
					newContent={suggestion.proposedContent}
					language={resolveLanguage(suggestion.docPath)}
					filename={suggestion.docPath}
				/>
			</div>
		</div>
	);
}

async function fetchSuggestion(projectId: string, suggestionId: string) {
	try {
		const res = await fetchQuery(getProjectSuggestion({ projectId, suggestionId }));
		return res.data;
	} catch (error) {
		if (error instanceof RequestError && error.status === 404) {
			notFound();
		}
		throw error;
	}
}

function resolveLanguage(path: string): string {
	const extension = path.split(".").pop()?.toLowerCase();
	switch (extension) {
		case "ts":
		case "tsx":
			return "typescript";
		case "js":
		case "jsx":
			return "javascript";
		case "json":
			return "json";
		case "md":
		case "mdx":
			return "md";
		case "yml":
		case "yaml":
			return "yaml";
		case "html":
			return "html";
		case "css":
			return "css";
		case "sh":
			return "shell";
		default:
			return "text";
	}
}
