import { PageTitle } from "@/components/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GithubLight } from "@/components/ui/svgs/githubLight";
import { ArrowLeftIcon, ArrowRightIcon, GitPullRequestArrowIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";

export default async function ServerPage() {
	return (
		<main>
			<section className="py-12">
				<div className="max-w-7xl w-full mx-auto px-8">
					<div className="mb-8">
						<Link
							href={"#"}
							className="text-sm text-zinc-700 flex justify-start items-center gap-1.5 font-medium"
						>
							<ArrowLeftIcon className="size-4" /> Back to projects
						</Link>
					</div>
					<div className="flex justify-start items-center flex-wrap gap-8">
						<div className="flex justify-start items-start gap-4">
							<div className="rounded-md ring-1 ring-zinc-700/10 p-2 shadow-sm bg-linear-to-b from-background to-zinc-50 mt-0.5">
								<GithubLight className="size-5" />
							</div>
							<div>
								<div className="flex justify-start items-center gap-3">
									<PageTitle>chris23lngr/nvim</PageTitle>
									<Badge className="bg-lime-100 text-lime-700">Active</Badge>
								</div>
								<p className="text-xs text-zinc-500 mt-2">Created on 23/02/2026 by chris23lngr</p>
							</div>
						</div>
						<div className="flex justify-center items-center gap-4 ml-auto">
							<Button variant={"outline"}>
								<SettingsIcon /> Settings
							</Button>
						</div>
					</div>
				</div>
				<div className="mt-8 max-w-7xl w-full mx-auto px-8">
					<div className="rounded-lg ring-1 ring-zinc-700/10 shadow-xl shadow-zinc-700/5">
						<div className="grid grid-cols-2 relative">
							<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2  bg-background border border-zinc-200 p-1 rounded-md shadow-xs">
								<ArrowRightIcon className="size-4 text-zinc-500" />
							</div>
							<div className="p-8 border-r border-zinc-200 pr-12">
								<p className="text-sm font-medium text-zinc-800">Sources</p>
								<p className="text-xs text-zinc-500 mt-1">
									Merged PRs in these repositories will trigger a documentation update
								</p>
								<div className="mt-6 flex justify-start items-center gap-4">
									<div className="flex justify-center items-center gap-1.5">
										<GithubLight className="size-3.5 text-zinc-500" />
										<Link href={"#"} className="text-sm text-zinc-700">
											neovim/neovim
										</Link>
									</div>
									<div className="flex justify-center items-center gap-1.5">
										<span className="text-sm text-zinc-500">
											just now (
											<span className="text-blue-500 underline-offset-3 underline">#ea35c35</span>)
										</span>
									</div>
								</div>
								<div className="mt-2 flex justify-start items-center gap-4">
									<div className="flex justify-center items-center gap-1.5">
										<GithubLight className="size-3.5 text-zinc-500" />
										<Link href={"#"} className="text-sm text-zinc-700">
											chris23lngr/nvim
										</Link>
									</div>
									<div className="flex justify-center items-center gap-1.5">
										<span className="text-sm text-zinc-500">
											3 days ago (
											<span className="text-blue-500 underline-offset-3 underline">#454c07d</span>)
										</span>
									</div>
								</div>
							</div>
							<div className="p-8 pl-12">
								<p className="text-sm font-medium text-zinc-800">Target</p>

								<p className="text-xs text-zinc-500 mt-1">
									Documentation will be updated in this repository
								</p>
								<div className="mt-6 flex justify-start items-center gap-4">
									<div className="flex justify-center items-center gap-1.5">
										<GithubLight className="size-3.5 text-zinc-500" />
										<Link href={"#"} className="text-sm text-zinc-700">
											chris23lngr/nvim-docs
										</Link>
									</div>
									<div className="flex justify-center items-center gap-1.5">
										<span className="text-sm text-zinc-500">
											yesterday (
											<span className="text-blue-500 underline-offset-3 underline">#ba2e9d0</span>)
										</span>
									</div>
								</div>
								<div className="mt-2 flex justify-start items-center gap-4">
									<div className="flex justify-center items-center gap-1.5">
										<GitPullRequestArrowIcon className="size-3.5 text-zinc-500" />
										<span className="text-sm text-zinc-500">
											default branch{" "}
											<Link href={"#"} className=" text-zinc-700">
												master
											</Link>
										</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>
			<section className="pb-24 mt-8">
				<div className="max-w-7xl w-full mx-auto px-8">
					<h3 className="text-lg font-medium text-zinc-800">Run history</h3>
				</div>
			</section>
		</main>
	);
}
