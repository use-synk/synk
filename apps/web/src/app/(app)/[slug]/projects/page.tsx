import { PageTitle } from "@/components/typography";

export default async function ServerPage(_props: PageProps<"/[slug]/projects">) {
	return (
		<main>
			<section className="py-12">
				<div className="max-w-7xl w-full mx-auto px-8">
					<PageTitle>Projects</PageTitle>
					<div>
						<p>Not implemented yet.</p>
					</div>
				</div>
			</section>
		</main>
	);
}
