import { cn } from "@/lib/utils";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

function SidebarCallout({
	className,
	title,
	desc,
	link,
	linkText,
	...props
}: Omit<React.ComponentProps<"div">, "title"> & {
	title: string;
	desc: string;
	link?: string;
	linkText?: string;
}) {
	return (
		<div
			className={cn("rounded-[9px] bg-linear-to-b from bg-stone-200 to-lime-400 p-px")}
			{...props}
		>
			<div className="bg-linear-to-br from-background via-background to-lime-50 rounded-md p-4">
				<p className="text-sm font-medium text-stone-800">{title}</p>
				<p className="text-sm text-stone-500 mt-1">{desc}</p>
				{link && linkText && (
					<Link
						href={link}
						target="_blank"
						rel="noopener noreferrer"
						className="text-sm font-medium text-lime-500 flex justify-center items-center w-fit gap-1.5 mt-6"
					>
						{linkText}
						<ArrowRightIcon className="size-3.5" />
					</Link>
				)}
			</div>
		</div>
	);
}

export { SidebarCallout };
