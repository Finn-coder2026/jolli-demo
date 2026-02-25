import { TextDecoder, TextEncoder } from "node:util";
import { vi } from "vitest";

// Fix TextEncoder/TextDecoder for esbuild (used by intlayer)
// jsdom's polyfills don't satisfy esbuild's invariant checks
// This MUST be in setupFiles (not globalSetup) because it needs to run in the jsdom environment
// biome-ignore lint/suspicious/noExplicitAny: required for global type override
global.TextEncoder = TextEncoder as any;
// biome-ignore lint/suspicious/noExplicitAny: required for global type override
global.TextDecoder = TextDecoder as any;

// Allow unlimited event listeners in test environment to prevent warnings
// when this setup file runs for multiple test suites
process.setMaxListeners(0);

process.stderr.write = () => true;
global.console.error = vi.fn();
global.console.warn = vi.fn();

global.fetch = vi.fn();

class MemoryStorage implements Storage {
	private store = new Map<string, string>();

	get length(): number {
		return this.store.size;
	}

	clear(): void {
		this.store.clear();
	}

	getItem(key: string): string | null {
		return this.store.get(key) ?? null;
	}

	key(index: number): string | null {
		const keys = Array.from(this.store.keys());
		return keys[index] ?? null;
	}

	removeItem(key: string): void {
		this.store.delete(key);
	}

	setItem(key: string, value: string): void {
		this.store.set(key, value);
	}
}

function ensureWebStorage(name: "localStorage" | "sessionStorage"): void {
	const current = (globalThis as Record<string, unknown>)[name] as Storage | undefined;
	const hasStorageShape =
		current &&
		typeof current.getItem === "function" &&
		typeof current.setItem === "function" &&
		typeof current.removeItem === "function" &&
		typeof current.clear === "function";

	if (hasStorageShape) {
		return;
	}

	(globalThis as Record<string, unknown>).Storage = MemoryStorage;

	const fallback = new MemoryStorage();
	(globalThis as Record<string, unknown>)[name] = fallback;
	if (typeof window !== "undefined") {
		(window as unknown as Record<string, unknown>)[name] = fallback;
	}
}

// Some Node environments expose a non-standard localStorage placeholder without Storage methods.
// Ensure tests always run with a complete in-memory Web Storage implementation.
ensureWebStorage("localStorage");
ensureWebStorage("sessionStorage");

// Export helper function for test files that need to create mock IntlayerNode values
export function createMockIntlayerValue(value: string) {
	// biome-ignore lint/suspicious/noExplicitAny: Mock helper returns flexible types
	// biome-ignore lint/style/useConsistentBuiltinInstantiation: Need String object for .value property
	const str = new String(value) as any;
	str.value = value;
	return str;
}

// Shared helper functions for intlayer mocking (used by test files)
function _wrapIntlayerMock(obj: unknown): unknown {
	if (typeof obj === "string") {
		return createMockIntlayerValue(obj);
	}
	if (Array.isArray(obj)) {
		return obj.map(item => _wrapIntlayerMock(item));
	}
	if (obj !== null && typeof obj === "object") {
		// biome-ignore lint/suspicious/noExplicitAny: checking for intlayer insertion/enumeration structure
		const asAny = obj as any;

		// Handle intlayer insertion objects (from insert() function)
		if (asAny.nodeType === "insertion" && typeof asAny.insertion === "string") {
			// Create a mock function that returns the template string
			// Tests can call it with parameters if needed
			const mockFn = vi.fn((params?: Record<string, unknown>) => {
				let result = asAny.insertion;
				if (params) {
					for (const [key, value] of Object.entries(params)) {
						result = result.replace(`{{${key}}}`, String(value));
					}
				}
				return createMockIntlayerValue(result);
			});
			// Also add .value property for tests that access it directly
			// biome-ignore lint/suspicious/noExplicitAny: adding .value property to mock function
			(mockFn as any).value = asAny.insertion;
			return mockFn;
		}

		// Handle intlayer enumeration objects (from enu() function)
		if (asAny.nodeType === "enumeration" && typeof asAny.enumeration === "object") {
			// Create a mock function that returns the appropriate singular/plural form
			const mockFn = vi.fn((count?: number) => {
				const enumObj = asAny.enumeration;
				let result: string;
				if (count !== undefined) {
					// Check for exact count match first
					if (enumObj[String(count)] !== undefined) {
						result = enumObj[String(count)];
					} else if (count === 1 && enumObj["1"] !== undefined) {
						result = enumObj["1"];
					} else if (count === 0 && enumObj["0"] !== undefined) {
						result = enumObj["0"];
					} else {
						// Use fallback for all other counts (plural form)
						result = enumObj.fallback ?? enumObj["1"] ?? "";
					}
				} else {
					result = enumObj.fallback ?? enumObj["1"] ?? "";
				}
				return createMockIntlayerValue(result);
			});
			// Also add .value property for tests that access it directly (use fallback)
			// biome-ignore lint/suspicious/noExplicitAny: adding .value property to mock function
			(mockFn as any).value = asAny.enumeration.fallback ?? asAny.enumeration["1"] ?? "";
			return mockFn;
		}

		// Handle translation objects (from t() function) - objects with language keys like {en, es, fr, ...}
		// These need a .value property that returns the English translation
		if (typeof asAny.en === "string") {
			const mockValue = createMockIntlayerValue(asAny.en);
			return mockValue;
		}

		const wrapped: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj)) {
			wrapped[key] = _wrapIntlayerMock(value);
		}
		return wrapped;
	}
	return obj;
}

// Import auto-generated CONTENT_MAP from built intlayer dictionaries
// This keeps test mocks in sync with actual content
import { CONTENT_MAP } from "../test/IntlayerMock";

// Mock intlayer package to avoid esbuild/jsdom conflicts
// This provides just the Locales enum that tests need
vi.mock("intlayer", () => ({
	Locales: {
		ENGLISH: "en",
		SPANISH: "es",
	},
}));

