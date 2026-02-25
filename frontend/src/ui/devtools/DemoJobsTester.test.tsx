import { ClientProvider } from "../../contexts/ClientContext";
import { DemoJobsTester } from "./DemoJobsTester";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		Play: () => <div data-testid="play-icon" />,
	};
});

const mockIntegrationsClient = {
	listIntegrations: vi.fn(),
};

const mockDevToolsClient = {
	getDevToolsInfo: vi.fn(),
	completeGitHubAppSetup: vi.fn(),
	triggerDemoJob: vi.fn(),
};

const mockClient = {
	devTools: () => mockDevToolsClient,
	integrations: () => mockIntegrationsClient,
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

describe("DemoJobsTester", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDevToolsClient.triggerDemoJob.mockResolvedValue({
			jobId: "test-job-id",
			name: "demo:test",
			message: "Job queued successfully",
		});
	});

	function renderComponent(): ReturnType<typeof render> {
		return render(
			<ClientProvider>
				<DemoJobsTester />
			</ClientProvider>,
		);
	}

	it("should render demo jobs tester with all demo jobs", () => {
		renderComponent();

		expect(screen.getByText("Demo Jobs")).toBeDefined();
		expect(screen.getByText("Test dashboard widgets with demo jobs that update stats in real-time")).toBeDefined();

		// Check all demo jobs are present
		expect(screen.getByText("Quick Stats")).toBeDefined();
		expect(screen.getByText("Simple counter demo (5-10 seconds)")).toBeDefined();

		expect(screen.getByText("Multi-Stat Progress")).toBeDefined();
		expect(screen.getByText("Multiple stats updating (15-20 seconds)")).toBeDefined();

		expect(screen.getByText("Articles Link")).toBeDefined();
		expect(screen.getByText("Demo with link to Articles page (10-15 seconds)")).toBeDefined();

		expect(screen.getByText("Slow Processing")).toBeDefined();
		expect(screen.getByText("Long-running job with phases (30-40 seconds)")).toBeDefined();

		expect(screen.getByText("Doc2Docusaurus")).toBeDefined();
		expect(screen.getByText("Sync documents from database to Docusaurus format")).toBeDefined();

		expect(screen.getByText("Run JolliScript")).toBeDefined();
		expect(screen.getByText("Execute JolliScript workflow on stored DocDao markdown content")).toBeDefined();

		expect(screen.getByText("Migrate JRNs")).toBeDefined();
		expect(
			screen.getByText("Migrate old path-based JRN format to new structured JRN format in article content"),
		).toBeDefined();
	});

	it("should have run demo buttons for each job", () => {
		renderComponent();

		const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
		expect(runButtons).toHaveLength(9);
	});

	it("should trigger demo job when button is clicked", async () => {
		renderComponent();

		const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
		fireEvent.click(runButtons[0]); // Click first button (Quick Stats)

		await waitFor(() => {
			expect(mockDevToolsClient.triggerDemoJob).toHaveBeenCalledWith("demo:quick-stats");
		});
	});

	it("should disable button while job is running", async () => {
		vi.useFakeTimers();

		renderComponent();

		const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
		const firstButton = runButtons[0];

		// Button should be enabled initially
		expect(firstButton.hasAttribute("disabled")).toBe(false);

		fireEvent.click(firstButton);

		// Button should be disabled after click
		await waitFor(() => {
			expect(firstButton.hasAttribute("disabled")).toBe(true);
			expect(firstButton.textContent).toContain("Running...");
		});

		// Fast-forward time past the 2 second timeout
		vi.advanceTimersByTime(2000);

		// Button should be re-enabled
		await waitFor(() => {
			expect(firstButton.hasAttribute("disabled")).toBe(false);
			expect(firstButton.textContent).toContain("Run Demo");
		});

		vi.useRealTimers();
	});

	it("should show error message when trigger fails", async () => {
		mockDevToolsClient.triggerDemoJob.mockRejectedValue(new Error("Failed to queue job"));

		renderComponent();

		const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
		fireEvent.click(runButtons[0]);

		await waitFor(() => {
			expect(screen.getByText("Failed to queue job")).toBeDefined();
		});
	});

	it("should show generic error when error is not an Error object", async () => {
		mockDevToolsClient.triggerDemoJob.mockRejectedValue("Some error");

		renderComponent();

		const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
		fireEvent.click(runButtons[0]);

		await waitFor(() => {
			expect(screen.getByText("Failed to trigger demo job")).toBeDefined();
		});
	});

	it("should display tip about navigating to Dashboard", () => {
		renderComponent();

		expect(screen.getByText(/Navigate to the Dashboard page/i)).toBeDefined();
	});

	it("should trigger correct job for each button", async () => {
		renderComponent();

		const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });

		// Click each button and verify correct job name is passed
		fireEvent.click(runButtons[0]);
		await waitFor(() => {
			expect(mockDevToolsClient.triggerDemoJob).toHaveBeenCalledWith("demo:quick-stats");
		});

		fireEvent.click(runButtons[1]);
		await waitFor(() => {
			expect(mockDevToolsClient.triggerDemoJob).toHaveBeenCalledWith("demo:multi-stat-progress");
		});

		fireEvent.click(runButtons[2]);
		await waitFor(() => {
			expect(mockDevToolsClient.triggerDemoJob).toHaveBeenCalledWith("demo:articles-link");
		});

		fireEvent.click(runButtons[3]);
		await waitFor(() => {
			expect(mockDevToolsClient.triggerDemoJob).toHaveBeenCalledWith("demo:slow-processing");
		});

		fireEvent.click(runButtons[5]);
		await waitFor(() => {
			expect(mockDevToolsClient.triggerDemoJob).toHaveBeenCalledWith("demo:doc2docusaurus", {
				jrnPrefix: "/home/space-1",
			});
		});

		expect(mockDevToolsClient.triggerDemoJob).toHaveBeenCalledTimes(5);
	});

	describe("demo:run-end2end-flow job", () => {
		beforeEach(() => {
			mockIntegrationsClient.listIntegrations.mockResolvedValue([
				{ id: 1, name: "Test Repo 1", type: "github", status: "active" },
				{ id: 2, name: "Test Repo 2", type: "github", status: "active" },
			]);
		});

		it("should show integration selector for run-end2end-flow job", async () => {
			renderComponent();

			// Wait for integrations to load
			await waitFor(() => {
				expect(mockIntegrationsClient.listIntegrations).toHaveBeenCalled();
			});

			// Find the run-end2end-flow section
			expect(screen.getByText("Create Architecture Article")).toBeDefined();
			expect(screen.getByText("Sample job that prints hello world")).toBeDefined();

			// Should show integration selector
			expect(screen.getByLabelText("Integration")).toBeDefined();
			const select = screen.getByLabelText("Integration") as HTMLSelectElement;

			// Should have integration options
			expect(select.options).toHaveLength(2);
			expect(select.options[0].textContent).toBe("Test Repo 1");
			expect(select.options[1].textContent).toBe("Test Repo 2");
		});

		it("should auto-select first integration and enable button when integrations load", async () => {
			renderComponent();

			// Wait for integrations to load
			await waitFor(() => {
				expect(mockIntegrationsClient.listIntegrations).toHaveBeenCalled();
			});

			const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
			const endToEndButton = runButtons[4]; // 5th button is run-end2end-flow

			// Should be enabled because first integration is auto-selected
			expect(endToEndButton.hasAttribute("disabled")).toBe(false);

			// Check that first integration is selected
			const select = screen.getByLabelText("Integration") as HTMLSelectElement;
			expect(select.value).toBe("1");
		});

		it("should trigger job with integrationId when button is clicked", async () => {
			renderComponent();

			// Wait for integrations to load
			await waitFor(() => {
				expect(mockIntegrationsClient.listIntegrations).toHaveBeenCalled();
			});

			const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
			const endToEndButton = runButtons[4];

			// Button should be enabled (first integration is auto-selected)
			expect(endToEndButton.hasAttribute("disabled")).toBe(false);

			// Click the button
			fireEvent.click(endToEndButton);

			// Should trigger with integrationId and jrnPrefix parameters for first integration
			await waitFor(() => {
				expect(mockDevToolsClient.triggerDemoJob).toHaveBeenCalledWith("demo:run-end2end-flow", {
					integrationId: 1,
					jrnPrefix: "/home/space-1",
				});
			});
		});

		it("should trigger job without jrnPrefix when jrnPrefix is empty", async () => {
			renderComponent();

			// Wait for integrations to load
			await waitFor(() => {
				expect(mockIntegrationsClient.listIntegrations).toHaveBeenCalled();
			});

			// Clear the jrnPrefix input
			const arnInput = screen.getByLabelText("JRN Prefix (Run)") as HTMLInputElement;
			fireEvent.change(arnInput, { target: { value: "" } });

			const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
			const endToEndButton = runButtons[4];

			// Click the button
			fireEvent.click(endToEndButton);

			// Should trigger with only integrationId parameter (no jrnPrefix)
			await waitFor(() => {
				expect(mockDevToolsClient.triggerDemoJob).toHaveBeenCalledWith("demo:run-end2end-flow", {
					integrationId: 1,
				});
			});
		});

		it("should handle integration selection change including empty value", async () => {
			renderComponent();

			// Wait for integrations to load
			await waitFor(() => {
				expect(mockIntegrationsClient.listIntegrations).toHaveBeenCalled();
			});

			const select = screen.getByLabelText("Integration") as HTMLSelectElement;

			// Initially auto-selected to first integration
			expect(select.value).toBe("1");

			// Change to second integration - this covers the truthy branch
			fireEvent.change(select, { target: { value: "2" } });
			expect(select.value).toBe("2");

			// The key test: trigger onChange with empty value to cover the `: undefined` branch
			// This simulates a scenario where the value becomes empty (e.g., programmatic reset)
			fireEvent.change(select, { target: { value: "" } });

			// The onChange handler will have executed with empty value,
			// calling setSelectedIntegrationId(undefined) and covering line 185
		});

		it("should show no integrations message when there are none and handle empty value change", async () => {
			mockIntegrationsClient.listIntegrations.mockResolvedValue([]);

			renderComponent();

			// Wait for integrations to load
			await waitFor(() => {
				expect(mockIntegrationsClient.listIntegrations).toHaveBeenCalled();
			});

			const select = screen.getByLabelText("Integration") as HTMLSelectElement;

			// Should show no integrations message
			expect(select.options).toHaveLength(1);
			expect(select.options[0].textContent).toBe("No active integrations found");
			expect(select.value).toBe("");

			// Now trigger onChange with empty value to ensure we cover the `: undefined` branch
			// When there are no integrations, the select has an option with empty value
			// Triggering onChange with empty value will execute the ternary's false branch
			const changeEvent = new Event("change", { bubbles: true });
			Object.defineProperty(changeEvent, "target", {
				value: { value: "" },
				writable: false,
			});
			select.dispatchEvent(changeEvent);

			// Button should be disabled
			const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
			const endToEndButton = runButtons[4];
			expect(endToEndButton.hasAttribute("disabled")).toBe(true);
		});
	});

	describe("demo:doc2docusaurus job", () => {
		it("should show jrnPrefix input for doc2docusaurus job", () => {
			renderComponent();

			// Find the doc2docusaurus section
			expect(screen.getByText("Doc2Docusaurus")).toBeDefined();
			expect(screen.getByText("Sync documents from database to Docusaurus format")).toBeDefined();

			// Should show jrnPrefix input
			expect(screen.getByLabelText("JRN Prefix")).toBeDefined();
			const input = screen.getByLabelText("JRN Prefix") as HTMLInputElement;

			// Should have default value
			expect(input.value).toBe("/home/space-1");
		});

		it("should trigger job with jrnPrefix when button is clicked", async () => {
			renderComponent();

			const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
			const doc2DocusaurusButton = runButtons[5]; // 6th button is doc2docusaurus

			// Button should be enabled
			expect(doc2DocusaurusButton.hasAttribute("disabled")).toBe(false);

			// Click the button
			fireEvent.click(doc2DocusaurusButton);

			// Should trigger with default jrnPrefix parameter
			await waitFor(() => {
				expect(mockDevToolsClient.triggerDemoJob).toHaveBeenCalledWith("demo:doc2docusaurus", {
					jrnPrefix: "/home/space-1",
				});
			});
		});

		it("should allow changing jrnPrefix value", async () => {
			renderComponent();

			const input = screen.getByLabelText("JRN Prefix") as HTMLInputElement;
			const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
			const doc2DocusaurusButton = runButtons[5];

			// Change the jrnPrefix value
			fireEvent.change(input, { target: { value: "/custom/path" } });
			expect(input.value).toBe("/custom/path");

			// Click the button
			fireEvent.click(doc2DocusaurusButton);

			// Should trigger with custom jrnPrefix
			await waitFor(() => {
				expect(mockDevToolsClient.triggerDemoJob).toHaveBeenCalledWith("demo:doc2docusaurus", {
					jrnPrefix: "/custom/path",
				});
			});
		});

		it("should handle empty jrnPrefix", async () => {
			renderComponent();

			const input = screen.getByLabelText("JRN Prefix") as HTMLInputElement;
			const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
			const doc2DocusaurusButton = runButtons[5];

			// Clear the jrnPrefix value
			fireEvent.change(input, { target: { value: "" } });
			expect(input.value).toBe("");

			// Click the button
			fireEvent.click(doc2DocusaurusButton);

			// Should trigger with empty object when jrnPrefix is empty
			await waitFor(() => {
				expect(mockDevToolsClient.triggerDemoJob).toHaveBeenCalledWith("demo:doc2docusaurus", {});
			});
		});
	});

	describe("demo:run-jolliscript job", () => {
		it("should show document JRN input for run-jolliscript job", () => {
			renderComponent();

			// Find the run-jolliscript section
			expect(screen.getByText("Run JolliScript")).toBeDefined();
			expect(screen.getByText("Execute JolliScript workflow on stored DocDao markdown content")).toBeDefined();

			// Should show document JRN input
			expect(screen.getByLabelText("Document JRN")).toBeDefined();
			const input = screen.getByLabelText("Document JRN") as HTMLInputElement;

			// Should have empty value initially
			expect(input.value).toBe("");
			expect(input.placeholder).toBe("/home/space-1/example.md");
		});

		it("should disable button when docJrn is empty", () => {
			renderComponent();

			const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
			const runJolliScriptButton = runButtons[7]; // 8th button is run-jolliscript

			// Button should be disabled when docJrn is empty
			expect(runJolliScriptButton.hasAttribute("disabled")).toBe(true);
		});

		it("should enable button when docJrn is provided", async () => {
			renderComponent();

			const input = screen.getByLabelText("Document JRN") as HTMLInputElement;
			const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
			const runJolliScriptButton = runButtons[7];

			// Initially disabled
			expect(runJolliScriptButton.hasAttribute("disabled")).toBe(true);

			// Enter a docJrn
			fireEvent.change(input, { target: { value: "/home/space-1/test.md" } });

			// Button should now be enabled
			await waitFor(() => {
				expect(runJolliScriptButton.hasAttribute("disabled")).toBe(false);
			});
		});

		it("should trigger job with docJrn when button is clicked", async () => {
			renderComponent();

			const input = screen.getByLabelText("Document JRN") as HTMLInputElement;
			const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
			const runJolliScriptButton = runButtons[7];

			// Enter a docJrn
			fireEvent.change(input, { target: { value: "/home/space-1/test.md" } });

			// Click the button
			fireEvent.click(runJolliScriptButton);

			// Should trigger with docJrn parameter
			await waitFor(() => {
				expect(mockDevToolsClient.triggerDemoJob).toHaveBeenCalledWith("demo:run-jolliscript", {
					docJrn: "/home/space-1/test.md",
				});
			});
		});

		it("should trim whitespace from docJrn before submitting", async () => {
			renderComponent();

			const input = screen.getByLabelText("Document JRN") as HTMLInputElement;
			const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
			const runJolliScriptButton = runButtons[7];

			// Enter a docJrn with whitespace
			fireEvent.change(input, { target: { value: "  /home/space-1/test.md  " } });

			// Click the button
			fireEvent.click(runJolliScriptButton);

			// Should trigger with trimmed docJrn parameter
			await waitFor(() => {
				expect(mockDevToolsClient.triggerDemoJob).toHaveBeenCalledWith("demo:run-jolliscript", {
					docJrn: "/home/space-1/test.md",
				});
			});
		});

		it("should disable button when docJrn contains only whitespace", () => {
			renderComponent();

			const input = screen.getByLabelText("Document JRN") as HTMLInputElement;
			const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
			const runJolliScriptButton = runButtons[7];

			// Enter only whitespace
			fireEvent.change(input, { target: { value: "   " } });

			// Button should still be disabled (trim length check)
			expect(runJolliScriptButton.hasAttribute("disabled")).toBe(true);
		});
	});

	describe("demo:code-to-api-articles job", () => {
		beforeEach(() => {
			mockIntegrationsClient.listIntegrations.mockResolvedValue([
				{ id: 1, name: "Test Repo 1", type: "github", status: "active" },
				{ id: 2, name: "Test Repo 2", type: "github", status: "active" },
			]);
		});

		it("should trigger job with integrationId and jrnPrefix", async () => {
			renderComponent();

			// Wait for integrations to load
			await waitFor(() => {
				expect(mockIntegrationsClient.listIntegrations).toHaveBeenCalled();
			});

			// Find code-to-api-articles button (6th button)
			const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
			const codeToApiButton = runButtons[6];

			// Button should be enabled (first integration is auto-selected)
			expect(codeToApiButton.hasAttribute("disabled")).toBe(false);

			// Click the button
			fireEvent.click(codeToApiButton);

			// Should trigger with integrationId and jrnPrefix parameters
			await waitFor(() => {
				expect(mockDevToolsClient.triggerDemoJob).toHaveBeenCalledWith("demo:code-to-api-articles", {
					integrationId: 1,
					jrnPrefix: "/home/space-1",
				});
			});
		});

		it("should trigger job without jrnPrefix when jrnPrefix is empty", async () => {
			renderComponent();

			// Wait for integrations to load
			await waitFor(() => {
				expect(mockIntegrationsClient.listIntegrations).toHaveBeenCalled();
			});

			// Clear the jrnPrefix input
			const arnInput = screen.getByLabelText("JRN Prefix (Run)") as HTMLInputElement;
			fireEvent.change(arnInput, { target: { value: "" } });

			// Find code-to-api-articles button (6th button)
			const runButtons = screen.getAllByRole("button", { name: /Run Demo/i });
			const codeToApiButton = runButtons[6];

			// Click the button
			fireEvent.click(codeToApiButton);

			// Should trigger with only integrationId parameter (no jrnPrefix)
			await waitFor(() => {
				expect(mockDevToolsClient.triggerDemoJob).toHaveBeenCalledWith("demo:code-to-api-articles", {
					integrationId: 1,
				});
			});
		});
	});
});
