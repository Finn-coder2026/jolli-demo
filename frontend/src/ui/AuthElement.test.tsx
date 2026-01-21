import * as UrlUtils from "../common/UrlUtils";
import { ClientProvider } from "../contexts/ClientContext";
import { AuthElement } from "./AuthElement";
import { render, screen, waitFor } from "@testing-library/preact";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDoLogin = vi.fn();

const mockAuthClient = {
	getCliToken: vi.fn(() => Promise.resolve("mock-token")),
	setAuthToken: vi.fn(),
	getEmails: vi.fn(() => Promise.resolve(["test@example.com"])),
	selectEmail: vi.fn(() => Promise.resolve({})),
	getSessionConfig: vi.fn(() => Promise.resolve({ idleTimeoutMs: 3600000, enabledProviders: ["github", "google"] })),
};

const mockClient = {
	visit: vi.fn(() => Promise.resolve()),
	login: vi.fn(() => Promise.resolve(undefined)),
	logout: vi.fn(() => Promise.resolve()),
	status: vi.fn(() => Promise.resolve("ok")),
	auth: vi.fn(() => mockAuthClient),
};

vi.mock("../common/UrlUtils");

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

function TestWrapper({ children }: { children: ReactNode }) {
	return <ClientProvider>{children}</ClientProvider>;
}

