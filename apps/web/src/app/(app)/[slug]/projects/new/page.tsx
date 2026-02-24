"use client";
import { PageDescription, PageTitle } from "@/components/typography";
import { Separator } from "@/components/ui/separator";
import type { Repository } from "@/lib/api/schemas";
import { ArrowLeftIcon, BookOpenIcon, Building2Icon, UserIcon } from "lucide-react";
import Link from "next/link";
import { CreateProjectForm } from "./_components/create-project-form";

const repositories: Repository[] = [
	{
		id: "1",
		fullName: "chris23lngr/nvim",
		defaultBranch: "master",
		installationId: "1",
		status: "active",
		isActive: true,
		updatedAt: new Date().toISOString(),
		docsConfig: {},
	},
	{
		id: "2",
		fullName: "neovim/neovim",
		defaultBranch: "master",
		installationId: "2",
		status: "active",
		isActive: true,
		updatedAt: new Date().toISOString(),
		docsConfig: {},
	},
	{
		id: "3",
		fullName: "rust-lang/rust",
		defaultBranch: "master",
		installationId: "3",
		status: "active",
		isActive: true,
		updatedAt: new Date().toISOString(),
		docsConfig: {},
	},
	{
		id: "4",
		fullName: "typescript-lang/typescript",
		defaultBranch: "master",
		installationId: "4",
		status: "active",
		isActive: true,
		updatedAt: new Date().toISOString(),
		docsConfig: {},
	},
	{
		id: "5",
		fullName: "shadcn-ui/ui",
		defaultBranch: "master",
		installationId: "5",
		status: "active",
		isActive: true,
		updatedAt: new Date().toISOString(),
		docsConfig: {},
	},
	{
		id: "6",
		fullName: "tailwindlabs/tailwindcss",
		defaultBranch: "master",
		installationId: "6",
		status: "active",
		isActive: true,
		updatedAt: new Date().toISOString(),
		docsConfig: {},
	},
	{
		id: "7",
		fullName: "vercel/next.js",
		defaultBranch: "master",
		installationId: "7",
		status: "active",
		isActive: true,
		updatedAt: new Date().toISOString(),
		docsConfig: {},
	},
	{
		id: "8",
		fullName: "facebook/react",
		defaultBranch: "master",
		installationId: "8",
		status: "active",
		isActive: true,
		updatedAt: new Date().toISOString(),
		docsConfig: {},
	},
	{
		id: "9",
		fullName: "angular/angular",
		defaultBranch: "master",
		installationId: "9",
		status: "active",
		isActive: true,
		updatedAt: new Date().toISOString(),
		docsConfig: {},
	},
];

