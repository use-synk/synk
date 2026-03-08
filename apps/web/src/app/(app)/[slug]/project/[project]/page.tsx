export default async function ServerPage(props: PageProps<"/[slug]/project/[project]">) {
	const { project } = await props.params;

	return (
		<div className="bg-red-400">
			<h1>Project {project}</h1>
		</div>
	);
}
