import { getProjectDetail } from "@/api/endpoints";
import { fetchQuery } from "@/api/server";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export default async function ServerPage(
	props: PageProps<"/[slug]/projects/[id]">,
): Promise<React.ReactNode> {
	const { slug, id } = await props.params;
	const res = await fetchQuery(getProjectDetail({ projectId: id }));

	return (
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbItem>
					<BreadcrumbLink href={`/${slug}`}>Dashboard</BreadcrumbLink>
				</BreadcrumbItem>
				<BreadcrumbSeparator />
				<BreadcrumbItem>
					<BreadcrumbLink href={`/${slug}/projects`}>Projects</BreadcrumbLink>
				</BreadcrumbItem>
				<BreadcrumbSeparator />
				<BreadcrumbItem>
					<BreadcrumbPage>{res.data.name}</BreadcrumbPage>
				</BreadcrumbItem>
			</BreadcrumbList>
		</Breadcrumb>
	);
}
