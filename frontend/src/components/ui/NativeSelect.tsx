import { type ComponentPropsWithoutRef, forwardRef, type ReactElement } from "react";
import { cn } from "@/common/ClassNameUtils";

export interface NativeSelectProps extends ComponentPropsWithoutRef<"select"> {}

/**
 * Native HTML select element with consistent styling
 * Use this when you need a simple select dropdown that works well in tests
 */
export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
	({ className, ...props }, ref): ReactElement => (
		<select
			ref={ref}
			className={cn(
				"flex h-10 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-background [&>option]:text-foreground",
				className,
			)}
			{...props}
		/>
	),
);

NativeSelect.displayName = "NativeSelect";