// Mock react-intlayer to avoid esbuild/jsdom conflicts
// Uses auto-generated CONTENT_MAP from built dictionaries
vi.mock("react-intlayer", () => ({
	useIntlayer: vi.fn((key: string) => {
		const content = CONTENT_MAP[key];
		if (!content) {
			throw new Error(`Missing intlayer content for key: ${key}`);
		}
		return _wrapIntlayerMock(content);
	}),
	useLocale: vi.fn(() => ({
		locale: "en",
		setLocale: vi.fn(),
		availableLocales: ["en", "es"],
		defaultLocale: "en",
	})),
}));

// Mock @radix-ui/react-select to avoid React compatibility issues with Preact
vi.mock("@radix-ui/react-select", () => {
	// Use module-level variable to pass onValueChange from Root to Item
	let currentOnValueChange: ((value: string) => void) | undefined;

	const createComponent = (displayName: string) => {
		// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
		const Component = (props: any) => {
			const { children, ...otherProps } = props;
			return (
				<div {...otherProps} data-radix-select={displayName}>
					{children}
				</div>
			);
		};
		Component.displayName = displayName;
		return Component;
	};

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Root = ({ children, value, onValueChange }: any) => {
		// Store onValueChange so Item can call it
		currentOnValueChange = onValueChange;
		return (
			<div data-radix-select="Root" data-value={value} data-onvaluechange={onValueChange ? "true" : "false"}>
				{children}
			</div>
		);
	};
	Root.displayName = "Root";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Portal = ({ children }: any) => <div data-radix-select="Portal">{children}</div>;
	Portal.displayName = "Portal";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Item = ({ children, value, onSelect, ...props }: any) => {
		const handleClick = () => {
			onSelect?.();
			currentOnValueChange?.(value);
		};
		return (
			<div {...props} data-radix-select="Item" data-value={value} onClick={handleClick}>
				{children}
			</div>
		);
	};
	Item.displayName = "Item";

	return {
		Root,
		Trigger: createComponent("Trigger"),
		Value: createComponent("Value"),
		Icon: createComponent("Icon"),
		Portal,
		Content: createComponent("Content"),
		Viewport: createComponent("Viewport"),
		Item,
		ItemText: createComponent("ItemText"),
		ItemIndicator: createComponent("ItemIndicator"),
		ScrollUpButton: createComponent("ScrollUpButton"),
		ScrollDownButton: createComponent("ScrollDownButton"),
		Group: createComponent("Group"),
		Label: createComponent("Label"),
		Separator: createComponent("Separator"),
	};
});

// Mock @radix-ui/react-dropdown-menu to avoid React compatibility issues with Preact
vi.mock("@radix-ui/react-dropdown-menu", () => {
	// Use a module-level variable to pass onOpenChange from Root to Trigger
	let currentOnOpenChange: ((open: boolean) => void) | undefined;

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Root = ({ children, open, onOpenChange }: any) => {
		// Store onOpenChange so Trigger can call it
		currentOnOpenChange = onOpenChange;
		return (
			<div data-radix-dropdown="Root" data-open={open} data-onopen-change={onOpenChange ? "true" : "false"}>
				{children}
			</div>
		);
	};
	Root.displayName = "Root";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Trigger = ({ children, asChild, onClick, ...props }: any) => {
		const handleClick = (e: unknown) => {
			// Call the original onClick if provided
			onClick?.(e);
			// Notify parent that menu is opening
			currentOnOpenChange?.(true);
		};

		if (asChild && children) {
			// Clone the child element to add onClick handler
			const { cloneElement } = require("preact");
			return cloneElement(children, {
				onClick: (e: unknown) => {
					children.props?.onClick?.(e);
					currentOnOpenChange?.(true);
				},
			});
		}
		return (
			<button {...props} type="button" data-radix-dropdown="Trigger" onClick={handleClick}>
				{children}
			</button>
		);
	};
	Trigger.displayName = "Trigger";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Portal = ({ children }: any) => <div data-radix-dropdown="Portal">{children}</div>;
	Portal.displayName = "Portal";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Content = ({ children, align, ...props }: any) => (
		<div {...props} data-radix-dropdown="Content" data-align={align}>
			{children}
		</div>
	);
	Content.displayName = "Content";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Item = ({ children, onClick, onSelect, ...props }: any) => {
		// Trigger both onClick and onSelect on click, matching real Radix UI behavior
		// where DropdownMenuItem fires onSelect for both mouse clicks and keyboard selection.
		// onSelect is also spread explicitly so tests that fire a "select" DOM event can
		// trigger it via React/Preact's synthetic event system.
		const handleClick = (e: unknown) => {
			onClick?.(e);
			onSelect?.();
		};
		return (
			<div {...props} data-radix-dropdown="Item" onClick={handleClick} onSelect={onSelect} role="menuitem">
				{children}
			</div>
		);
	};
	Item.displayName = "Item";

	const createComponent = (displayName: string) => {
		// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
		const Component = (props: any) => {
			const { children, ...otherProps } = props;
			return (
				<div {...otherProps} data-radix-dropdown={displayName}>
					{children}
				</div>
			);
		};
		Component.displayName = displayName;
		return Component;
	};

	return {
		Root,
		Trigger,
		Portal,
		Content,
		Item,
		Group: createComponent("Group"),
		Label: createComponent("Label"),
		Separator: createComponent("Separator"),
		CheckboxItem: createComponent("CheckboxItem"),
		RadioGroup: createComponent("RadioGroup"),
		RadioItem: createComponent("RadioItem"),
		ItemIndicator: createComponent("ItemIndicator"),
		Sub: createComponent("Sub"),
		SubTrigger: createComponent("SubTrigger"),
		SubContent: createComponent("SubContent"),
	};
});

