import { ChevronRight } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface BreadcrumbItem {
	label: string;
	path?: string;
}

export interface BreadcrumbProps {
	items: Array<BreadcrumbItem>;
	onNavigate?: (path: string) => void;
}

export function Breadcrumb({ items, onNavigate }: BreadcrumbProps): ReactElement {
	const content = useIntlayer("misc");
	const handleClick = (path: string | undefined) => {
		if (path && onNavigate) {
			onNavigate(path);
		}
	};

	return (
		<nav aria-label={content.breadcrumbAriaLabel.value} className="mb-4">
			<ol className="flex items-center gap-2 text-sm">
				{items.map((item, index) => {
					const isLast = index === items.length - 1;

					return (
						<li key={index} className="flex items-center gap-2">
							{!isLast && item.path ? (
								<button
									type="button"
									onClick={() => handleClick(item.path)}
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									{item.label}
								</button>
							) : (
								/* c8 ignore next 3 */ <span
									className={isLast ? "text-foreground font-medium" : "text-muted-foreground"}
								>
									{item.label}
								</span>
							)}
							{!isLast && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
