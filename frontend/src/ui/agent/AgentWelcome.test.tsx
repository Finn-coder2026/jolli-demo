import { AgentWelcome } from "./AgentWelcome";
import { render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("AgentWelcome", () => {
	const onSuggestionClick = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render welcome screen with title", () => {
		render(<AgentWelcome onSuggestionClick={onSuggestionClick} />);

		expect(screen.getByTestId("agent-welcome")).toBeDefined();
		const heading = screen.getByTestId("agent-welcome").querySelector("h1");
		expect(heading?.textContent).toBe("What can I help with?");
	});

	it("should render all four suggestion cards", () => {
		render(<AgentWelcome onSuggestionClick={onSuggestionClick} />);

		expect(screen.getByTestId("suggestion-suggestionDraft")).toBeDefined();
		expect(screen.getByTestId("suggestion-suggestionSearch")).toBeDefined();
		expect(screen.getByTestId("suggestion-suggestionSummarize")).toBeDefined();
		expect(screen.getByTestId("suggestion-suggestionAnswer")).toBeDefined();
	});

	it("should show suggestion titles and descriptions", () => {
		render(<AgentWelcome onSuggestionClick={onSuggestionClick} />);

		const draftCard = screen.getByTestId("suggestion-suggestionDraft");
		expect(draftCard.textContent).toContain("Draft an article");
		expect(draftCard.textContent).toContain("Write documentation from scratch");
	});

	it("should call onSuggestionClick with prompt when card is clicked", () => {
		render(<AgentWelcome onSuggestionClick={onSuggestionClick} />);

		const draftCard = screen.getByTestId("suggestion-suggestionDraft");
		draftCard.click();

		expect(onSuggestionClick).toHaveBeenCalledWith("I'd like to draft a new article");
	});

	it("should call onSuggestionClick with search prompt", () => {
		render(<AgentWelcome onSuggestionClick={onSuggestionClick} />);

		const searchCard = screen.getByTestId("suggestion-suggestionSearch");
		searchCard.click();

		expect(onSuggestionClick).toHaveBeenCalledWith("Search my knowledge base for ");
	});

	it("should call onSuggestionClick with summarize prompt", () => {
		render(<AgentWelcome onSuggestionClick={onSuggestionClick} />);

		const summarizeCard = screen.getByTestId("suggestion-suggestionSummarize");
		summarizeCard.click();

		expect(onSuggestionClick).toHaveBeenCalledWith("Summarize the key points of ");
	});

	it("should call onSuggestionClick with answer prompt", () => {
		render(<AgentWelcome onSuggestionClick={onSuggestionClick} />);

		const answerCard = screen.getByTestId("suggestion-suggestionAnswer");
		answerCard.click();

		expect(onSuggestionClick).toHaveBeenCalledWith("Answer this question: ");
	});
});
