/**
 * Fallback for the @breadcrumb parallel route slot.
 *
 * Next.js requires a default.tsx in every parallel route slot to prevent
 * unmatched routes from producing a 404 during hard navigation (e.g. page
 * refresh or direct URL entry). This file renders nothing so that pages which
 * do not define a breadcrumb simply show no breadcrumb content.
 */
export default function BreadcrumbDefault(): null {
	return null;
}
