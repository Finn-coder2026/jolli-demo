/**
 * @vitest-environment jsdom
 */

import { convosView } from "./ConvosView";
import { render } from "@testing-library/react";
import type { Convo } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all context hooks
vi.mock("../contexts/ConvoContext", () => ({
	useConvoContext: vi.fn(),
	ConvoProvider: ({ children }: { children: React.ReactNode }) => children,
	ConvoContext: {},
}));

vi.mock("../contexts/SystemContext", () => ({
	useSystemContext: vi.fn(),
	SystemProvider: ({ children }: { children: React.ReactNode }) => children,
	SystemContext: {},
}));

// Import the mocked context hooks
import { useConvoContext } from "../contexts/ConvoContext";
import { useSystemContext } from "../contexts/SystemContext";

// Mock the ConvoList component
vi.mock("../components/ConvoList", () => ({
	ConvoList: ({
		convos,
		activeConvoId,
		onSelect,
		onNewConvo,
		onBack,
	}: {
		convos: Array<Convo>;
		activeConvoId: number | undefined;
		onSelect: (convo: Convo) => void;
		onNewConvo: () => void;
		onBack: () => void;
	}) => {
		return (
			<div data-testid="conversation-list">
				<div data-testid="conversations-count">{convos.length}</div>
				<div data-testid="active-id">{activeConvoId}</div>
				<button data-testid="select-btn" onClick={() => onSelect(convos[0])} type="button">
					Select
				</button>
				<button data-testid="new-btn" onClick={onNewConvo} type="button">
					New
				</button>
				<button data-testid="back-btn" onClick={onBack} type="button">
					Back
				</button>
			</div>
		);
	},
}));

