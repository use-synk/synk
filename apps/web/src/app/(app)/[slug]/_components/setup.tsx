import type { OrganizationSetupStatus } from "@/api/endpoints";
import { InstallGitHubButton } from "@/components/install-github";
import { PageDescription, PageTitle } from "@/components/typography";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { GithubLight } from "@/components/ui/svgs/githubLight";
import { cn } from "@/lib/utils";
import { CircleCheckIcon, CircleDashedIcon, LoaderCircleIcon, PlusIcon } from "lucide-react";
import Link from "next/link";

export async function OrganizationSetup({
	organizationSlug,
	setupStatus,
}: {
	setupStatus: OrganizationSetupStatus;
	organizationSlug: string;
}) {
	return (
		<main className="pb-24">
			<section className="py-12 bg-linear-to-bl from-lime-50 to-background relative">
				<div className="absolute w-full h-24 bg-linear-to-b from-background/0 to-background left-0 bottom-0 z-10" />
				<div className="max-w-4xl w-full mx-auto px-14 relative z-20">
					<PageTitle>Complete the setup</PageTitle>
					<PageDescription className="mt-2">
						Before you can start using Synk AI, you need to complete the setup process. Follow the
						steps below to get started.
					</PageDescription>
				</div>
			</section>
			<section className="mt-px">
				<div className="max-w-4xl w-full mx-auto px-8 space-y-8">
					<ProcessStep
						name="Connect your GitHub account"
						status={setupStatus.hasInstallations ? "completed" : "current"}
						content={
							<div>
								<p className="max-w-prose">
									Synk needs access to your GitHub account to start syncing your repositories. Use
									the button below to connect your account using OAuth.
								</p>
								<div className="mt-8">
									<InstallGitHubButton variant={"outline"} disabled={setupStatus.hasInstallations}>
										<GithubLight />
										Connect GitHub
									</InstallGitHubButton>
								</div>
							</div>
						}
					/>
					<ProcessStep
						name="Create a project"
						status={
							setupStatus.hasInstallations && setupStatus.hasProjects
								? "completed"
								: setupStatus.hasInstallations && !setupStatus.hasProjects
									? "current"
									: "pending"
						}
						content={
							<div>
								<p className="max-w-prose">
									Projects are used to group repositories and track their documentation. Use the
									button below to create a new project and start syncing your repositories.
								</p>
								<div className="mt-8">
									<Button
										variant={"outline"}
										disabled={!setupStatus.hasInstallations}
										render={
											<Link href={`${organizationSlug}/projects/new`}>
												<PlusIcon />
												Create project
											</Link>
										}
										nativeButton={false}
									/>
								</div>
							</div>
						}
					/>
				</div>
			</section>
			<section className="mt-8">
				<div className="max-w-4xl w-full mx-auto px-8">
					<p className="text-xs text-muted-foreground">
						Having trouble with the setup? Refer to the{" "}
						<Link
							href={"#"}
							className="font-medium text-zinc-700 cursor-pointer hover:text-lime-600 transition-colors"
						>
							documentation
						</Link>{" "}
						for help.
					</p>
				</div>
			</section>
		</main>
	);
}

function ProcessStep({
	className,
	name,
	status,
	content,
	...props
}: Omit<React.ComponentProps<"div">, "content"> & {
	name: string;
	status: "current" | "completed" | "pending";
	content: React.ReactNode;
}) {
	const Icon =
		status === "completed"
			? CircleCheckIcon
			: status === "current"
				? LoaderCircleIcon
				: CircleDashedIcon;

	return (
		<div
			className={cn(
				"rounded-lg ring-1 ring-zinc-700/10 shadow-xl shadow-zinc-700/5 overflow-hidden bg-background p-2",
				className,
			)}
			{...props}
		>
			<Collapsible defaultOpen={status === "current"}>
				<CollapsibleTrigger
					className={
						"w-full py-2 px-4 flex justify-start items-center gap-1.75 text-sm font-medium text-foreground cursor-pointer"
					}
				>
					<Icon
						data-status={status}
						className="size-3.5 text-zinc-500 data-[status=completed]:text-lime-600 data-[status=current]:animate-[spin_1.5s_linear_infinite]"
					/>
					<span>{name}</span>
				</CollapsibleTrigger>
				<CollapsibleContent className={"py-2 px-4 text-sm [&_p]:text-muted-foreground pt-0"}>
					{content}
				</CollapsibleContent>
			</Collapsible>
		</div>
	);
}
