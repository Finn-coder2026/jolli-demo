import { Indicator, Item, Root } from "@radix-ui/react-radio-group";
import { Circle } from "lucide-react";
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react";
import { cn } from "@/common/ClassNameUtils";

const RadioGroup = forwardRef<ElementRef<typeof Root>, ComponentPropsWithoutRef<typeof Root>>(
	({ className, ...props }, ref) => {
		return <Root className={cn("grid gap-2", className)} {...props} ref={ref} />;
	},
);
RadioGroup.displayName = Root.displayName;

const RadioGroupItem = forwardRef<ElementRef<typeof Item>, ComponentPropsWithoutRef<typeof Item>>(
	({ className, ...props }, ref) => {
		return (
			<Item
				ref={ref}
				className={cn(
					"aspect-square h-4 w-4 rounded-full border border-primary text-primary shadow focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
					className,
				)}
				{...props}
			>
				<Indicator className="flex items-center justify-center">
					<Circle className="h-2.5 w-2.5 fill-primary" />
				</Indicator>
			</Item>
		);
	},
);
RadioGroupItem.displayName = Item.displayName;

export { RadioGroup, RadioGroupItem };