export default function ServerPage() {
	return (
		<main>
			<section className="py-12">
				<div className="max-w-7xl w-full mx-auto px-8">
					<PageTitle>New Project</PageTitle>
					<div className="grid grid-cols-3 gap-8 mt-2">
						<div className="col-span-1">
							<PageDescription>
								Projects are used to group repositories and track their documentation. Create a new
								project to get started.
							</PageDescription>
							<Separator className="my-6" />
							<p className="text-sm text-zinc-700 flex justify-start items-center gap-2">
								<Building2Icon className="size-3.5 text-zinc-500" /> Random Corp. Inc
							</p>
							<p className="text-sm text-zinc-700 flex justify-start items-center gap-2 mt-2">
								<UserIcon className="size-3.5 text-zinc-500" /> chris23lngr
							</p>
							<div className="mt-12 space-y-2">
								<Link
									href={"#"}
									className="text-xs font-medium text-zinc-700 flex justify-start items-center gap-2"
								>
									<BookOpenIcon className="size-3.5 text-zinc-500" /> Learn more about projects
								</Link>
								<Link
									href={"#"}
									className="text-xs font-medium text-zinc-700 flex justify-start items-center gap-2"
								>
									<ArrowLeftIcon className="size-3.5 text-zinc-500" /> Back to projects
								</Link>
							</div>
						</div>
						<CreateProjectForm repositories={repositories} className="col-span-2" />
						{/* <div className="col-span-2">
							<div className="rounded-lg ring-1 ring-zinc-700/10 shadow-xl shadow-zinc-700/5 overflow-hidden">
								<div className="p-8 border-b border-zinc-200 bg-zinc-50">
									<p className="font-medium text-zinc-800">Target repository</p>
									<p className="text-sm text-zinc-500 mt-1">
										This is the repository that will be used to store the documentation.
									</p>
								</div>
								<div className="p-8">
									<p className="text-sm font-medium text-zinc-800">Select source</p>
									<Select>
										<SelectTrigger className={"w-full mt-2"}>
											<SelectValue placeholder="Select a repository" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectLabel>GitHub</SelectLabel>
												<SelectItem value="chris23lngr/neovim">
													<span>chris23lngr/nvim</span>
												</SelectItem>
												<SelectItem value="neovim/neovim">
													<span>neovim/neovim</span>
												</SelectItem>
											</SelectGroup>
										</SelectContent>
									</Select>
									<p className="text-xs text-zinc-500 mt-2">
										Can't find your repository? Make sure you have connected your GitHub account.
									</p>
								</div>
								<div className="p-8 pt-0">
									<p className="text-sm font-medium text-zinc-800">Framework</p>
									<Select>
										<SelectTrigger className={"w-full mt-2"}>
											<SelectValue placeholder="Select a framework" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectLabel>GitHub</SelectLabel>
												<SelectItem value="chris23lngr/neovim">
													<span>chris23lngr/nvim</span>
												</SelectItem>
												<SelectItem value="neovim/neovim">
													<span>neovim/neovim</span>
												</SelectItem>
											</SelectGroup>
										</SelectContent>
									</Select>
									<p className="text-xs text-zinc-500 mt-2">
										Can't find your repository? Make sure you have connected your GitHub account.
									</p>
								</div>
							</div>
							<div className="rounded-lg ring-1 ring-zinc-700/10 shadow-xl shadow-zinc-700/5 overflow-hidden mt-12">
								<div className="p-8 border-b border-zinc-200 bg-zinc-50">
									<p className="font-medium text-zinc-800">Source repository</p>
									<p className="text-sm text-zinc-500 mt-1">
										Configure the source repository to be used for documentation.
									</p>
								</div>
								<div className="p-8">
									<div className="flex items-center gap-2">
										<Checkbox /> <Label>Same as source repository</Label>
									</div>
									<div className="mt-4 pl-6">
										<Combobox
											items={[
												"chris23lngr/nvim",
												"neovim/neovim",
												"rust-lang/rust",
												"typescript-lang/typescript",
												"shadcn-ui/ui",
											]}
										>
											<ComboboxInput />
											<ComboboxContent>
												<ComboboxEmpty>No repositories found.</ComboboxEmpty>
												<ComboboxList>
													{(item) => (
														<ComboboxItem value={item} key={item}>
															{item}
														</ComboboxItem>
													)}
												</ComboboxList>
											</ComboboxContent>
										</Combobox>
										<p className="text-xs text-zinc-500 mt-2">
											Can't find your repository? Make sure you have connected your GitHub account.
										</p>
									</div>
								</div>
								<div className="p-8">
									<p className="text-sm font-medium text-zinc-800">Framework</p>
									<Select>
										<SelectTrigger className={"w-full mt-2"}>
											<SelectValue placeholder="Select a framework" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectLabel>GitHub</SelectLabel>
												<SelectItem value="chris23lngr/neovim">
													<span>chris23lngr/nvim</span>
												</SelectItem>
												<SelectItem value="neovim/neovim">
													<span>neovim/neovim</span>
												</SelectItem>
											</SelectGroup>
										</SelectContent>
									</Select>
									<p className="text-xs text-zinc-500 mt-2">
										Can't find your repository? Make sure you have connected your GitHub account.
									</p>
								</div>
							</div>
							<div className="mt-12 flex justify-end">
								<Button>Create project</Button>
							</div>
						</div> */}
					</div>
				</div>
			</section>
		</main>
	);
}
