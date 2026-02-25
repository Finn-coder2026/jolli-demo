import { PermissionGuard, withPermission } from "./PermissionGuard";
import { render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the PermissionContext
vi.mock("../contexts/PermissionContext", async () => {
	const actual = await vi.importActual<typeof import("../contexts/PermissionContext")>(
		"../contexts/PermissionContext",
	);
	return {
		...actual,
		usePermissions: vi.fn(),
	};
});

import { usePermissions } from "../contexts/PermissionContext";

describe("PermissionGuard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render children when user has single permission", () => {
		vi.mocked(usePermissions).mockReturnValue({
			hasPermission: vi.fn((perm: string) => perm === "users.view"),
			hasAnyPermission: vi.fn(),
			hasAllPermissions: vi.fn(),
			isLoading: false,
			permissions: ["users.view"],
			role: null,
			error: undefined,
			refresh: vi.fn(),
		});

		render(
			<PermissionGuard permissions="users.view">
				<div>Protected Content</div>
			</PermissionGuard>,
		);

		expect(screen.getByText("Protected Content")).toBeDefined();
	});

	it("should not render children when user lacks single permission", () => {
		vi.mocked(usePermissions).mockReturnValue({
			hasPermission: vi.fn(() => false),
			hasAnyPermission: vi.fn(),
			hasAllPermissions: vi.fn(),
			isLoading: false,
			permissions: [],
			role: null,
			error: undefined,
			refresh: vi.fn(),
		});

		render(
			<PermissionGuard permissions="users.view">
				<div>Protected Content</div>
			</PermissionGuard>,
		);

		expect(screen.queryByText("Protected Content")).toBeNull();
	});

	it("should render fallback when user lacks permission", () => {
		vi.mocked(usePermissions).mockReturnValue({
			hasPermission: vi.fn(() => false),
			hasAnyPermission: vi.fn(),
			hasAllPermissions: vi.fn(),
			isLoading: false,
			permissions: [],
			role: null,
			error: undefined,
			refresh: vi.fn(),
		});

		render(
			<PermissionGuard permissions="users.view" fallback={<div>No Access</div>}>
				<div>Protected Content</div>
			</PermissionGuard>,
		);

		expect(screen.queryByText("Protected Content")).toBeNull();
		expect(screen.getByText("No Access")).toBeDefined();
	});

	it("should render children when user has any of the required permissions", () => {
		vi.mocked(usePermissions).mockReturnValue({
			hasPermission: vi.fn(),
			hasAnyPermission: vi.fn(() => true),
			hasAllPermissions: vi.fn(),
			isLoading: false,
			permissions: ["users.view"],
			role: null,
			error: undefined,
			refresh: vi.fn(),
		});

		render(
			<PermissionGuard permissions={["users.view", "users.edit"]}>
				<div>Protected Content</div>
			</PermissionGuard>,
		);

		expect(screen.getByText("Protected Content")).toBeDefined();
	});

	it("should not render children when user has none of the required permissions", () => {
		vi.mocked(usePermissions).mockReturnValue({
			hasPermission: vi.fn(),
			hasAnyPermission: vi.fn(() => false),
			hasAllPermissions: vi.fn(),
			isLoading: false,
			permissions: [],
			role: null,
			error: undefined,
			refresh: vi.fn(),
		});

		render(
			<PermissionGuard permissions={["users.view", "users.edit"]}>
				<div>Protected Content</div>
			</PermissionGuard>,
		);

		expect(screen.queryByText("Protected Content")).toBeNull();
	});

	it("should render children when user has all required permissions with requireAll", () => {
		vi.mocked(usePermissions).mockReturnValue({
			hasPermission: vi.fn(),
			hasAnyPermission: vi.fn(),
			hasAllPermissions: vi.fn(() => true),
			isLoading: false,
			permissions: ["users.view", "users.edit"],
			role: null,
			error: undefined,
			refresh: vi.fn(),
		});

		render(
			<PermissionGuard permissions={["users.view", "users.edit"]} requireAll>
				<div>Protected Content</div>
			</PermissionGuard>,
		);

		expect(screen.getByText("Protected Content")).toBeDefined();
	});

	it("should not render children when user lacks some permissions with requireAll", () => {
		vi.mocked(usePermissions).mockReturnValue({
			hasPermission: vi.fn(),
			hasAnyPermission: vi.fn(),
			hasAllPermissions: vi.fn(() => false),
			isLoading: false,
			permissions: ["users.view"],
			role: null,
			error: undefined,
			refresh: vi.fn(),
		});

		render(
			<PermissionGuard permissions={["users.view", "users.edit"]} requireAll>
				<div>Protected Content</div>
			</PermissionGuard>,
		);

		expect(screen.queryByText("Protected Content")).toBeNull();
	});

	it("should render fallback when loading", () => {
		vi.mocked(usePermissions).mockReturnValue({
			hasPermission: vi.fn(),
			hasAnyPermission: vi.fn(),
			hasAllPermissions: vi.fn(),
			isLoading: true,
			permissions: [],
			role: null,
			error: undefined,
			refresh: vi.fn(),
		});

		render(
			<PermissionGuard permissions="users.view" fallback={<div>Loading...</div>}>
				<div>Protected Content</div>
			</PermissionGuard>,
		);

		expect(screen.queryByText("Protected Content")).toBeNull();
		expect(screen.getByText("Loading...")).toBeDefined();
	});

	it("should render nothing when loading and no fallback", () => {
		vi.mocked(usePermissions).mockReturnValue({
			hasPermission: vi.fn(),
			hasAnyPermission: vi.fn(),
			hasAllPermissions: vi.fn(),
			isLoading: true,
			permissions: [],
			role: null,
			error: undefined,
			refresh: vi.fn(),
		});

		render(
			<PermissionGuard permissions="users.view">
				<div>Protected Content</div>
			</PermissionGuard>,
		);

		expect(screen.queryByText("Protected Content")).toBeNull();
	});

	it("should handle single permission in array", () => {
		vi.mocked(usePermissions).mockReturnValue({
			hasPermission: vi.fn((perm: string) => perm === "users.view"),
			hasAnyPermission: vi.fn(),
			hasAllPermissions: vi.fn(),
			isLoading: false,
			permissions: ["users.view"],
			role: null,
			error: undefined,
			refresh: vi.fn(),
		});

		render(
			<PermissionGuard permissions={["users.view"]}>
				<div>Protected Content</div>
			</PermissionGuard>,
		);

		expect(screen.getByText("Protected Content")).toBeDefined();
	});
});