// Mock @radix-ui/react-dialog to avoid React compatibility issues with Preact
vi.mock("@radix-ui/react-dialog", () => {
	// Use a module-level variable to pass onOpenChange from Root to Overlay
	let currentDialogOnOpenChange: ((open: boolean) => void) | undefined;

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Root = ({ children, open, onOpenChange }: any) => {
		// Store onOpenChange so Overlay can call it
		currentDialogOnOpenChange = onOpenChange;
		if (!open) {
			return null;
		}
		return (
			<div
				data-radix-dialog="Root"
				data-open={open}
				data-onopen-change={onOpenChange ? "true" : "false"}
				data-testid="dialog-root-for-testing"
			>
				{children}
			</div>
		);
	};
	Root.displayName = "Root";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Portal = ({ children }: any) => <div data-radix-dialog="Portal">{children}</div>;
	Portal.displayName = "Portal";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Overlay = (props: any) => (
		<div
			{...props}
			data-radix-dialog="Overlay"
			data-testid="dialog-overlay"
			onClick={() => currentDialogOnOpenChange?.(false)}
		/>
	);
	Overlay.displayName = "Overlay";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Content = ({ children, ...props }: any) => (
		<div {...props} data-radix-dialog="Content">
			{children}
		</div>
	);
	Content.displayName = "Content";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Title = ({ children, ...props }: any) => (
		<h2 {...props} data-radix-dialog="Title">
			{children}
		</h2>
	);
	Title.displayName = "Title";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Description = ({ children, ...props }: any) => (
		<p {...props} data-radix-dialog="Description">
			{children}
		</p>
	);
	Description.displayName = "Description";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Close = ({ children, ...props }: any) => (
		<button {...props} type="button" data-radix-dialog="Close">
			{children}
		</button>
	);
	Close.displayName = "Close";

	return {
		Root,
		Portal,
		Overlay,
		Content,
		Title,
		Description,
		Close,
		// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
		Trigger: ({ children }: any) => children,
	};
});

// Mock @radix-ui/react-alert-dialog to avoid React compatibility issues with Preact
vi.mock("@radix-ui/react-alert-dialog", () => {
	// Module-level variable to pass onOpenChange from Root to Cancel/Overlay
	let currentAlertOnOpenChange: ((open: boolean) => void) | undefined;

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Root = ({ children, open, onOpenChange }: any) => {
		// Store onOpenChange so Cancel/Overlay can call it
		currentAlertOnOpenChange = onOpenChange;
		if (!open) {
			return null;
		}
		return (
			<div data-radix-alert-dialog="Root" data-open={open} data-onopen-change={onOpenChange ? "true" : "false"}>
				{children}
			</div>
		);
	};
	Root.displayName = "Root";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Portal = ({ children }: any) => <div data-radix-alert-dialog="Portal">{children}</div>;
	Portal.displayName = "Portal";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Overlay = (props: any) => (
		<div {...props} data-radix-alert-dialog="Overlay" onClick={() => currentAlertOnOpenChange?.(false)} />
	);
	Overlay.displayName = "Overlay";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Content = ({ children, ...props }: any) => (
		<div {...props} data-radix-alert-dialog="Content">
			{children}
		</div>
	);
	Content.displayName = "Content";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Title = ({ children, ...props }: any) => (
		<h2 {...props} data-radix-alert-dialog="Title">
			{children}
		</h2>
	);
	Title.displayName = "Title";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Description = ({ children, ...props }: any) => (
		<p {...props} data-radix-alert-dialog="Description">
			{children}
		</p>
	);
	Description.displayName = "Description";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Action = ({ children, onClick, ...props }: any) => (
		<button {...props} type="button" data-radix-alert-dialog="Action" onClick={onClick}>
			{children}
		</button>
	);
	Action.displayName = "Action";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Cancel = ({ children, onClick, ...props }: any) => {
		const handleClick = (e: unknown) => {
			// Call original onClick if provided
			onClick?.(e);
			// Notify parent that dialog is closing
			currentAlertOnOpenChange?.(false);
		};
		return (
			<button {...props} type="button" data-radix-alert-dialog="Cancel" onClick={handleClick}>
				{children}
			</button>
		);
	};
	Cancel.displayName = "Cancel";

	return {
		Root,
		Portal,
		Overlay,
		Content,
		Title,
		Description,
		Action,
		Cancel,
		// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
		Trigger: ({ children }: any) => children,
	};
});

// Mock @radix-ui/react-checkbox to avoid React compatibility issues with Preact
vi.mock("@radix-ui/react-checkbox", () => {
	const { forwardRef } = require("preact/compat");

	interface CheckboxRootProps {
		children?: unknown;
		checked?: boolean;
		defaultChecked?: boolean;
		disabled?: boolean;
		onCheckedChange?: (checked: boolean) => void;
		className?: string;
		[key: string]: unknown;
	}

	const Root = forwardRef(
		(
			{ children, checked, defaultChecked, disabled, onCheckedChange, className, ...props }: CheckboxRootProps,
			ref: unknown,
		) => {
			const isChecked = checked ?? defaultChecked ?? false;
			const handleClick = () => {
				if (!disabled && onCheckedChange) {
					onCheckedChange(!isChecked);
				}
			};
			return (
				<button
					{...props}
					ref={ref as React.Ref<HTMLButtonElement>}
					type="button"
					role="checkbox"
					aria-checked={isChecked}
					data-state={isChecked ? "checked" : "unchecked"}
					data-disabled={disabled ? "" : undefined}
					disabled={disabled}
					className={className}
					onClick={handleClick}
				>
					{children as React.ReactNode}
				</button>
			);
		},
	);
	Root.displayName = "Checkbox";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props
	const Indicator = ({ children, className, ...props }: any) => (
		<span {...props} className={className} data-radix-checkbox="Indicator">
			{children}
		</span>
	);
	Indicator.displayName = "CheckboxIndicator";

	return {
		Root,
		Indicator,
	};
});

