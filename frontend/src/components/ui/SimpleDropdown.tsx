import { cn } from "../../common/ClassNameUtils";
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";

interface SimpleDropdownProps {
	trigger: ReactNode;
	children: ReactNode;
	align?: "start" | "end";
	className?: string;
}

/**
 * Gets the alignment class for the dropdown content
 */
function getAlignmentClass(align?: "start" | "end"): string {
	return align === "end" ? "right-0" : "left-0";
}

export function SimpleDropdown({ trigger, children, align = "end", className }: SimpleDropdownProps): ReactElement {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen]);

	return (
		<div className="relative" ref={dropdownRef}>
			<div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
			{isOpen && (
				<div
					className={cn(
						"absolute top-full mt-2 min-w-[12rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md z-50",
						getAlignmentClass(align),
						className,
					)}
				>
					<div onClick={() => setIsOpen(false)}>{children}</div>
				</div>
			)}
		</div>
	);
}

interface SimpleDropdownItemProps {
	children: ReactNode;
	onClick?: () => void;
	className?: string;
}

export function SimpleDropdownItem({ children, onClick, className }: SimpleDropdownItemProps): ReactElement {
	return (
		<div
			className={cn(
				"relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
				className,
			)}
			onClick={onClick}
		>
			{children}
		</div>
	);
}

export function SimpleDropdownSeparator(): ReactElement {
	return <div className="-mx-1 my-1 h-px bg-muted" />;
}