describe("withPermission", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should create HOC that renders component with permission", () => {
		vi.mocked(usePermissions).mockReturnValue({
			hasPermission: vi.fn(() => true),
			hasAnyPermission: vi.fn(),
			hasAllPermissions: vi.fn(),
			isLoading: false,
			permissions: ["users.view"],
			role: null,
			error: undefined,
			refresh: vi.fn(),
		});

		function TestComponent({ text }: { text: string }) {
			return <div>{text}</div>;
		}

		const ProtectedComponent = withPermission(TestComponent, "users.view");

		render(<ProtectedComponent text="Test Content" />);

		expect(screen.getByText("Test Content")).toBeDefined();
	});

	it("should create HOC that hides component without permission", () => {
		vi.mocked(usePermissions).mockReturnValue({
			hasPermission: vi.fn(() => false),
			hasAnyPermission: vi.fn(),
			hasAllPermissions: vi.fn(),
			isLoading: false,
			permissions: [],
			role: null,
			error: undefined,
			refresh: vi.fn(),
		});

		function TestComponent({ text }: { text: string }) {
			return <div>{text}</div>;
		}

		const ProtectedComponent = withPermission(TestComponent, "users.view");

		render(<ProtectedComponent text="Test Content" />);

		expect(screen.queryByText("Test Content")).toBeNull();
	});

	it("should support multiple permissions with requireAll", () => {
		vi.mocked(usePermissions).mockReturnValue({
			hasPermission: vi.fn(),
			hasAnyPermission: vi.fn(),
			hasAllPermissions: vi.fn(() => true),
			isLoading: false,
			permissions: ["users.view", "users.edit"],
			role: null,
			error: undefined,
			refresh: vi.fn(),
		});

		function TestComponent({ text }: { text: string }) {
			return <div>{text}</div>;
		}

		const ProtectedComponent = withPermission(TestComponent, ["users.view", "users.edit"], true);

		render(<ProtectedComponent text="Test Content" />);

		expect(screen.getByText("Test Content")).toBeDefined();
	});

	it("should pass through all component props", () => {
		vi.mocked(usePermissions).mockReturnValue({
			hasPermission: vi.fn(() => true),
			hasAnyPermission: vi.fn(),
			hasAllPermissions: vi.fn(),
			isLoading: false,
			permissions: ["users.view"],
			role: null,
			error: undefined,
			refresh: vi.fn(),
		});

		function TestComponent({ text, onClick }: { text: string; onClick: () => void }) {
			return <button onClick={onClick}>{text}</button>;
		}

		const mockOnClick = vi.fn();
		const ProtectedComponent = withPermission(TestComponent, "users.view");

		render(<ProtectedComponent text="Click Me" onClick={mockOnClick} />);

		const button = screen.getByRole("button", { name: "Click Me" });
		button.click();

		expect(mockOnClick).toHaveBeenCalled();
	});
});
