import { PageTitle } from "@/components/typography";

export default async function ServerPage(props: PageProps<"/[slug]/projects/[id]">) {
	const { id } = await props.params;

	return (
		<main>
			<section className="py-12">
				<div className="max-w-7xl w-full mx-auto px-8">
					<PageTitle>Project {id}</PageTitle>
				</div>
			</section>
		</main>
	);
}