describe("ConvosView", () => {
	const mockConvos: Array<Convo> = [
		{
			id: 1,
			userId: 1,
			visitorId: undefined,
			title: "First Conversation",
			messages: [{ role: "user", content: "Hello" }],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		},
		{
			id: 2,
			userId: 1,
			visitorId: undefined,
			title: "Second Conversation",
			messages: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		},
	];

	const ConvosViewComponent = convosView.component;

	beforeEach(() => {
		// Setup default context mock implementations
		vi.mocked(useConvoContext).mockReturnValue({
			convos: [],
			setConvos: vi.fn(),
			activeConvoId: undefined,
			setActiveConvoId: vi.fn(),
			currentTitle: "New Chat",
			handleNewConvo: vi.fn(),
			handleSwitchConvo: vi.fn(),
			reloadConvos: vi.fn().mockResolvedValue(undefined),
			pendingResumeConvo: null,
			setPendingResumeConvo: vi.fn(),
			handleResumeResponse: vi.fn().mockResolvedValue(false),
		});

		vi.mocked(useSystemContext).mockReturnValue({
			systemMessage: null,
			setSystemMessage: vi.fn(),
			viewMode: "conversations",
			setViewMode: vi.fn(),
		});
	});

	const renderConvosView = () => {
		return render(<ConvosViewComponent />);
	};

	it("should have correct name", () => {
		expect(convosView.name).toBe("conversations");
	});

	it("should have a component function", () => {
		expect(convosView.component).toBeDefined();
		expect(typeof convosView.component).toBe("function");
	});

	it("should render ConvoList with correct props", () => {
		vi.mocked(useConvoContext).mockReturnValue({
			convos: mockConvos,
			setConvos: vi.fn(),
			activeConvoId: 1,
			setActiveConvoId: vi.fn(),
			currentTitle: "New Chat",
			handleNewConvo: vi.fn(),
			handleSwitchConvo: vi.fn(),
			reloadConvos: vi.fn().mockResolvedValue(undefined),
			pendingResumeConvo: null,
			setPendingResumeConvo: vi.fn(),
			handleResumeResponse: vi.fn().mockResolvedValue(false),
		});

		const { getByTestId } = renderConvosView();

		expect(getByTestId("conversation-list")).toBeDefined();
		expect(getByTestId("conversations-count").textContent).toBe("2");
		expect(getByTestId("active-id").textContent).toBe("1");
	});

	it("should pass convos prop to ConvoList", () => {
		vi.mocked(useConvoContext).mockReturnValue({
			convos: mockConvos,
			setConvos: vi.fn(),
			activeConvoId: undefined,
			setActiveConvoId: vi.fn(),
			currentTitle: "New Chat",
			handleNewConvo: vi.fn(),
			handleSwitchConvo: vi.fn(),
			reloadConvos: vi.fn().mockResolvedValue(undefined),
			pendingResumeConvo: null,
			setPendingResumeConvo: vi.fn(),
			handleResumeResponse: vi.fn().mockResolvedValue(false),
		});

		const { getByTestId } = renderConvosView();

		expect(getByTestId("conversations-count").textContent).toBe(mockConvos.length.toString());
	});

	it("should pass activeConvoId prop to ConvoList", () => {
		vi.mocked(useConvoContext).mockReturnValue({
			convos: mockConvos,
			setConvos: vi.fn(),
			activeConvoId: 42,
			setActiveConvoId: vi.fn(),
			currentTitle: "New Chat",
			handleNewConvo: vi.fn(),
			handleSwitchConvo: vi.fn(),
			reloadConvos: vi.fn().mockResolvedValue(undefined),
			pendingResumeConvo: null,
			setPendingResumeConvo: vi.fn(),
			handleResumeResponse: vi.fn().mockResolvedValue(false),
		});

		const { getByTestId } = renderConvosView();

		expect(getByTestId("active-id").textContent).toBe("42");
	});

	it("should pass undefined activeConvoId to ConvoList", () => {
		vi.mocked(useConvoContext).mockReturnValue({
			convos: mockConvos,
			setConvos: vi.fn(),
			activeConvoId: undefined,
			setActiveConvoId: vi.fn(),
			currentTitle: "New Chat",
			handleNewConvo: vi.fn(),
			handleSwitchConvo: vi.fn(),
			reloadConvos: vi.fn().mockResolvedValue(undefined),
			pendingResumeConvo: null,
			setPendingResumeConvo: vi.fn(),
			handleResumeResponse: vi.fn().mockResolvedValue(false),
		});

		const { getByTestId } = renderConvosView();

		expect(getByTestId("active-id").textContent).toBe("");
	});

	it("should call handleSwitchConvo when onSelect is invoked", () => {
		const mockHandleSwitchConvo = vi.fn();

		vi.mocked(useConvoContext).mockReturnValue({
			convos: mockConvos,
			setConvos: vi.fn(),
			activeConvoId: undefined,
			setActiveConvoId: vi.fn(),
			currentTitle: "New Chat",
			handleNewConvo: vi.fn(),
			handleSwitchConvo: mockHandleSwitchConvo,
			reloadConvos: vi.fn().mockResolvedValue(undefined),
			pendingResumeConvo: null,
			setPendingResumeConvo: vi.fn(),
			handleResumeResponse: vi.fn().mockResolvedValue(false),
		});

		const { getByTestId } = renderConvosView();

		getByTestId("select-btn").click();

		expect(mockHandleSwitchConvo).toHaveBeenCalledWith(mockConvos[0]);
		expect(mockHandleSwitchConvo).toHaveBeenCalledTimes(1);
	});

	it("should call handleNewConvo when onNewConvo is invoked", () => {
		const mockHandleNewConvo = vi.fn();

		vi.mocked(useConvoContext).mockReturnValue({
			convos: mockConvos,
			setConvos: vi.fn(),
			activeConvoId: undefined,
			setActiveConvoId: vi.fn(),
			currentTitle: "New Chat",
			handleNewConvo: mockHandleNewConvo,
			handleSwitchConvo: vi.fn(),
			reloadConvos: vi.fn().mockResolvedValue(undefined),
			pendingResumeConvo: null,
			setPendingResumeConvo: vi.fn(),
			handleResumeResponse: vi.fn().mockResolvedValue(false),
		});

		const { getByTestId } = renderConvosView();

		getByTestId("new-btn").click();

		expect(mockHandleNewConvo).toHaveBeenCalled();
		expect(mockHandleNewConvo).toHaveBeenCalledTimes(1);
	});

	it("should call setViewMode with 'chat' when onBack is invoked", () => {
		const mockSetViewMode = vi.fn();

		vi.mocked(useConvoContext).mockReturnValue({
			convos: mockConvos,
			setConvos: vi.fn(),
			activeConvoId: undefined,
			setActiveConvoId: vi.fn(),
			currentTitle: "New Chat",
			handleNewConvo: vi.fn(),
			handleSwitchConvo: vi.fn(),
			reloadConvos: vi.fn().mockResolvedValue(undefined),
			pendingResumeConvo: null,
			setPendingResumeConvo: vi.fn(),
			handleResumeResponse: vi.fn().mockResolvedValue(false),
		});

		vi.mocked(useSystemContext).mockReturnValue({
			systemMessage: null,
			setSystemMessage: vi.fn(),
			viewMode: "conversations",
			setViewMode: mockSetViewMode,
		});

		const { getByTestId } = renderConvosView();

		getByTestId("back-btn").click();

		expect(mockSetViewMode).toHaveBeenCalledWith("chat");
		expect(mockSetViewMode).toHaveBeenCalledTimes(1);
	});

	it("should render with empty convos array", () => {
		vi.mocked(useConvoContext).mockReturnValue({
			convos: [],
			setConvos: vi.fn(),
			activeConvoId: undefined,
			setActiveConvoId: vi.fn(),
			currentTitle: "New Chat",
			handleNewConvo: vi.fn(),
			handleSwitchConvo: vi.fn(),
			reloadConvos: vi.fn().mockResolvedValue(undefined),
			pendingResumeConvo: null,
			setPendingResumeConvo: vi.fn(),
			handleResumeResponse: vi.fn().mockResolvedValue(false),
		});

		const { getByTestId } = renderConvosView();

		expect(getByTestId("conversation-list")).toBeDefined();
		expect(getByTestId("conversations-count").textContent).toBe("0");
	});

	it("should render with multiple convos", () => {
		const manyConvos: Array<Convo> = [
			...mockConvos,
			{
				id: 3,
				userId: 1,
				visitorId: undefined,
				title: "Third Conversation",
				messages: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		];

		vi.mocked(useConvoContext).mockReturnValue({
			convos: manyConvos,
			setConvos: vi.fn(),
			activeConvoId: undefined,
			setActiveConvoId: vi.fn(),
			currentTitle: "New Chat",
			handleNewConvo: vi.fn(),
			handleSwitchConvo: vi.fn(),
			reloadConvos: vi.fn().mockResolvedValue(undefined),
			pendingResumeConvo: null,
			setPendingResumeConvo: vi.fn(),
			handleResumeResponse: vi.fn().mockResolvedValue(false),
		});

		const { getByTestId } = renderConvosView();

		expect(getByTestId("conversations-count").textContent).toBe("3");
	});
});
