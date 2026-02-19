export default async function ServerLayout(props: LayoutProps<"/[org]">) {
	const { org } = await props.params;

	return (
		<main>
			<h1>Hello {org}</h1>
		</main>
	);
}