// Mock @radix-ui/react-radio-group to avoid React compatibility issues with Preact
vi.mock("@radix-ui/react-radio-group", () => {
	const { forwardRef } = require("preact/compat");

	// Module-level variable to store onValueChange callback
	let currentOnValueChange: ((value: string) => void) | undefined;

	interface RadioGroupRootProps {
		children?: unknown;
		value?: string;
		defaultValue?: string;
		onValueChange?: (value: string) => void;
		disabled?: boolean;
		className?: string;
		[key: string]: unknown;
	}

	const Root = forwardRef(
		(
			{ children, value, defaultValue, onValueChange, disabled, className, ...props }: RadioGroupRootProps,
			ref: unknown,
		) => {
			// Store onValueChange so Item can call it
			currentOnValueChange = onValueChange;
			return (
				<div
					{...props}
					ref={ref as React.Ref<HTMLDivElement>}
					role="radiogroup"
					data-radix-radio-group="Root"
					data-value={value ?? defaultValue}
					data-disabled={disabled ? "" : undefined}
					className={className}
				>
					{children as React.ReactNode}
				</div>
			);
		},
	);
	Root.displayName = "RadioGroup";

	interface RadioGroupItemProps {
		children?: unknown;
		value: string;
		disabled?: boolean;
		className?: string;
		id?: string;
		[key: string]: unknown;
	}

	const Item = forwardRef(
		({ children, value, disabled, className, id, ...props }: RadioGroupItemProps, ref: unknown) => {
			const handleClick = () => {
				if (!disabled && currentOnValueChange) {
					currentOnValueChange(value);
				}
			};
			return (
				<button
					{...props}
					ref={ref as React.Ref<HTMLButtonElement>}
					type="button"
					role="radio"
					id={id}
					data-radix-radio-group="Item"
					data-value={value}
					data-disabled={disabled ? "" : undefined}
					className={className}
					onClick={handleClick}
				>
					{children as React.ReactNode}
				</button>
			);
		},
	);
	Item.displayName = "RadioGroupItem";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props
	const Indicator = ({ children, className, ...props }: any) => (
		<span {...props} className={className} data-radix-radio-group="Indicator">
			{children}
		</span>
	);
	Indicator.displayName = "RadioGroupIndicator";

	return {
		Root,
		Item,
		Indicator,
	};
});

// Mock @radix-ui/react-label to avoid React compatibility issues with Preact
vi.mock("@radix-ui/react-label", () => {
	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Root = ({ children, htmlFor, ...props }: any) => (
		<label {...props} htmlFor={htmlFor} data-radix-label="Root">
			{children}
		</label>
	);
	Root.displayName = "Root";

	return { Root };
});

// Mock @radix-ui/react-tooltip to avoid React compatibility issues with Preact
vi.mock("@radix-ui/react-tooltip", () => {
	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Provider = ({ children }: any) => <div data-radix-tooltip="Provider">{children}</div>;
	Provider.displayName = "Provider";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Root = ({ children }: any) => <div data-radix-tooltip="Root">{children}</div>;
	Root.displayName = "Root";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Trigger = ({ children, asChild }: any) => (asChild ? children : <button type="button">{children}</button>);
	Trigger.displayName = "Trigger";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Portal = ({ children }: any) => <div data-radix-tooltip="Portal">{children}</div>;
	Portal.displayName = "Portal";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Content = ({ children, className, sideOffset, ...props }: any) => (
		<div className={className} data-side-offset={sideOffset} data-radix-tooltip="Content" {...props}>
			{children}
		</div>
	);
	Content.displayName = "Content";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Arrow = ({ className }: any) => <div className={className} data-radix-tooltip="Arrow" />;
	Arrow.displayName = "Arrow";

	return { Provider, Root, Trigger, Portal, Content, Arrow };
});

// Mock @radix-ui/react-separator to avoid React compatibility issues with Preact
vi.mock("@radix-ui/react-separator", () => {
	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Root = ({ children, orientation, decorative, className, ...props }: any) => (
		<div
			{...props}
			data-radix-separator="Root"
			data-orientation={orientation}
			data-decorative={decorative}
			className={className}
			role={decorative ? "none" : "separator"}
		>
			{children}
		</div>
	);
	Root.displayName = "Root";

	return { Root };
});

// Mock @radix-ui/react-slot to avoid React compatibility issues with Preact
vi.mock("@radix-ui/react-slot", () => {
	const { cloneElement } = require("preact");
	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Slot = ({ children, ...props }: any) => {
		// If children is a valid element, clone it with the merged props
		if (children && typeof children === "object" && children.type) {
			return cloneElement(children, {
				...props,
				...children.props,
				className: [props.className, children.props?.className].filter(Boolean).join(" "),
			});
		}
		// Fallback: just render children
		return children;
	};
	Slot.displayName = "Slot";

	return { Slot };
});

// Storage for captured DndContext callbacks (for testing)
// Using globalThis to avoid circular dependency issues with ESM
// Note: var is required for global scope declarations in TypeScript
declare global {
	var __dndContextCallbacks: {
		onDragStart?: (event: { active: { id: string | number } }) => void;
		onDragOver?: (event: { over: { id: string | number } | null; delta: { x: number } }) => void;
		onDragEnd?: (event: { active: { id: string | number }; over: { id: string | number } | null }) => void;
		onDragCancel?: () => void;
	};
}

globalThis.__dndContextCallbacks = {};

export const dndContextCallbacks = globalThis.__dndContextCallbacks;

// Mock @dnd-kit/core for drag-and-drop functionality
vi.mock("@dnd-kit/core", () => {
	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const DndContext = ({ children, onDragStart, onDragOver, onDragEnd, onDragCancel }: any) => {
		// Use globalThis to store callbacks (avoids circular dependency)
		globalThis.__dndContextCallbacks.onDragStart = onDragStart;
		globalThis.__dndContextCallbacks.onDragOver = onDragOver;
		globalThis.__dndContextCallbacks.onDragEnd = onDragEnd;
		globalThis.__dndContextCallbacks.onDragCancel = onDragCancel;

		return (
			<div data-dnd-context="true" data-testid="dnd-context">
				{children}
			</div>
		);
	};
	DndContext.displayName = "DndContext";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const DragOverlay = ({ children }: any) => (
		<div data-dnd-overlay="true" data-testid="drag-overlay">
			{children}
		</div>
	);
	DragOverlay.displayName = "DragOverlay";

	const useDndContext = () => ({
		active: null,
		over: null,
		activatorEvent: null,
		activeNode: null,
		activeNodeRect: null,
		collisions: null,
		containerNodeRect: null,
		draggableNodes: new Map(),
		droppableContainers: new Map(),
		droppableRects: new Map(),
		measureDroppableContainers: vi.fn(),
		overlayNode: null,
		scrollableAncestors: [],
		scrollableAncestorRects: [],
		recomputeLayouts: vi.fn(),
		windowRect: null,
	});

	const useDraggable = ({ id, disabled }: { id: string | number; data?: unknown; disabled?: boolean }) => ({
		active: null,
		activeNodeRect: null,
		attributes: {
			role: "button",
			tabIndex: 0,
			"aria-pressed": false,
			"aria-roledescription": "draggable",
			"aria-describedby": `DndDescribedBy-${id}`,
		},
		isDragging: false,
		listeners: disabled
			? {}
			: {
					onKeyDown: vi.fn(),
					onPointerDown: vi.fn(),
				},
		node: { current: null },
		over: null,
		setNodeRef: vi.fn(),
		setActivatorNodeRef: vi.fn(),
		transform: null,
	});

	const useDroppable = (_options: { id: string | number; data?: unknown; disabled?: boolean }) => ({
		active: null,
		isOver: false,
		node: { current: null },
		over: null,
		rect: { current: null },
		setNodeRef: vi.fn(),
	});

	// Sensors
	const PointerSensor = { activators: [{ eventName: "onPointerDown" }] };
	const KeyboardSensor = { activators: [{ eventName: "onKeyDown" }] };
	const MouseSensor = { activators: [{ eventName: "onMouseDown" }] };
	const TouchSensor = { activators: [{ eventName: "onTouchStart" }] };

	const useSensor = (sensor: unknown, options?: unknown) => ({ sensor, options });
	const useSensors = (...sensors: Array<unknown>) => sensors;

	// Collision detection
	const closestCenter = vi.fn(() => []);
	const closestCorners = vi.fn(() => []);
	const rectIntersection = vi.fn(() => []);
	const pointerWithin = vi.fn(() => []);

	// Utilities
	const defaultDropAnimationSideEffects = vi.fn(() => ({}));
	const MeasuringStrategy = {
		Always: "always",
		BeforeDragging: "beforeDragging",
		WhileDragging: "whileDragging",
	};

	return {
		DndContext,
		DragOverlay,
		useDndContext,
		useDraggable,
		useDroppable,
		PointerSensor,
		KeyboardSensor,
		MouseSensor,
		TouchSensor,
		useSensor,
		useSensors,
		closestCenter,
		closestCorners,
		rectIntersection,
		pointerWithin,
		defaultDropAnimationSideEffects,
		MeasuringStrategy,
	};
});

