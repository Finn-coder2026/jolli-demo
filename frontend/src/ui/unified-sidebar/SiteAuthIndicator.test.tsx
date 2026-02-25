import { SiteAuthIndicator } from "./SiteAuthIndicator";
import { render, screen } from "@testing-library/preact";
import type { SiteMetadata } from "jolli-common";
import { describe, expect, it, vi } from "vitest";

// Helper to create intlayer-style mock values
function createMockIntlayerValue(value: string) {
	// biome-ignore lint/style/useConsistentBuiltinInstantiation: Need String object for .value property
	// biome-ignore lint/suspicious/noExplicitAny: Mock helper returns any to match Intlayer's flexible types
	const str = new String(value) as any;
	str.value = value;
	return str;
}

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		Globe: ({ className }: { className?: string }) => <div data-testid="globe-icon" className={className} />,
		Lock: ({ className }: { className?: string }) => <div data-testid="lock-icon" className={className} />,
	};
});

// Mock intlayer — SiteAuthIndicator uses the "site-auth-indicator" content key
vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		authPublic: createMockIntlayerValue("Public"),
		authProtected: createMockIntlayerValue("Protected"),
	}),
}));

// Mock shadcn Tooltip — renders trigger and content inline for testability
vi.mock("../../components/ui/Tooltip", () => ({
	TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipContent: ({ children }: { children: React.ReactNode }) => (
		<span data-testid="tooltip-content">{children}</span>
	),
}));

describe("SiteAuthIndicator", () => {
	it("should render Globe icon when metadata is undefined", () => {
		render(<SiteAuthIndicator metadata={undefined} />);

		expect(screen.getByTestId("site-auth-public")).toBeDefined();
		expect(screen.getByTestId("globe-icon")).toBeDefined();
	});

	it("should render Globe icon when jwtAuth is undefined", () => {
		const metadata = {
			githubRepo: "org/repo",
			githubUrl: "https://github.com/org/repo",
		} as SiteMetadata;

		render(<SiteAuthIndicator metadata={metadata} />);

		expect(screen.getByTestId("site-auth-public")).toBeDefined();
	});

	it("should render Globe icon when generatedJwtAuthEnabled is false", () => {
		const metadata = {
			githubRepo: "org/repo",
			githubUrl: "https://github.com/org/repo",
			generatedJwtAuthEnabled: false,
		} as SiteMetadata;

		render(<SiteAuthIndicator metadata={metadata} />);

		expect(screen.getByTestId("site-auth-public")).toBeDefined();
	});

	it("should render Lock icon when generatedJwtAuthEnabled is true", () => {
		const metadata = {
			githubRepo: "org/repo",
			githubUrl: "https://github.com/org/repo",
			generatedJwtAuthEnabled: true,
		} as SiteMetadata;

		render(<SiteAuthIndicator metadata={metadata} />);

		expect(screen.getByTestId("site-auth-protected")).toBeDefined();
		expect(screen.getByTestId("lock-icon")).toBeDefined();
	});

	it("should render Globe icon when jwtAuth.enabled is true but site has not been regenerated", () => {
		const metadata = {
			githubRepo: "org/repo",
			githubUrl: "https://github.com/org/repo",
			jwtAuth: { enabled: true, mode: "full" as const, loginUrl: "", publicKey: "" },
			generatedJwtAuthEnabled: false,
		} as SiteMetadata;

		render(<SiteAuthIndicator metadata={metadata} />);

		expect(screen.getByTestId("site-auth-public")).toBeDefined();
	});

	it("should apply custom iconClassName", () => {
		render(<SiteAuthIndicator metadata={undefined} iconClassName="h-4 w-4" />);

		const icon = screen.getByTestId("globe-icon");
		expect(icon.className).toContain("h-4 w-4");
	});

	it("should show 'Public' tooltip for public sites", () => {
		render(<SiteAuthIndicator metadata={undefined} />);

		const tooltip = screen.getByTestId("tooltip-content");
		expect(tooltip.textContent).toBe("Public");
	});

	it("should show 'Protected' tooltip for protected sites", () => {
		const metadata = {
			githubRepo: "org/repo",
			githubUrl: "https://github.com/org/repo",
			generatedJwtAuthEnabled: true,
		} as SiteMetadata;

		render(<SiteAuthIndicator metadata={metadata} />);

		const tooltip = screen.getByTestId("tooltip-content");
		expect(tooltip.textContent).toBe("Protected");
	});

	it("should set aria-label for accessibility", () => {
		render(<SiteAuthIndicator metadata={undefined} />);

		const indicator = screen.getByTestId("site-auth-public");
		expect(indicator.getAttribute("aria-label")).toBe("Public");
	});
});
