/**
 * @vitest-environment jsdom
 */
import { adminView } from "./AdminView";
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all context hooks
vi.mock("../contexts/AdminContext", () => ({
	useAdminContext: vi.fn(),
	AdminProvider: ({ children }: { children: React.ReactNode }) => children,
	AdminContext: {},
}));

vi.mock("../contexts/ClientContext", () => ({
	useClientContext: vi.fn(),
	ClientProvider: ({ children }: { children: React.ReactNode }) => children,
	ClientContext: {},
}));

vi.mock("../contexts/SystemContext", () => ({
	useSystemContext: vi.fn(),
	SystemProvider: ({ children }: { children: React.ReactNode }) => children,
	SystemContext: {},
}));

// Import the mocked context hooks
import { useAdminContext } from "../contexts/AdminContext";

// Mock AdminUtilitiesList
vi.mock("../components/AdminUtilitiesList", () => ({
	AdminUtilitiesList: ({ onSelect, onBack }: { onSelect: (utility: string) => void; onBack: () => void }) => {
		return (
			<div data-testid="admin-utilities-list">
				<div>Admin Utilities</div>
				<button
					data-testid="select-clear-all-articles"
					onClick={() => onSelect("clear-all-articles")}
					type="button"
				>
					Clear all articles
				</button>
				<button data-testid="select-back" onClick={onBack} type="button">
					Back to Chat
				</button>
			</div>
		);
	},
}));

// Mock ConfirmationPrompt
vi.mock("../components/ConfirmationPrompt", () => ({
	ConfirmationPrompt: ({
		message,
		onConfirm,
		loading,
	}: {
		message: string;
		onConfirm: (confirmed: boolean) => void;
		loading: boolean;
	}) => {
		return (
			<div data-testid="confirmation-prompt">
				<div>Confirmation Required</div>
				<div>{message}</div>
				{loading ? (
					<div data-testid="spinner">Processing...</div>
				) : (
					<>
						<button data-testid="select-yes" onClick={() => onConfirm(true)} type="button">
							Yes
						</button>
						<button data-testid="select-no" onClick={() => onConfirm(false)} type="button">
							No
						</button>
					</>
				)}
			</div>
		);
	},
}));

describe("AdminView", () => {
	const AdminViewComponent = adminView.component;

	beforeEach(() => {
		// Setup default context mock implementations
		vi.mocked(useAdminContext).mockReturnValue({
			selectedUtility: null,
			confirmationPending: false,
			confirmationMessage: null,
			loading: false,
			error: null,
			handleSelectUtility: vi.fn(),
			handleConfirm: vi.fn(),
			handleBack: vi.fn(),
		});
	});

	const renderAdminView = () => {
		return render(<AdminViewComponent />);
	};

	it("should have correct name", () => {
		expect(adminView.name).toBe("admin");
	});

	it("should render AdminUtilitiesList by default", () => {
		const { getByText, getByTestId } = renderAdminView();

		expect(getByTestId("admin-utilities-list")).toBeDefined();
		expect(getByText("Admin Utilities")).toBeDefined();
		expect(getByText("Clear all articles")).toBeDefined();
	});

	it("should render ConfirmationPrompt when confirmationPending is true", () => {
		vi.mocked(useAdminContext).mockReturnValue({
			selectedUtility: "clear-all-articles",
			confirmationPending: true,
			confirmationMessage: "Are you sure you want to clear all articles? This cannot be undone.",
			loading: false,
			error: null,
			handleSelectUtility: vi.fn(),
			handleConfirm: vi.fn(),
			handleBack: vi.fn(),
		});

		const { getByText, getByTestId } = renderAdminView();

		expect(getByTestId("confirmation-prompt")).toBeDefined();
		expect(getByText("Confirmation Required")).toBeDefined();
		expect(getByText(/Are you sure you want to clear all articles/)).toBeDefined();
	});

	it("should call handleSelectUtility when Clear all articles is selected", () => {
		const mockHandleSelectUtility = vi.fn();

		vi.mocked(useAdminContext).mockReturnValue({
			selectedUtility: null,
			confirmationPending: false,
			confirmationMessage: null,
			loading: false,
			error: null,
			handleSelectUtility: mockHandleSelectUtility,
			handleConfirm: vi.fn(),
			handleBack: vi.fn(),
		});

		const { getByTestId } = renderAdminView();

		act(() => {
			getByTestId("select-clear-all-articles").click();
		});

		expect(mockHandleSelectUtility).toHaveBeenCalledWith("clear-all-articles");
	});

	it("should call handleBack when Back to Chat is selected", () => {
		const mockHandleBack = vi.fn();

		vi.mocked(useAdminContext).mockReturnValue({
			selectedUtility: null,
			confirmationPending: false,
			confirmationMessage: null,
			loading: false,
			error: null,
			handleSelectUtility: vi.fn(),
			handleConfirm: vi.fn(),
			handleBack: mockHandleBack,
		});

		const { getByTestId } = renderAdminView();

		act(() => {
			getByTestId("select-back").click();
		});

		expect(mockHandleBack).toHaveBeenCalled();
	});

	it("should show loading state during operation", () => {
		vi.mocked(useAdminContext).mockReturnValue({
			selectedUtility: "clear-all-articles",
			confirmationPending: true,
			confirmationMessage: "Are you sure you want to clear all articles? This cannot be undone.",
			loading: true,
			error: null,
			handleSelectUtility: vi.fn(),
			handleConfirm: vi.fn(),
			handleBack: vi.fn(),
		});

		const { getByTestId, getByText } = renderAdminView();

		expect(getByTestId("spinner")).toBeDefined();
		expect(getByText("Processing...")).toBeDefined();
	});
});
