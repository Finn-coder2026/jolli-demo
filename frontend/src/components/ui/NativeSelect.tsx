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
				"h-10 w-full appearance-none rounded-md border border-input bg-transparent bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%236b7280%22%20d%3D%22M2%204l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat pl-3 pr-10 text-sm leading-10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-background [&>option]:text-foreground",
				className,
			)}
			{...props}
		/>
	),
);

NativeSelect.displayName = "NativeSelect";
