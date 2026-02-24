"use client";
import { PageDescription, PageTitle } from "@/components/typography";
import { Separator } from "@/components/ui/separator";
import { ArrowLeftIcon, BookOpenIcon, Building2Icon, UserIcon } from "lucide-react";
import Link from "next/link";
import { CreateProjectForm } from "./_components/create-project-form";

export type Repository = {
	id: string;
	fullName: string;
	defaultBranch: string;
	installationId: string;
	status: string;
	isActive: boolean;
	updatedAt: string;
	docsConfig: Record<string, unknown>;
};

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
					</div>
				</div>
			</section>
		</main>
	);
}
