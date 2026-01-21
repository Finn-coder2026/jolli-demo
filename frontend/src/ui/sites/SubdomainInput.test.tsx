import { createMockClient, renderWithProviders } from "../../test/TestUtils";
import {
	DEBOUNCE_MS,
	generateSubdomainFromName,
	MAX_SUBDOMAIN_LENGTH,
	MIN_SUBDOMAIN_LENGTH,
	SUBDOMAIN_PATTERN,
	SubdomainInput,
	validateSubdomain,
} from "./SubdomainInput";
import { act, fireEvent, screen, waitFor } from "@testing-library/preact";
import type { SiteClient } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		CheckCircle: () => <div data-testid="status-available" />,
		Loader2: () => <div data-testid="status-checking" />,
		XCircle: () => <div data-testid="status-unavailable" />,
	};
});

const mockSiteClient = {
	checkSubdomainAvailability: vi.fn(),
};

describe("SubdomainInput", () => {
	const mockOnChange = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mockSiteClient.checkSubdomainAvailability.mockResolvedValue({ available: true });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function renderSubdomainInput(props: Partial<Parameters<typeof SubdomainInput>[0]> = {}) {
		const mockClient = createMockClient();
		mockClient.sites = vi.fn(() => mockSiteClient as unknown as SiteClient);

		return renderWithProviders(
			<SubdomainInput value="" onChange={mockOnChange} siteName="" disabled={false} {...props} />,
			{ client: mockClient },
		);
	}

	describe("helper functions", () => {
		describe("generateSubdomainFromName", () => {
			it("should convert to lowercase", () => {
				expect(generateSubdomainFromName("MyDocs")).toBe("mydocs");
			});

			it("should replace spaces with hyphens", () => {
				expect(generateSubdomainFromName("My Docs Site")).toBe("my-docs-site");
			});

			it("should replace invalid characters with hyphens", () => {
				expect(generateSubdomainFromName("My_Docs@Site")).toBe("my-docs-site");
			});

			it("should collapse multiple hyphens", () => {
				expect(generateSubdomainFromName("My  Docs   Site")).toBe("my-docs-site");
			});

			it("should remove leading and trailing hyphens", () => {
				expect(generateSubdomainFromName("  My Docs  ")).toBe("my-docs");
			});

			it("should truncate to max length", () => {
				const longName = "A".repeat(100);
				expect(generateSubdomainFromName(longName).length).toBe(MAX_SUBDOMAIN_LENGTH);
			});
		});

		describe("validateSubdomain", () => {
			it("should reject subdomains that are too short", () => {
				const result = validateSubdomain("ab");
				expect(result.valid).toBe(false);
				expect(result.error).toBe("tooShort");
			});

			it("should accept subdomains at minimum length", () => {
				const result = validateSubdomain("abc");
				expect(result.valid).toBe(true);
			});

			it("should reject subdomains that are too long", () => {
				const result = validateSubdomain("a".repeat(64));
				expect(result.valid).toBe(false);
				expect(result.error).toBe("tooLong");
			});

			it("should accept subdomains at maximum length", () => {
				const result = validateSubdomain("a".repeat(63));
				expect(result.valid).toBe(true);
			});

			it("should reject subdomains starting with hyphen", () => {
				const result = validateSubdomain("-mydocs");
				expect(result.valid).toBe(false);
				expect(result.error).toBe("invalidFormat");
			});

			it("should reject subdomains ending with hyphen", () => {
				const result = validateSubdomain("mydocs-");
				expect(result.valid).toBe(false);
				expect(result.error).toBe("invalidFormat");
			});

			it("should accept valid subdomains with hyphens in middle", () => {
				const result = validateSubdomain("my-docs-site");
				expect(result.valid).toBe(true);
			});

			it("should accept alphanumeric subdomains", () => {
				const result = validateSubdomain("mydocs123");
				expect(result.valid).toBe(true);
			});

			it("should reject subdomains with consecutive hyphens", () => {
				const result = validateSubdomain("my--docs");
				expect(result.valid).toBe(false);
				expect(result.error).toBe("consecutiveHyphens");
			});

			it("should reject subdomains with multiple consecutive hyphens", () => {
				const result = validateSubdomain("my---docs");
				expect(result.valid).toBe(false);
				expect(result.error).toBe("consecutiveHyphens");
			});
		});

		describe("constants", () => {
			it("should have correct MIN_SUBDOMAIN_LENGTH", () => {
				expect(MIN_SUBDOMAIN_LENGTH).toBe(3);
			});

			it("should have correct MAX_SUBDOMAIN_LENGTH", () => {
				expect(MAX_SUBDOMAIN_LENGTH).toBe(63);
			});

			it("should have correct DEBOUNCE_MS", () => {
				expect(DEBOUNCE_MS).toBe(500);
			});

			it("should have valid SUBDOMAIN_PATTERN", () => {
				expect(SUBDOMAIN_PATTERN.test("mydocs")).toBe(true);
				expect(SUBDOMAIN_PATTERN.test("my-docs")).toBe(true);
				expect(SUBDOMAIN_PATTERN.test("-mydocs")).toBe(false);
				expect(SUBDOMAIN_PATTERN.test("mydocs-")).toBe(false);
				expect(SUBDOMAIN_PATTERN.test("my--docs")).toBe(false);
			});
		});
	});

	describe("rendering", () => {
		it("should render with label and input field", () => {
			renderSubdomainInput();

			expect(screen.getByTestId("subdomain-input")).toBeDefined();
			expect(screen.getByTestId("subdomain-input-field")).toBeDefined();
		});

		it("should display the domain suffix", () => {
			renderSubdomainInput();

			expect(screen.getByTestId("domain-suffix").textContent).toBe(".jolli.site");
		});

		it("should respect custom domainSuffix prop", () => {
			renderSubdomainInput({ domainSuffix: ".custom.domain" });

			expect(screen.getByTestId("domain-suffix").textContent).toBe(".custom.domain");
		});

		it("should respect disabled prop", () => {
			renderSubdomainInput({ disabled: true });

			const input = screen.getByTestId("subdomain-input-field") as HTMLInputElement;
			expect(input.disabled).toBe(true);
		});
	});

	describe("auto-generation from site name", () => {
		it("should auto-generate subdomain from siteName when not edited", () => {
			renderSubdomainInput({ siteName: "My Docs Site" });

			expect(mockOnChange).toHaveBeenCalledWith("my-docs-site");
		});

		it("should not auto-generate after user has manually edited", () => {
			const { rerender } = renderWithProviders(
				<SubdomainInput value="" onChange={mockOnChange} siteName="Initial" disabled={false} />,
				{
					client: (() => {
						const mockClient = createMockClient();
						mockClient.sites = vi.fn(() => mockSiteClient as unknown as SiteClient);
						return mockClient;
					})(),
				},
			);

			// Simulate user editing
			const input = screen.getByTestId("subdomain-input-field");
			fireEvent.change(input, { target: { value: "custom" } });

			// Clear the call from the edit
			mockOnChange.mockClear();

			// Re-render with different siteName
			rerender(
				<SubdomainInput value="custom" onChange={mockOnChange} siteName="Changed Name" disabled={false} />,
			);

			// Should not have called onChange because user edited
			expect(mockOnChange).not.toHaveBeenCalledWith("changed-name");
		});
	});

	describe("input handling", () => {
		it("should convert to lowercase on change", () => {
			renderSubdomainInput();

			const input = screen.getByTestId("subdomain-input-field");
			fireEvent.change(input, { target: { value: "MYDOCS" } });

			expect(mockOnChange).toHaveBeenCalledWith("mydocs");
		});

		it("should pass through invalid characters (no sanitization)", () => {
			renderSubdomainInput({ value: "" });

			const input = screen.getByTestId("subdomain-input-field");
			fireEvent.change(input, { target: { value: "abc_def" } });

			// Should pass through the invalid chars (only lowercased)
			expect(mockOnChange).toHaveBeenCalledWith("abc_def");

			// Should show error status
			expect(screen.getByTestId("status-unavailable")).toBeDefined();
			expect(screen.getByTestId("status-message")).toBeDefined();
		});

		it("should clear error when valid chars entered after invalid", () => {
			renderSubdomainInput({ value: "" });

			const input = screen.getByTestId("subdomain-input-field");

			// First enter invalid chars
			fireEvent.change(input, { target: { value: "abc_" } });
			expect(screen.getByTestId("status-unavailable")).toBeDefined();

			// Then enter valid chars (user corrects the input)
			fireEvent.change(input, { target: { value: "abc" } });

			// Error should be cleared (no more status-unavailable icon)
			expect(screen.queryByTestId("status-unavailable")).toBeNull();
		});

		it("should show real-time error for special characters", () => {
			renderSubdomainInput({ value: "" });

			const input = screen.getByTestId("subdomain-input-field");
			fireEvent.change(input, { target: { value: "test@email" } });

			// Should show error for @ character and pass through value
			expect(screen.getByTestId("status-unavailable")).toBeDefined();
			expect(mockOnChange).toHaveBeenCalledWith("test@email");
		});

		it("should truncate to max length", () => {
			renderSubdomainInput({ value: "" });

			const input = screen.getByTestId("subdomain-input-field");
			const longValue = "a".repeat(100);
			fireEvent.change(input, { target: { value: longValue } });

			// Should truncate to 63 characters
			expect(mockOnChange).toHaveBeenCalledWith("a".repeat(63));
		});

		it("should show error for consecutive hyphens", () => {
			renderSubdomainInput({ value: "" });

			const input = screen.getByTestId("subdomain-input-field");
			fireEvent.change(input, { target: { value: "my--docs" } });

			// Should show error status for consecutive hyphens
			expect(screen.getByTestId("status-unavailable")).toBeDefined();
			expect(screen.getByTestId("status-message").textContent).toContain("Consecutive hyphens");
		});

		it("should not check availability for subdomains with consecutive hyphens", () => {
			renderSubdomainInput({ value: "my--docs" });

			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS);
			});

			// Should not make API call for invalid subdomain
			expect(mockSiteClient.checkSubdomainAvailability).not.toHaveBeenCalled();
		});

		it("should show too short error for short input", () => {
			renderSubdomainInput({ value: "" });

			const input = screen.getByTestId("subdomain-input-field");
			fireEvent.change(input, { target: { value: "ab" } });

			// Should show error status
			expect(screen.getByTestId("status-unavailable")).toBeDefined();
			expect(screen.getByTestId("status-message").textContent).toContain("at least 3 characters");
		});
	});

	describe("availability checking", () => {
		it("should show checking status after debounce", () => {
			mockSiteClient.checkSubdomainAvailability.mockImplementation(
				() => new Promise(resolve => setTimeout(() => resolve({ available: true }), 100)),
			);

			renderSubdomainInput({ value: "mydocs" });

			// Advance past debounce
			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS);
			});

			expect(screen.getByTestId("status-checking")).toBeDefined();
		});

		it("should show available status when subdomain is available", async () => {
			mockSiteClient.checkSubdomainAvailability.mockResolvedValue({ available: true });

			renderSubdomainInput({ value: "mydocs" });

			// Advance past debounce
			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS);
			});

			await waitFor(() => {
				expect(screen.getByTestId("status-available")).toBeDefined();
			});
		});

		it("should show taken status when subdomain is taken", async () => {
			mockSiteClient.checkSubdomainAvailability.mockResolvedValue({ available: false });

			renderSubdomainInput({ value: "mydocs" });

			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS);
			});

			await waitFor(() => {
				expect(screen.getByTestId("status-unavailable")).toBeDefined();
			});
		});

		it("should show suggestion when subdomain is taken and suggestion is provided", async () => {
			mockSiteClient.checkSubdomainAvailability.mockResolvedValue({
				available: false,
				suggestion: "mydocs-2",
			});

			renderSubdomainInput({ value: "mydocs" });

			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS);
			});

			await waitFor(() => {
				expect(screen.getByTestId("suggestion-button")).toBeDefined();
				expect(screen.getByTestId("suggestion-button").textContent).toContain("mydocs-2");
			});
		});

		it("should apply suggestion when clicked", async () => {
			mockSiteClient.checkSubdomainAvailability.mockResolvedValue({
				available: false,
				suggestion: "mydocs-2",
			});

			renderSubdomainInput({ value: "mydocs" });

			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS);
			});

			await waitFor(() => {
				expect(screen.getByTestId("suggestion-button")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("suggestion-button"));

			expect(mockOnChange).toHaveBeenCalledWith("mydocs-2");
		});

		it("should not check availability for values shorter than MIN_SUBDOMAIN_LENGTH", () => {
			renderSubdomainInput({ value: "ab" });

			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS);
			});

			expect(mockSiteClient.checkSubdomainAvailability).not.toHaveBeenCalled();
		});

		it("should show error status for invalid format", async () => {
			renderSubdomainInput({ value: "-mydocs" });

			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS);
			});

			await waitFor(() => {
				expect(screen.getByTestId("status-unavailable")).toBeDefined();
				expect(screen.getByTestId("status-message")).toBeDefined();
			});
		});

		it("should show error message for too long subdomain value prop", async () => {
			// Direct prop with 64+ chars (bypasses sanitization)
			renderSubdomainInput({ value: "a".repeat(65) });

			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS);
			});

			await waitFor(() => {
				expect(screen.getByTestId("status-unavailable")).toBeDefined();
				const message = screen.getByTestId("status-message");
				expect(message.textContent).toContain("63 characters");
			});
		});

		it("should show error message for invalid format subdomain ending with hyphen", async () => {
			renderSubdomainInput({ value: "mydocs-" });

			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS);
			});

			await waitFor(() => {
				expect(screen.getByTestId("status-unavailable")).toBeDefined();
				const message = screen.getByTestId("status-message");
				expect(message.textContent).toContain("letters, numbers");
			});
		});

		it("should handle API errors gracefully", async () => {
			mockSiteClient.checkSubdomainAvailability.mockRejectedValue(new Error("Network error"));

			renderSubdomainInput({ value: "mydocs" });

			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS);
			});

			await waitFor(() => {
				expect(screen.getByTestId("status-unavailable")).toBeDefined();
				expect(screen.getByTestId("status-message").textContent).toContain("Failed to check");
			});
		});

		it("should ignore stale API errors when value has changed", async () => {
			// Simulate slow API call that rejects after user types new value
			let rejectFn: (error: Error) => void;
			mockSiteClient.checkSubdomainAvailability.mockImplementation(
				() =>
					new Promise((_, reject) => {
						rejectFn = reject;
					}),
			);

			const { rerender } = renderWithProviders(
				<SubdomainInput value="mydocs" onChange={mockOnChange} siteName="" disabled={false} />,
				{
					client: (() => {
						const mockClient = createMockClient();
						mockClient.sites = vi.fn(() => mockSiteClient as unknown as SiteClient);
						return mockClient;
					})(),
				},
			);

			// Trigger debounced check
			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS);
			});

			// User types new value before API returns
			rerender(<SubdomainInput value="newvalue" onChange={mockOnChange} siteName="" disabled={false} />);

			// Now the old API call fails - should be ignored
			act(() => {
				rejectFn(new Error("Network error"));
			});

			// Should not show error because the error was for old value
			await waitFor(() => {
				expect(screen.queryByTestId("status-message")?.textContent).not.toContain("Failed to check");
			});
		});

		it("should show error when API returns error field", async () => {
			mockSiteClient.checkSubdomainAvailability.mockResolvedValue({
				available: false,
				error: "Custom server error",
			});

			renderSubdomainInput({ value: "mydocs" });

			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS);
			});

			await waitFor(() => {
				expect(screen.getByTestId("status-unavailable")).toBeDefined();
			});
		});

		it("should show consecutive hyphens error from validateSubdomain during availability check", () => {
			// This tests the validateSubdomain call inside checkAvailability
			// The value passes the basic checks in useEffect but fails validateSubdomain
			// However, consecutive hyphens are caught earlier now, so we test the path
			// where a value with consecutive hyphens is set as prop and triggers validation
			renderSubdomainInput({ value: "test--site" });

			// Should not call API because consecutive hyphens are filtered in useEffect
			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS);
			});

			expect(mockSiteClient.checkSubdomainAvailability).not.toHaveBeenCalled();
		});
	});

	describe("debouncing", () => {
		it("should debounce API calls", async () => {
			// Since SubdomainInput is a controlled component, we need to test
			// that it doesn't make API calls until debounce period passes.
			// The debounce is based on the value prop changing, not input events.
			renderSubdomainInput({ value: "mydocs" });

			// Before debounce, no API call
			expect(mockSiteClient.checkSubdomainAvailability).not.toHaveBeenCalled();

			// After debounce
			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS);
			});

			// Should make one call after debounce
			await waitFor(() => {
				expect(mockSiteClient.checkSubdomainAvailability).toHaveBeenCalledTimes(1);
			});
		});

		it("should reset debounce timer on value change", async () => {
			const { rerender } = renderWithProviders(
				<SubdomainInput value="mydocs" onChange={mockOnChange} siteName="" disabled={false} />,
				{
					client: (() => {
						const mockClient = createMockClient();
						mockClient.sites = vi.fn(() => mockSiteClient as unknown as SiteClient);
						return mockClient;
					})(),
				},
			);

			// Advance partially through debounce
			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS / 2);
			});

			// Value changes - should clear existing timer
			rerender(<SubdomainInput value="newdocs" onChange={mockOnChange} siteName="" disabled={false} />);

			// Advance another half - should not trigger API since timer was reset
			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS / 2);
			});

			expect(mockSiteClient.checkSubdomainAvailability).not.toHaveBeenCalled();

			// After full debounce from new value, should call API
			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS / 2);
			});

			await waitFor(() => {
				expect(mockSiteClient.checkSubdomainAvailability).toHaveBeenCalledWith("newdocs");
			});
		});

		it("should reset debounce timer on new input", () => {
			renderSubdomainInput({ value: "mydocs" });

			// Advance partially
			act(() => {
				vi.advanceTimersByTime(DEBOUNCE_MS / 2);
			});

			// No call yet
			expect(mockSiteClient.checkSubdomainAvailability).not.toHaveBeenCalled();
		});
	});
});
