import type { LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

export interface DashboardCardProps {
	/**
	 * Card title
	 */
	title: string;

	/**
	 * Optional icon
	 */
	icon?: LucideIcon;

	/**
	 * Card content
	 */
	children: ReactNode;

	/**
	 * Optional action button in header
	 */
	action?: ReactElement;

	/**
	 * Optional CSS class name
	 */
	className?: string;
}

/**
 * Base dashboard card component with consistent styling
 */
export function DashboardCard({
	title,
	icon: Icon,
	children,
	action,
	className = "",
}: DashboardCardProps): ReactElement {
	return (
		<div className={`bg-card rounded-lg p-6 border ${className}`}>
			<div className="flex items-center justify-between mb-4">
				<div className="flex items-center gap-3">
					{Icon && (
						<div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
							<Icon className="w-5 h-5 text-primary" />
						</div>
					)}
					<h2 className="text-lg font-semibold m-0">{title}</h2>
				</div>
				{action && <div>{action}</div>}
			</div>
			<div>{children}</div>
		</div>
	);
}
