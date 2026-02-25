/**
 * Shared form components for the branding tab.
 */
import { Input } from "../../../components/ui/Input";
import { ChevronDown, Plus, X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

/** Limits for branding fields - must match backend validation */
export const BRANDING_LIMITS = {
	MAX_HEADER_ITEMS: 6,
	MAX_DROPDOWN_ITEMS: 8,
	MAX_FOOTER_COLUMNS: 4,
	MAX_FOOTER_LINKS_PER_COLUMN: 10,
	MAX_LABEL_LENGTH: 100,
	MAX_LOGO_LENGTH: 50,
	MAX_TOC_TITLE_LENGTH: 50,
	MAX_COPYRIGHT_LENGTH: 200,
	MAX_COLUMN_TITLE_LENGTH: 100,
};

/**
 * Validates a URL is properly formatted with http/https protocol.
 * Returns true for empty strings (optional URLs) or valid http/https URLs.
 */
export function isValidUrl(url: string): boolean {
	// Defensive: UI callers check for empty before calling, so this is a fallback
	/* c8 ignore next 3 */
	if (!url || url.trim() === "") {
		return true; // Empty is valid (field is optional)
	}
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * Collapsible section with header and expand/collapse toggle
 */
export function CollapsibleSection({
	title,
	icon,
	expanded,
	onToggle,
	children,
	...props
}: {
	title: ReactNode;
	icon?: ReactNode;
	expanded: boolean;
	onToggle: () => void;
	children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "title">): ReactElement {
	return (
		<div className="rounded-lg border overflow-hidden" {...props}>
			<button
				type="button"
				onClick={onToggle}
				className="w-full px-3 py-2.5 flex items-center justify-between bg-muted/20 hover:bg-muted/40 transition-colors"
			>
				<span className="flex items-center gap-2.5 text-sm font-medium text-foreground">
					{icon && <span className="text-muted-foreground/70">{icon}</span>}
					{title}
				</span>
				<ChevronDown
					className={`h-4 w-4 text-muted-foreground/50 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
				/>
			</button>
			{expanded && <div className="p-3 border-t bg-background/50">{children}</div>}
		</div>
	);
}

/**
 * Form field wrapper with label, optional hint, and error state
 */
export function Field({
	label,
	hint,
	error,
	children,
}: {
	label: ReactNode;
	hint?: ReactNode;
	error?: string;
	children: ReactNode;
}): ReactElement {
	return (
		<div className="space-y-1.5">
			<div>
				<label className="text-[12px] font-medium text-foreground">{label}</label>
				{hint && !error && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{hint}</p>}
			</div>
			{children}
			{error && <p className="text-[11px] text-red-500">{error}</p>}
		</div>
	);
}

/**
 * Segmented control for selecting between options
 */
export function SegmentedControl({
	options,
	value,
	onChange,
	disabled,
	testIdPrefix,
}: {
	options: Array<{ value: string; label: ReactNode }>;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	testIdPrefix: string;
}): ReactElement {
	return (
		<div className="flex rounded-lg bg-muted/60 p-0.5 border border-border/30">
			{options.map(opt => (
				<button
					key={opt.value}
					type="button"
					onClick={() => onChange(opt.value)}
					disabled={disabled}
					className={`flex-1 px-2 py-1.5 text-[12px] font-medium rounded-md transition-all ${
						value === opt.value
							? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
							: "text-muted-foreground hover:text-foreground hover:bg-background/50"
					} disabled:opacity-50 disabled:cursor-not-allowed`}
					data-testid={`${testIdPrefix}-${opt.value}`}
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}

/**
 * Row for editing a link (label + URL + remove button) with validation
 */
export function LinkRow({
	label,
	url,
	onLabelChange,
	onUrlChange,
	onRemove,
	disabled,
	small,
	testIdPrefix,
}: {
	label: string;
	url: string;
	onLabelChange: (v: string) => void;
	onUrlChange: (v: string) => void;
	onRemove: () => void;
	disabled?: boolean;
	small?: boolean;
	testIdPrefix: string;
}): ReactElement {
	const inputClass = small ? "h-7 text-[12px]" : "h-8 text-[13px]";
	const urlInvalid = url.trim() !== "" && !isValidUrl(url);
	return (
		<div className="group flex items-center gap-1.5 relative">
			<Input
				value={label}
				onChange={e => onLabelChange(e.target.value)}
				placeholder="Label"
				disabled={disabled}
				maxLength={BRANDING_LIMITS.MAX_LABEL_LENGTH}
				className={`flex-[0.4] min-w-0 ${inputClass}`}
				data-testid={`${testIdPrefix}-label`}
			/>
			<Input
				value={url}
				onChange={e => onUrlChange(e.target.value)}
				placeholder="https://..."
				disabled={disabled}
				className={`flex-[0.6] min-w-0 ${inputClass} ${urlInvalid ? "border-red-500 focus-visible:ring-red-500" : ""}`}
				title={urlInvalid ? "URL must start with http:// or https://" : undefined}
				data-testid={`${testIdPrefix}-url`}
			/>
			<button
				type="button"
				onClick={onRemove}
				disabled={disabled}
				className={`${small ? "w-6 h-6" : "w-7 h-7"} flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed`}
				data-testid={`remove-${testIdPrefix}`}
			>
				<X className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />
			</button>
		</div>
	);
}

/**
 * Button for adding new items
 */
export function AddButton({
	onClick,
	disabled,
	small,
	children,
	...props
}: {
	onClick: () => void;
	disabled?: boolean;
	small?: boolean;
	children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>): ReactElement {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={`flex items-center gap-1 ${small ? "text-[11px]" : "text-[12px]"} text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50`}
			{...props}
		>
			<Plus className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />
			{children}
		</button>
	);
}

/**
 * Twitter/X icon
 */
export function TwitterIcon(): ReactElement {
	return (
		<svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
			<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
		</svg>
	);
}

/**
 * Discord icon
 */
export function DiscordIcon(): ReactElement {
	return (
		<svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
			<path d="M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8 8 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.003.022.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.248-.595.05.05 0 0 1-.02-.066l.015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085 8 8 0 0 1-1.249.594.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.03.03 0 0 0-.02-.019m-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612" />
		</svg>
	);
}
