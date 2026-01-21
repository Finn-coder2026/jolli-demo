import { createMockIntlayerValue, renderWithProviders } from "../../test/TestUtils";
import { DraftGenerator } from "./DraftGenerator";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		FileEdit: () => <div data-testid="file-edit-icon" />,
	};
});

const mockDevToolsClient = {
	getDevToolsInfo: vi.fn().mockResolvedValue({
		enabled: true,
		githubAppCreatorEnabled: true,
		jobTesterEnabled: true,
		dataClearerEnabled: true,
		draftGeneratorEnabled: true,
	}),
	completeGitHubAppSetup: vi.fn(),
	triggerDemoJob: vi.fn(),
	clearData: vi.fn(),
	generateDraftWithEdits: vi.fn(),
};

const mockClient = {
	devTools: () => mockDevToolsClient,
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

describe("DraftGenerator", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mockDevToolsClient.getDevToolsInfo.mockResolvedValue({
			enabled: true,
			githubAppCreatorEnabled: true,
			jobTesterEnabled: true,
			dataClearerEnabled: true,
			draftGeneratorEnabled: true,
		});
		mockDevToolsClient.generateDraftWithEdits.mockResolvedValue({
			success: true,
			draftId: 123,
			message: createMockIntlayerValue("Draft created with 2 section edit suggestions"),
		});
	});

	function renderComponent() {
		return renderWithProviders(<DraftGenerator />, { initialPath: createMockIntlayerValue("/devtools") });
	}

	it("should render draft generator with all fields", () => {
		renderComponent();

		expect(screen.getByText("Draft Generator")).toBeDefined();
		expect(
			screen.getByText(
				/Generate draft with mock section edit suggestions for testing section changes on existing articles/i,
			),
		).toBeDefined();

		// Check Article JRN input
		expect(screen.getByLabelText("Article JRN")).toBeDefined();

		// Check number of edits input
		expect(screen.getByText("Number of Section Edits")).toBeDefined();
		expect(screen.getByText("Generate 1-5 mock section edit suggestions")).toBeDefined();

		// Check generate button
		expect(screen.getByRole("button", { name: /Generate Draft/i })).toBeDefined();
	});

	it("should show docJrn input by default", () => {
		renderComponent();

		const docJrnInput = screen.getByLabelText("Article JRN");
		expect(docJrnInput).toBeDefined();
		expect(docJrnInput.getAttribute("placeholder")).toBe("jrn:jolli:doc:article-name");
		expect(docJrnInput.getAttribute("type")).toBe("text");
	});

	it("should show error when docJrn is empty", async () => {
		renderComponent();

		const generateButton = screen.getByRole("button", { name: /Generate Draft/i });
		fireEvent.click(generateButton);

		await waitFor(() => {
			expect(screen.getByText("Article JRN is required")).toBeDefined();
		});
		expect(mockDevToolsClient.generateDraftWithEdits).not.toHaveBeenCalled();
	});

	it("should generate draft with docJrn successfully", async () => {
		mockDevToolsClient.generateDraftWithEdits.mockResolvedValue({
			success: true,
			draftId: 789,
			message: createMockIntlayerValue("Draft created with 3 section edit suggestions"),
		});

		renderComponent();

		const docJrnInput = screen.getByLabelText("Article JRN");
		fireEvent.input(docJrnInput, { target: { value: "jrn:jolli:doc:test-article" } });

		const numEditsInput = screen.getByLabelText("Number of Section Edits");
		fireEvent.input(numEditsInput, { target: { value: "3" } });

		const generateButton = screen.getByRole("button", { name: /Generate Draft/i });
		fireEvent.click(generateButton);

		await waitFor(() => {
			expect(mockDevToolsClient.generateDraftWithEdits).toHaveBeenCalledWith({
				docJrn: "jrn:jolli:doc:test-article",
				numEdits: 3,
			});
		});
	});

	it("should show success message with link after generating draft", async () => {
		mockDevToolsClient.generateDraftWithEdits.mockResolvedValue({
			success: true,
			draftId: 456,
			message: createMockIntlayerValue("Draft created with 2 section edit suggestions"),
		});

		renderComponent();

		const docJrnInput = screen.getByLabelText("Article JRN");
		fireEvent.input(docJrnInput, { target: { value: "jrn:jolli:doc:test-article" } });

		const generateButton = screen.getByRole("button", { name: /Generate Draft/i });
		fireEvent.click(generateButton);

		await waitFor(() => {
			expect(screen.getByText("Draft created with 2 section edit suggestions")).toBeDefined();
			const viewLink = screen.getByText("View Draft");
			expect(viewLink).toBeDefined();
			expect(viewLink.getAttribute("href")).toBe("/article-draft/456");
		});
	});

	it("should show error message when generation fails", async () => {
		mockDevToolsClient.generateDraftWithEdits.mockRejectedValue(new Error("Failed to generate draft"));

		renderComponent();

		const docJrnInput = screen.getByLabelText("Article JRN");
		fireEvent.input(docJrnInput, { target: { value: "jrn:jolli:doc:test-article" } });

		const generateButton = screen.getByRole("button", { name: /Generate Draft/i });
		fireEvent.click(generateButton);

		await waitFor(() => {
			expect(screen.getByText("Failed to generate draft")).toBeDefined();
		});
	});

	it("should show generic error when error is not an Error object", async () => {
		mockDevToolsClient.generateDraftWithEdits.mockRejectedValue("Some error");

		renderComponent();

		const docJrnInput = screen.getByLabelText("Article JRN");
		fireEvent.input(docJrnInput, { target: { value: "jrn:jolli:doc:test-article" } });

		const generateButton = screen.getByRole("button", { name: /Generate Draft/i });
		fireEvent.click(generateButton);

		await waitFor(() => {
			expect(screen.getByText("Failed to generate draft")).toBeDefined();
		});
	});

	it("should disable button and show generating text while generating", async () => {
		mockDevToolsClient.generateDraftWithEdits.mockImplementation(
			() =>
				new Promise(resolve =>
					setTimeout(
						() =>
							resolve({
								success: true,
								draftId: 456,
								message: createMockIntlayerValue("Draft created"),
							}),
						100,
					),
				),
		);

		renderComponent();

		const docJrnInput = screen.getByLabelText("Article JRN");
		fireEvent.input(docJrnInput, { target: { value: "jrn:jolli:doc:test-article" } });

		const generateButton = screen.getByRole("button", { name: /Generate Draft/i });

		expect(generateButton.hasAttribute("disabled")).toBe(false);

		fireEvent.click(generateButton);

		await waitFor(() => {
			expect(generateButton.hasAttribute("disabled")).toBe(true);
			expect(generateButton.textContent).toContain("Generating...");
		});
	});

	it("should reset form after successful generation", async () => {
		mockDevToolsClient.generateDraftWithEdits.mockResolvedValue({
			success: true,
			draftId: 456,
			message: createMockIntlayerValue("Draft created"),
		});

		renderComponent();

		const docJrnInput = screen.getByLabelText("Article JRN") as HTMLInputElement;
		fireEvent.input(docJrnInput, { target: { value: "jrn:jolli:doc:test-article" } });

		const generateButton = screen.getByRole("button", { name: /Generate Draft/i });
		fireEvent.click(generateButton);

		await waitFor(() => {
			expect(docJrnInput.value).toBe("");
		});
	});

	it("should display tip message", () => {
		renderComponent();

		expect(
			screen.getByText(
				/Generated drafts will have highlighted sections that you can click to view and apply mock edit suggestions/i,
			),
		).toBeDefined();
	});
});