describe("AuthElement", () => {
	beforeEach(() => {
		mockDoLogin.mockClear();
		mockAuthClient.getCliToken.mockClear();
		mockAuthClient.setAuthToken.mockClear();
		mockAuthClient.getEmails.mockClear().mockResolvedValue(["test@example.com"]);
		mockAuthClient.selectEmail.mockClear().mockResolvedValue({});
		mockAuthClient.getSessionConfig
			.mockClear()
			.mockResolvedValue({ idleTimeoutMs: 3600000, enabledProviders: ["github", "google"] });
		vi.mocked(UrlUtils.getUrlParam).mockReset().mockReturnValue(undefined);
		vi.mocked(UrlUtils.cleanUrlParams).mockClear();
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({}),
		});
	});

	afterEach(async () => {
		// Wait for any pending promises to resolve
	});

	it("should render login buttons", async () => {
		const { container } = render(
			<TestWrapper>
				<AuthElement doLogin={mockDoLogin} />
			</TestWrapper>,
		);

		// Wait for session config to load and buttons to render
		await waitFor(() => {
			expect(container.textContent).toContain("Login with GitHub");
			expect(container.textContent).toContain("Login with Google");
		});
	});

	it("should only render enabled providers from session config", async () => {
		mockAuthClient.getSessionConfig.mockResolvedValue({
			idleTimeoutMs: 3600000,
			enabledProviders: ["github"], // Only GitHub enabled
		});

		const { container } = render(
			<TestWrapper>
				<AuthElement doLogin={mockDoLogin} />
			</TestWrapper>,
		);

		// Wait for session config to load and buttons to render
		await waitFor(() => {
			expect(container.textContent).toContain("Login with GitHub");
		});

		// Google should not be present
		expect(container.textContent).not.toContain("Login with Google");
	});

	it("should skip unknown providers without icons/names", async () => {
		mockAuthClient.getSessionConfig.mockResolvedValue({
			idleTimeoutMs: 3600000,
			enabledProviders: ["github", "unknown_provider", "google"], // Unknown provider in the middle
		});

		const { container } = render(
			<TestWrapper>
				<AuthElement doLogin={mockDoLogin} />
			</TestWrapper>,
		);

		// Wait for session config to load and buttons to render
		await waitFor(() => {
			expect(container.textContent).toContain("Login with GitHub");
			expect(container.textContent).toContain("Login with Google");
		});

		// Unknown provider should not render a button
		expect(container.textContent).not.toContain("unknown_provider");
	});

	it("should fall back to default providers when session config fails", async () => {
		mockAuthClient.getSessionConfig.mockRejectedValue(new Error("Failed to fetch"));

		const { container } = render(
			<TestWrapper>
				<AuthElement doLogin={mockDoLogin} />
			</TestWrapper>,
		);

		// Wait for fallback providers to render
		await waitFor(() => {
			expect(container.textContent).toContain("Login with GitHub");
			expect(container.textContent).toContain("Login with Google");
		});
	});

	it("should handle OAuth error", () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => void 0);

		vi.mocked(UrlUtils.getUrlParam).mockImplementation((param: string) => {
			if (param === "error") {
				return "oauth_failed";
			}
			return;
		});

		render(
			<TestWrapper>
				<AuthElement doLogin={mockDoLogin} />
			</TestWrapper>,
		);

		expect(screen.getByText("Login failed. Please try again.")).toBeDefined();
		expect(consoleErrorSpy).toHaveBeenCalledWith("OAuth error:", "oauth_failed");
		expect(UrlUtils.cleanUrlParams).toHaveBeenCalled();

		consoleErrorSpy.mockRestore();
	});

	it("should not handle token parameter (cookies used instead)", () => {
		// Token is no longer passed via URL params, it's in HttpOnly cookies
		vi.mocked(UrlUtils.getUrlParam).mockImplementation((param: string) => {
			if (param === "token") {
				return "test-token-123";
			}
			return;
		});

		render(
			<TestWrapper>
				<AuthElement doLogin={mockDoLogin} />
			</TestWrapper>,
		);

		// doLogin should not be called with a token anymore
		expect(mockDoLogin).not.toHaveBeenCalled();
	});

	it("should create GitHub login button and handle click", async () => {
		const { container } = render(
			<TestWrapper>
				<AuthElement doLogin={mockDoLogin} />
			</TestWrapper>,
		);

		// Wait for buttons to render
		await waitFor(() => {
			expect(container.textContent).toContain("Login with GitHub");
		});

		const githubButton = Array.from(container.querySelectorAll("button")).find(btn =>
			btn.textContent?.includes("GitHub"),
		);
		expect(githubButton).toBeDefined();

		// Click the button to trigger the event listener
		if (githubButton) {
			githubButton.click();
		}
	});

	it("should not show error message when no error", () => {
		const { container } = render(
			<TestWrapper>
				<AuthElement doLogin={mockDoLogin} />
			</TestWrapper>,
		);

		expect(container.textContent).not.toContain("Login failed");
	});

	it("should handle select_email parameter and load emails", async () => {
		mockAuthClient.getEmails.mockResolvedValue(["email1@example.com", "email2@example.com"]);

		vi.mocked(UrlUtils.getUrlParam).mockImplementation((param: string) => {
			if (param === "select_email") {
				return "true";
			}
			return;
		});

		render(
			<TestWrapper>
				<AuthElement doLogin={mockDoLogin} />
			</TestWrapper>,
		);

		// Wait for async load
		await waitFor(() => {
			expect(mockAuthClient.getEmails).toHaveBeenCalled();
		});

		expect(UrlUtils.cleanUrlParams).toHaveBeenCalled();
	});

	it("should render email selection UI when emails are loaded", async () => {
		mockAuthClient.getEmails.mockResolvedValue(["test1@example.com", "test2@example.com"]);

		vi.mocked(UrlUtils.getUrlParam).mockImplementation((param: string) => {
			if (param === "select_email") {
				return "true";
			}
			return;
		});

		const { container } = render(
			<TestWrapper>
				<AuthElement doLogin={mockDoLogin} />
			</TestWrapper>,
		);

		// Wait for emails to load
		await waitFor(() => {
			expect(container.textContent).toContain("Select Email");
		});

		expect(container.textContent).toContain("test1@example.com");
		expect(container.textContent).toContain("test2@example.com");
	});

	it("should handle email selection success", async () => {
		mockAuthClient.getEmails.mockResolvedValue(["test@example.com"]);
		mockAuthClient.selectEmail.mockResolvedValue({});

		let selectEmailValue: string | undefined = "true";
		vi.mocked(UrlUtils.getUrlParam).mockImplementation((param: string) => {
			if (param === "select_email") {
				return selectEmailValue;
			}
			return;
		});

		// Mock cleanUrlParams to actually clear the param
		vi.mocked(UrlUtils.cleanUrlParams).mockImplementation(() => {
			selectEmailValue = undefined;
		});

		const { container } = render(
			<TestWrapper>
				<AuthElement doLogin={mockDoLogin} />
			</TestWrapper>,
		);

		// Wait for emails to load
		await waitFor(() => {
			expect(container.textContent).toContain("test@example.com");
		});

		// Click email button
		const emailButton = Array.from(container.querySelectorAll("button")).find(btn =>
			btn.textContent?.includes("test@example.com"),
		);
		emailButton?.click();

		// Wait for selection to complete (doLogin called without token)
		await waitFor(() => {
			expect(mockDoLogin).toHaveBeenCalledWith();
		});
	});

	it("should redirect to tenant when gateway returns redirectTo", async () => {
		mockAuthClient.getEmails.mockResolvedValue(["test@example.com"]);
		mockAuthClient.selectEmail.mockResolvedValue({ redirectTo: "https://acme.jolli.ai" });

		// Track location.href assignment
		const originalLocation = window.location;
		const mockLocation = { ...originalLocation, href: "" };
		Object.defineProperty(window, "location", {
			value: mockLocation,
			writable: true,
		});

		let selectEmailValue: string | undefined = "true";
		vi.mocked(UrlUtils.getUrlParam).mockImplementation((param: string) => {
			if (param === "select_email") {
				return selectEmailValue;
			}
			return;
		});

		vi.mocked(UrlUtils.cleanUrlParams).mockImplementation(() => {
			selectEmailValue = undefined;
		});

		const { container } = render(
			<TestWrapper>
				<AuthElement doLogin={mockDoLogin} />
			</TestWrapper>,
		);

		// Wait for emails to load
		await waitFor(() => {
			expect(container.textContent).toContain("test@example.com");
		});

		// Click email button
		const emailButton = Array.from(container.querySelectorAll("button")).find(btn =>
			btn.textContent?.includes("test@example.com"),
		);
		emailButton?.click();

		// Wait for redirect
		await waitFor(() => {
			expect(mockLocation.href).toBe("https://acme.jolli.ai");
		});

		// doLogin should NOT be called in gateway mode
		expect(mockDoLogin).not.toHaveBeenCalled();

		// Restore location
		Object.defineProperty(window, "location", {
			value: originalLocation,
			writable: true,
		});
	});

	it("should show error when email loading fails", async () => {
		mockAuthClient.getEmails.mockRejectedValue(new Error("Failed to get emails"));

		vi.mocked(UrlUtils.getUrlParam).mockImplementation((param: string) => {
			if (param === "select_email") {
				return "true";
			}
			return;
		});

		const { container } = render(
			<TestWrapper>
				<AuthElement doLogin={mockDoLogin} />
			</TestWrapper>,
		);

		// Wait for error to appear
		await waitFor(() => {
			expect(container.textContent).toContain("Login failed. Please try again.");
		});
	});

	it("should show error when email selection fails", async () => {
		mockAuthClient.getEmails.mockResolvedValue(["test@example.com"]);
		mockAuthClient.selectEmail.mockRejectedValue(new Error("Failed to select email"));

		let selectEmailValue: string | undefined = "true";
		vi.mocked(UrlUtils.getUrlParam).mockImplementation((param: string) => {
			if (param === "select_email") {
				return selectEmailValue;
			}
			return;
		});

		// Mock cleanUrlParams to actually clear the param
		vi.mocked(UrlUtils.cleanUrlParams).mockImplementation(() => {
			selectEmailValue = undefined;
		});

		const { container } = render(
			<TestWrapper>
				<AuthElement doLogin={mockDoLogin} />
			</TestWrapper>,
		);

		// Wait for emails to load
		await waitFor(() => {
			expect(container.textContent).toContain("test@example.com");
		});

		// Click email button
		const emailButton = Array.from(container.querySelectorAll("button")).find(btn =>
			btn.textContent?.includes("test@example.com"),
		);
		emailButton?.click();

		// Wait for error to appear
		await waitFor(() => {
			expect(container.textContent).toContain("Failed to select email. Please try again.");
		});
	});

	it("should save cli_callback parameter to sessionStorage", () => {
		const mockSetItem = vi.fn();
		Object.defineProperty(window, "sessionStorage", {
			value: {
				setItem: mockSetItem,
				getItem: vi.fn(),
				removeItem: vi.fn(),
				clear: vi.fn(),
			},
			writable: true,
		});

		vi.mocked(UrlUtils.getUrlParam).mockImplementation((param: string) => {
			if (param === "cli_callback") {
				return "http://localhost:8080/callback";
			}
			return;
		});

		render(
			<TestWrapper>
				<AuthElement doLogin={mockDoLogin} />
			</TestWrapper>,
		);

		expect(mockSetItem).toHaveBeenCalledWith("cli_callback", "http://localhost:8080/callback");
	});

	it("should not save cli_callback to sessionStorage when parameter is not present", () => {
		const mockSetItem = vi.fn();
		Object.defineProperty(window, "sessionStorage", {
			value: {
				setItem: mockSetItem,
				getItem: vi.fn(),
				removeItem: vi.fn(),
				clear: vi.fn(),
			},
			writable: true,
		});

		vi.mocked(UrlUtils.getUrlParam).mockReturnValue(undefined);

		render(
			<TestWrapper>
				<AuthElement doLogin={mockDoLogin} />
			</TestWrapper>,
		);

		expect(mockSetItem).not.toHaveBeenCalled();
	});

	it("should handle both cli_callback and error parameters", () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => void 0);
		const mockSetItem = vi.fn();
		Object.defineProperty(window, "sessionStorage", {
			value: {
				setItem: mockSetItem,
				getItem: vi.fn(),
				removeItem: vi.fn(),
				clear: vi.fn(),
			},
			writable: true,
		});

		vi.mocked(UrlUtils.getUrlParam).mockImplementation((param: string) => {
			if (param === "cli_callback") {
				return "http://localhost:8080/callback";
			}
			if (param === "error") {
				return "oauth_failed";
			}
			return;
		});

		render(
			<TestWrapper>
				<AuthElement doLogin={mockDoLogin} />
			</TestWrapper>,
		);

		// Should save cli_callback first
		expect(mockSetItem).toHaveBeenCalledWith("cli_callback", "http://localhost:8080/callback");
		// Should still handle error
		expect(screen.getByText("Login failed. Please try again.")).toBeDefined();
		expect(consoleErrorSpy).toHaveBeenCalledWith("OAuth error:", "oauth_failed");

		consoleErrorSpy.mockRestore();
	});
});