// Mock @dnd-kit/sortable for sortable list functionality
vi.mock("@dnd-kit/sortable", () => {
	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const SortableContext = ({ children }: any) => (
		<div data-sortable-context="true" data-testid="sortable-context">
			{children}
		</div>
	);
	SortableContext.displayName = "SortableContext";

	const useSortable = ({ id, data, disabled }: { id: string | number; data?: unknown; disabled?: boolean }) => ({
		active: null,
		activeIndex: -1,
		attributes: {
			role: "button",
			tabIndex: 0,
			"aria-pressed": false,
			"aria-roledescription": "sortable",
			"aria-describedby": `DndDescribedBy-${id}`,
		},
		data: { current: data },
		rect: { current: null },
		index: 0,
		isDragging: false,
		isSorting: false,
		isOver: false,
		items: [],
		listeners: disabled
			? {}
			: {
					onKeyDown: vi.fn(),
					onPointerDown: vi.fn(),
				},
		node: { current: null },
		over: null,
		overIndex: -1,
		setNodeRef: vi.fn(),
		setActivatorNodeRef: vi.fn(),
		setDroppableNodeRef: vi.fn(),
		setDraggableNodeRef: vi.fn(),
		transform: null,
		transition: null,
	});

	const sortableKeyboardCoordinates = vi.fn();
	const verticalListSortingStrategy = vi.fn(() => null);
	const horizontalListSortingStrategy = vi.fn(() => null);
	const rectSortingStrategy = vi.fn(() => null);
	const rectSwappingStrategy = vi.fn(() => null);

	const arrayMove = (array: Array<unknown>, from: number, to: number) => {
		const newArray = [...array];
		const [item] = newArray.splice(from, 1);
		newArray.splice(to, 0, item);
		return newArray;
	};

	return {
		SortableContext,
		useSortable,
		sortableKeyboardCoordinates,
		verticalListSortingStrategy,
		horizontalListSortingStrategy,
		rectSortingStrategy,
		rectSwappingStrategy,
		arrayMove,
	};
});

// Mock @dnd-kit/utilities for CSS transform utilities
vi.mock("@dnd-kit/utilities", () => {
	const CSS = {
		Transform: {
			toString: (transform: { x?: number; y?: number; scaleX?: number; scaleY?: number } | null) => {
				if (!transform) {
					return;
				}
				const { x = 0, y = 0, scaleX = 1, scaleY = 1 } = transform;
				return `translate3d(${x}px, ${y}px, 0) scaleX(${scaleX}) scaleY(${scaleY})`;
			},
		},
		Transition: {
			toString: ({ property, duration, easing }: { property: string; duration: number; easing: string }) =>
				`${property} ${duration}ms ${easing}`,
		},
	};

	return { CSS };
});

// Mock react-resizable-panels (v2.x API) to avoid issues in test environment
vi.mock("react-resizable-panels", () => {
	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const PanelGroup = ({ children, direction, onLayout, ...props }: any) => (
		<div {...props} data-resizable-group="Group" data-panel-group-direction={direction}>
			{children}
		</div>
	);
	PanelGroup.displayName = "PanelGroup";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Panel = ({ children, ...props }: any) => (
		<div {...props} data-resizable-panel="Panel">
			{children}
		</div>
	);
	Panel.displayName = "Panel";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const PanelResizeHandle = ({ children, ...props }: any) => (
		<div {...props} data-resizable-handle="PanelResizeHandle">
			{children}
		</div>
	);
	PanelResizeHandle.displayName = "PanelResizeHandle";

	return { PanelGroup, Panel, PanelResizeHandle };
});

