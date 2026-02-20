export default async function Page(props: PageProps<"/[slug]">) {
	const _params = await props.params;

	return <div>Hello world</div>;
}
