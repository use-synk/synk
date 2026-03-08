import { ProjectsLayout } from "@/modules/projects/components/projects-layout";

async function ServerLayout(props: LayoutProps<"/[slug]/project/[project]">) {
	const { children } = props;

	return <ProjectsLayout>{children}</ProjectsLayout>;
}

export default ServerLayout;