// Mock @radix-ui/react-popover to avoid React compatibility issues with Preact
vi.mock("@radix-ui/react-popover", () => {
	// Use a module-level variable to pass onOpenChange from Root to Content
	let currentPopoverOnOpenChange: ((open: boolean) => void) | undefined;
	let currentPopoverOpen: boolean | undefined;

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Root = ({ children, open, onOpenChange }: any) => {
		currentPopoverOnOpenChange = onOpenChange;
		currentPopoverOpen = open;
		return (
			<div data-radix-popover="Root" data-open={open} data-onopen-change={onOpenChange ? "true" : "false"}>
				{children}
			</div>
		);
	};
	Root.displayName = "Root";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Trigger = ({ children, asChild, onClick, ...props }: any) => {
		const handleClick = (e: unknown) => {
			onClick?.(e);
			currentPopoverOnOpenChange?.(!currentPopoverOpen);
		};

		if (asChild && children) {
			const { cloneElement } = require("preact");
			return cloneElement(children, {
				onClick: (e: unknown) => {
					children.props?.onClick?.(e);
					currentPopoverOnOpenChange?.(!currentPopoverOpen);
				},
			});
		}
		return (
			<button {...props} type="button" data-radix-popover="Trigger" onClick={handleClick}>
				{children}
			</button>
		);
	};
	Trigger.displayName = "Trigger";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Portal = ({ children }: any) => <div data-radix-popover="Portal">{children}</div>;
	Portal.displayName = "Portal";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Content = ({ children, align, sideOffset, ...props }: any) => (
		<div {...props} data-radix-popover="Content" data-align={align} data-side-offset={sideOffset}>
			{children}
		</div>
	);
	Content.displayName = "Content";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Anchor = ({ children, ...props }: any) => (
		<div {...props} data-radix-popover="Anchor">
			{children}
		</div>
	);
	Anchor.displayName = "Anchor";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Close = ({ children, ...props }: any) => (
		<button {...props} type="button" data-radix-popover="Close" onClick={() => currentPopoverOnOpenChange?.(false)}>
			{children}
		</button>
	);
	Close.displayName = "Close";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Arrow = (props: any) => <div {...props} data-radix-popover="Arrow" />;
	Arrow.displayName = "Arrow";

	return {
		Root,
		Trigger,
		Portal,
		Content,
		Anchor,
		Close,
		Arrow,
	};
});

// Mock @radix-ui/react-tabs to properly render tab content with state management
// This mock creates a stateful tabs implementation that properly triggers onValueChange
vi.mock("@radix-ui/react-tabs", async () => {
	const React = await import("react");
	const { createContext, useContext, useState } = React;

	// Create context to share active tab state between Root, Trigger, and Content
	const TabsContext = createContext<{
		activeValue: string;
		setActiveValue: (value: string) => void;
	} | null>(null);

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Root = ({ children, defaultValue, value, onValueChange }: any) => {
		// Use controlled value if provided, otherwise use internal state
		const [internalValue, setInternalValue] = useState(defaultValue ?? "");
		const activeValue = value ?? internalValue;

		const setActiveValue = (newValue: string) => {
			if (onValueChange) {
				onValueChange(newValue);
			}
			if (value === undefined) {
				setInternalValue(newValue);
			}
		};

		return (
			<TabsContext.Provider value={{ activeValue, setActiveValue }}>
				<div data-radix-tabs="Root" data-default-value={defaultValue}>
					{children}
				</div>
			</TabsContext.Provider>
		);
	};
	Root.displayName = "Root";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const List = ({ children, ...props }: any) => (
		<div {...props} data-radix-tabs="List">
			{children}
		</div>
	);
	List.displayName = "List";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Trigger = ({ children, value, ...props }: any) => {
		const context = useContext(TabsContext);
		const handleClick = (e: Event) => {
			context?.setActiveValue(value);
			props.onClick?.(e);
		};
		return (
			<button {...props} type="button" data-radix-tabs="Trigger" data-value={value} onClick={handleClick}>
				{children}
			</button>
		);
	};
	Trigger.displayName = "Trigger";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Content = ({ children, value, ...props }: any) => {
		const context = useContext(TabsContext);
		// Only render content when this tab is active
		const isActive = context?.activeValue === value;
		return (
			<div {...props} data-radix-tabs="Content" data-value={value}>
				{isActive ? children : null}
			</div>
		);
	};
	Content.displayName = "Content";

	return {
		Root,
		List,
		Trigger,
		Content,
	};
});

// Mock @radix-ui/react-collapsible to avoid React compatibility issues with Preact
vi.mock("@radix-ui/react-collapsible", () => {
	// Use module-level variable to track open state and pass onOpenChange
	let currentCollapsibleOnOpenChange: ((open: boolean) => void) | undefined;
	let currentCollapsibleOpen: boolean | undefined;

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Root = ({ children, open, onOpenChange }: any) => {
		currentCollapsibleOnOpenChange = onOpenChange;
		currentCollapsibleOpen = open;
		return (
			<div
				data-radix-collapsible="Root"
				data-state={open ? "open" : "closed"}
				data-collapsible-open={open}
				data-collapsible-on-open-change={onOpenChange ? "true" : "false"}
			>
				{children}
			</div>
		);
	};
	Root.displayName = "Root";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const CollapsibleTrigger = ({ children, asChild, onClick, ...props }: any) => {
		const handleClick = (e: unknown) => {
			onClick?.(e);
			currentCollapsibleOnOpenChange?.(!currentCollapsibleOpen);
		};

		if (asChild && children) {
			const { cloneElement } = require("preact");
			return cloneElement(children, {
				onClick: (e: unknown) => {
					children.props?.onClick?.(e);
					currentCollapsibleOnOpenChange?.(!currentCollapsibleOpen);
				},
			});
		}
		return (
			<button type="button" {...props} data-radix-collapsible="Trigger" onClick={handleClick}>
				{children}
			</button>
		);
	};
	CollapsibleTrigger.displayName = "CollapsibleTrigger";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const CollapsibleContent = ({ children, ...props }: any) => {
		// In test environment, always render content so tests can access children
		// The actual visibility behavior is controlled by parent component's state
		return (
			<div {...props} data-radix-collapsible="Content">
				{children}
			</div>
		);
	};
	CollapsibleContent.displayName = "CollapsibleContent";

	return {
		Root,
		CollapsibleTrigger,
		CollapsibleContent,
	};
});

