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
	const Root = ({ children, value, onValueChange }: any) => (
		<div data-radix-select="Root" data-value={value} data-onvaluechange={onValueChange ? "true" : "false"}>
			{children}
		</div>
	);
	Root.displayName = "Root";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Portal = ({ children }: any) => <div data-radix-select="Portal">{children}</div>;
	Portal.displayName = "Portal";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Item = ({ children, value, onSelect }: any) => (
		<div data-radix-select="Item" data-value={value} onClick={onSelect}>
			{children}
		</div>
	);
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
	const Item = ({ children, onClick, ...props }: any) => (
		<div {...props} data-radix-dropdown="Item" onClick={onClick} role="menuitem">
			{children}
		</div>
	);
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
	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Root = ({ children, open, onOpenChange }: any) => {
		if (!open) {
			return null;
		}
		return (
			<div
				data-radix-dialog="Root"
				data-open={open}
				data-onopen-change={onOpenChange ? "true" : "false"}
				data-testid="dialog-root-for-testing"
				onClick={e => {
					// Allow clicking on overlay to trigger onOpenChange
					if (onOpenChange && (e.target as HTMLElement)?.getAttribute?.("data-radix-dialog") === "Overlay") {
						onOpenChange(false);
					}
				}}
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
	const Overlay = (props: any) => <div {...props} data-radix-dialog="Overlay" data-testid="dialog-overlay" />;
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
	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Root = ({ children, open, onOpenChange }: any) => {
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
	const Overlay = (props: any) => <div {...props} data-radix-alert-dialog="Overlay" />;
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
	const Cancel = ({ children, onClick, ...props }: any) => (
		<button {...props} type="button" data-radix-alert-dialog="Cancel" onClick={onClick}>
			{children}
		</button>
	);
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

// Mock @radix-ui/react-tabs to properly render tab content
vi.mock("@radix-ui/react-tabs", () => {
	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Root = ({ children, defaultValue }: any) => (
		<div data-radix-tabs="Root" data-default-value={defaultValue}>
			{children}
		</div>
	);
	Root.displayName = "Root";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const List = ({ children, ...props }: any) => (
		<div {...props} data-radix-tabs="List">
			{children}
		</div>
	);
	List.displayName = "List";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Trigger = ({ children, value, ...props }: any) => (
		<button {...props} type="button" data-radix-tabs="Trigger" data-value={value}>
			{children}
		</button>
	);
	Trigger.displayName = "Trigger";

	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props including children
	const Content = ({ children, value, ...props }: any) => {
		// Always render content for testing (in real app, only active tab renders)
		// This allows tests to find buttons inside tabs
		return (
			<div {...props} data-radix-tabs="Content" data-value={value}>
				{children}
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
		ArrowLeft: createIconComponent("ArrowLeft"),
		BarChart3: createIconComponent("BarChart3"),
		Bell: createIconComponent("Bell"),
		BookOpen: createIconComponent("BookOpen"),
		Building2: createIconComponent("Building2"),
		Check: createIconComponent("Check"),
		CheckCircle: createIconComponent("CheckCircle"),
		CheckCircle2: createIconComponent("CheckCircle2"),
		ChevronDown: createIconComponent("ChevronDown"),
		ChevronLeft: createIconComponent("ChevronLeft"),
		ChevronRight: createIconComponent("ChevronRight"),
		ChevronUp: createIconComponent("ChevronUp"),
		Circle: createIconComponent("Circle"),
		Clock: createIconComponent("Clock"),
		Code: createIconComponent("Code"),
		Copy: createIconComponent("Copy"),
		Edit: createIconComponent("Edit"),
		ExternalLink: createIconComponent("ExternalLink"),
		File: createIconComponent("File"),
		FileCode: createIconComponent("FileCode"),
		FileEdit: createIconComponent("FileEdit"),
		FilePlus: createIconComponent("FilePlus"),
		FileQuestion: createIconComponent("FileQuestion"),
		FileText: createIconComponent("FileText"),
		FileUp: createIconComponent("FileUp"),
		Folder: createIconComponent("Folder"),
		FolderPlus: createIconComponent("FolderPlus"),
		FolderGit2: createIconComponent("FolderGit2"),
		Gauge: createIconComponent("Gauge"),
		GitBranch: createIconComponent("GitBranch"),
		Github: createIconComponent("Github"),
		Globe: createIconComponent("Globe"),
		GripVertical: createIconComponent("GripVertical"),
		History: createIconComponent("History"),
		Inbox: createIconComponent("Inbox"),
		Loader2: createIconComponent("Loader2"),
		Lock: createIconComponent("Lock"),
		LockOpen: createIconComponent("LockOpen"),
		LogOut: createIconComponent("LogOut"),
		MessageSquare: createIconComponent("MessageSquare"),
		Moon: createIconComponent("Moon"),
		MoreHorizontal: createIconComponent("MoreHorizontal"),
		MoreVertical: createIconComponent("MoreVertical"),
		PanelLeftClose: createIconComponent("PanelLeftClose"),
		PanelLeftOpen: createIconComponent("PanelLeftOpen"),
		Pencil: createIconComponent("Pencil"),
		Pin: createIconComponent("Pin"),
		Play: createIconComponent("Play"),
		Plug: createIconComponent("Plug"),
		Plus: createIconComponent("Plus"),
		Redo2: createIconComponent("Redo2"),
		RefreshCw: createIconComponent("RefreshCw"),
		RotateCcw: createIconComponent("RotateCcw"),
		Save: createIconComponent("Save"),
		Search: createIconComponent("Search"),
		Send: createIconComponent("Send"),
		Settings: createIconComponent("Settings"),
		Share2: createIconComponent("Share2"),
		Sparkles: createIconComponent("Sparkles"),
		Sun: createIconComponent("Sun"),
		Trash: createIconComponent("Trash"),
		Trash2: createIconComponent("Trash2"),
		TrendingUp: createIconComponent("TrendingUp"),
		Undo2: createIconComponent("Undo2"),
		User: createIconComponent("User"),
		Users: createIconComponent("Users"),
		Wrench: createIconComponent("Wrench"),
		X: createIconComponent("X"),
		XCircle: createIconComponent("XCircle"),
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

global.PointerEvent = class PointerEvent extends Event {} as unknown as typeof PointerEvent;
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