// Mock react-day-picker for Calendar component testing
vi.mock("react-day-picker", () => {
	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const DayPicker = ({ mode, selected, onSelect, disabled, className, ...props }: any) => {
		// Simulate clicking a date - call onSelect with a mock date
		const handleDateClick = (date: Date) => {
			if (disabled) {
				const isDisabled = typeof disabled === "function" ? disabled(date) : false;
				if (isDisabled) {
					return;
				}
			}
			onSelect?.(date);
		};

		// Generate a simple mock calendar for testing
		// Use year, month (0-indexed), day constructor for timezone-safe local date
		const mockDate = new Date(2025, 0, 15);

		return (
			<div data-react-day-picker="DayPicker" data-mode={mode} className={className} {...props}>
				<div data-testid="calendar-mock">
					<button
						type="button"
						data-testid="calendar-date-15"
						onClick={() => handleDateClick(mockDate)}
						aria-selected={selected?.toDateString() === mockDate.toDateString()}
					>
						15
					</button>
				</div>
			</div>
		);
	};
	DayPicker.displayName = "DayPicker";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const DayButton = ({ children, ...props }: any) => (
		<button type="button" data-react-day-picker="DayButton" {...props}>
			{children}
		</button>
	);
	DayButton.displayName = "DayButton";

	const getDefaultClassNames = () => ({
		root: "rdp-root",
		months: "rdp-months",
		month: "rdp-month",
		nav: "rdp-nav",
		button_previous: "rdp-button_previous",
		button_next: "rdp-button_next",
		month_caption: "rdp-month_caption",
		dropdowns: "rdp-dropdowns",
		dropdown_root: "rdp-dropdown_root",
		dropdown: "rdp-dropdown",
		caption_label: "rdp-caption_label",
		weekdays: "rdp-weekdays",
		weekday: "rdp-weekday",
		week: "rdp-week",
		week_number_header: "rdp-week_number_header",
		week_number: "rdp-week_number",
		day: "rdp-day",
		range_start: "rdp-range_start",
		range_middle: "rdp-range_middle",
		range_end: "rdp-range_end",
		today: "rdp-today",
		outside: "rdp-outside",
		disabled: "rdp-disabled",
		hidden: "rdp-hidden",
	});

	return {
		DayPicker,
		DayButton,
		getDefaultClassNames,
	};
});

// Mock sonner to avoid issues in test environment
// The Toaster component renders nothing in tests, and toast functions are mocked
vi.mock("sonner", () => {
	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props
	const Toaster = (_props: any) => null;
	Toaster.displayName = "Toaster";

	const toast = Object.assign(vi.fn(), {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warning: vi.fn(),
		loading: vi.fn(),
		promise: vi.fn(),
		custom: vi.fn(),
		dismiss: vi.fn(),
		message: vi.fn(),
	});

	return {
		Toaster,
		toast,
	};
});

// Mock lucide-react to avoid ESM/DOM issues in test environment
// Returns simple SVG components that tests can verify
vi.mock("lucide-react", () => {
	const createIconComponent = (iconName: string) => {
		// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props
		const IconComponent = (props: any) => {
			const { className, size, color, strokeWidth, ...otherProps } = props;
			return (
				<svg
					{...otherProps}
					data-lucide-icon={iconName}
					className={className}
					width={size}
					height={size}
					stroke={color}
					strokeWidth={strokeWidth}
				/>
			);
		};
		IconComponent.displayName = iconName;
		return IconComponent;
	};

	// Export all icons used in the codebase
	return {
		AlertCircle: createIconComponent("AlertCircle"),
		AlertTriangle: createIconComponent("AlertTriangle"),
		Archive: createIconComponent("Archive"),
		ArrowDown: createIconComponent("ArrowDown"),
		ArrowLeft: createIconComponent("ArrowLeft"),
		ArrowUp: createIconComponent("ArrowUp"),
		ArrowUpDown: createIconComponent("ArrowUpDown"),
		BarChart3: createIconComponent("BarChart3"),
		Bell: createIconComponent("Bell"),
		Bold: createIconComponent("Bold"),
		BookOpen: createIconComponent("BookOpen"),
		Bot: createIconComponent("Bot"),
		Building2: createIconComponent("Building2"),
		Check: createIconComponent("Check"),
		CheckCircle: createIconComponent("CheckCircle"),
		CheckCircle2: createIconComponent("CheckCircle2"),
		ChevronDown: createIconComponent("ChevronDown"),
		ChevronLeft: createIconComponent("ChevronLeft"),
		ChevronRight: createIconComponent("ChevronRight"),
		ChevronUp: createIconComponent("ChevronUp"),
		ChevronsUpDown: createIconComponent("ChevronsUpDown"),
		Circle: createIconComponent("Circle"),
		ClipboardList: createIconComponent("ClipboardList"),
		Clock: createIconComponent("Clock"),
		Code: createIconComponent("Code"),
		CodeSquare: createIconComponent("CodeSquare"),
		Columns2: createIconComponent("Columns2"),
		Copy: createIconComponent("Copy"),
		Edit: createIconComponent("Edit"),
		Edit3: createIconComponent("Edit3"),
		ExternalLink: createIconComponent("ExternalLink"),
		File: createIconComponent("File"),
		FileCode: createIconComponent("FileCode"),
		Filter: createIconComponent("Filter"),
		FileEdit: createIconComponent("FileEdit"),
		FilePlus: createIconComponent("FilePlus"),
		FileQuestion: createIconComponent("FileQuestion"),
		FileText: createIconComponent("FileText"),
		FileUp: createIconComponent("FileUp"),
		Folder: createIconComponent("Folder"),
		FolderPlus: createIconComponent("FolderPlus"),
		FolderGit2: createIconComponent("FolderGit2"),
		FolderInput: createIconComponent("FolderInput"),
		Gauge: createIconComponent("Gauge"),
		GitBranch: createIconComponent("GitBranch"),
		Github: createIconComponent("Github"),
		Globe: createIconComponent("Globe"),
		Layers: createIconComponent("Layers"),
		LayoutGrid: createIconComponent("LayoutGrid"),
		Lightbulb: createIconComponent("Lightbulb"),
		Link2: createIconComponent("Link2"),
		GripVertical: createIconComponent("GripVertical"),
		Heading1: createIconComponent("Heading1"),
		Heading2: createIconComponent("Heading2"),
		Heading3: createIconComponent("Heading3"),
		Heading4: createIconComponent("Heading4"),
		HelpCircle: createIconComponent("HelpCircle"),
		Highlighter: createIconComponent("Highlighter"),
		History: createIconComponent("History"),
		Image: createIconComponent("Image"),
		Inbox: createIconComponent("Inbox"),
		Italic: createIconComponent("Italic"),
		Key: createIconComponent("Key"),
		LetterText: createIconComponent("LetterText"),
		List: createIconComponent("List"),
		ListChecks: createIconComponent("ListChecks"),
		ListOrdered: createIconComponent("ListOrdered"),
		Loader2: createIconComponent("Loader2"),
		Lock: createIconComponent("Lock"),
		LockOpen: createIconComponent("LockOpen"),
		LogOut: createIconComponent("LogOut"),
		Maximize2: createIconComponent("Maximize2"),
		MessageSquare: createIconComponent("MessageSquare"),
		Monitor: createIconComponent("Monitor"),
		Moon: createIconComponent("Moon"),
		MoreHorizontal: createIconComponent("MoreHorizontal"),
		MoreVertical: createIconComponent("MoreVertical"),
		PanelLeft: createIconComponent("PanelLeft"),
		PanelLeftClose: createIconComponent("PanelLeftClose"),
		PanelLeftOpen: createIconComponent("PanelLeftOpen"),
		PanelRightClose: createIconComponent("PanelRightClose"),
		Pencil: createIconComponent("Pencil"),
		Pilcrow: createIconComponent("Pilcrow"),
		Pin: createIconComponent("Pin"),
		Play: createIconComponent("Play"),
		Plug: createIconComponent("Plug"),
		Plus: createIconComponent("Plus"),
		Quote: createIconComponent("Quote"),
		Redo: createIconComponent("Redo"),
		Redo2: createIconComponent("Redo2"),
		RefreshCw: createIconComponent("RefreshCw"),
		RotateCcw: createIconComponent("RotateCcw"),
		Rows3: createIconComponent("Rows3"),
		Save: createIconComponent("Save"),
		Search: createIconComponent("Search"),
		Send: createIconComponent("Send"),
		Settings: createIconComponent("Settings"),
		Share2: createIconComponent("Share2"),
		Shield: createIconComponent("Shield"),
		ShieldAlert: createIconComponent("ShieldAlert"),
		Sliders: createIconComponent("Sliders"),
		Sparkles: createIconComponent("Sparkles"),
		Square: createIconComponent("Square"),
		Strikethrough: createIconComponent("Strikethrough"),
		Sun: createIconComponent("Sun"),
		Trash: createIconComponent("Trash"),
		Trash2: createIconComponent("Trash2"),
		TrendingUp: createIconComponent("TrendingUp"),
		Underline: createIconComponent("Underline"),
		Undo: createIconComponent("Undo"),
		Undo2: createIconComponent("Undo2"),
		User: createIconComponent("User"),
		UserPlus: createIconComponent("UserPlus"),
		Users: createIconComponent("Users"),
		WandSparkles: createIconComponent("WandSparkles"),
		Wrench: createIconComponent("Wrench"),
		X: createIconComponent("X"),
		XCircle: createIconComponent("XCircle"),
		// Additional icons used by branding components
		CircleX: createIconComponent("CircleX"),
		FolderTree: createIconComponent("FolderTree"),
		Home: createIconComponent("Home"),
		Info: createIconComponent("Info"),
		Linkedin: createIconComponent("Linkedin"),
		Menu: createIconComponent("Menu"),
		Palette: createIconComponent("Palette"),
		Settings2: createIconComponent("Settings2"),
		TriangleAlert: createIconComponent("TriangleAlert"),
		Type: createIconComponent("Type"),
		Youtube: createIconComponent("Youtube"),
		XIcon: createIconComponent("XIcon"),
		CheckIcon: createIconComponent("CheckIcon"),
	};
});

// Track all EventSource instances to ensure proper cleanup
const eventSources: Array<EventSource> = [];

// Mock EventSource for test environment (jsdom doesn't have EventSource)
class MockEventSource extends EventTarget {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSED = 2;

	readonly CONNECTING = 0;
	readonly OPEN = 1;
	readonly CLOSED = 2;
	readonly url: string;
	readonly withCredentials: boolean;
	readyState: number = this.OPEN;
	onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null = null;
	onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
	onopen: ((this: EventSource, ev: Event) => unknown) | null = null;

	constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
		super();
		this.url = typeof url === "string" ? url : url.toString();
		this.withCredentials = eventSourceInitDict?.withCredentials ?? false;
		eventSources.push(this as unknown as EventSource);
	}

	close(): void {
		this.readyState = this.CLOSED;
		this.onmessage = null;
		this.onerror = null;
		this.onopen = null;
	}
}

// biome-ignore lint/suspicious/noExplicitAny: required for global mock
global.EventSource = MockEventSource as any;

vi.stubGlobal(
	"matchMedia",
	vi.fn((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})),
);

global.ResizeObserver = vi.fn().mockImplementation(() => ({
	observe: vi.fn(),
	unobserve: vi.fn(),
	disconnect: vi.fn(),
}));

// Provide a PointerEvent polyfill with pointerId support for pointer-based interactions.
class MockPointerEvent extends MouseEvent {
	pointerId: number;

	constructor(type: string, props: PointerEventInit = {}) {
		super(type, props);
		this.pointerId = props.pointerId ?? 0;
	}
}

global.PointerEvent = MockPointerEvent as unknown as typeof PointerEvent;
global.HTMLElement.prototype.scrollIntoView = vi.fn();
global.HTMLElement.prototype.hasPointerCapture = vi.fn();
global.HTMLElement.prototype.releasePointerCapture = vi.fn();

// Handle unhandled rejections that are test artifacts from Preact cleanup
// These occur when async operations complete after cleanup() freezes components
// The production code properly handles these via isMountedRef and AbortController
const originalUnhandledRejection = process.listeners("unhandledRejection")[0];
process.removeAllListeners("unhandledRejection");
process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
	// Only suppress the specific Preact non-extensible object errors
	if (
		reason instanceof TypeError &&
		reason.message.includes("Cannot add property __") &&
		reason.message.includes("object is not extensible")
	) {
		// Suppress this specific test artifact
		return;
	}
	// Re-throw all other unhandled rejections
	if (originalUnhandledRejection) {
		// biome-ignore lint/suspicious/noExplicitAny: matching original handler signature
		(originalUnhandledRejection as any)(reason, promise);
	}
});

afterEach(() => {
	// Close all EventSource instances to prevent tests from hanging
	for (const source of eventSources) {
		if (source.readyState !== source.CLOSED) {
			source.close();
		}
	}
	eventSources.length = 0;

	vi.resetAllMocks();
});
