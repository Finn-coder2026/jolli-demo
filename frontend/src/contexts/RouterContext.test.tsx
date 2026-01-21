import { RouterProvider, useLocation, useNavigate, useOpen, useRedirect } from "./RouterContext";
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("RouterContext", () => {
	it("should throw error when useLocation is used outside provider", () => {
		function TestComponent() {
			useLocation();
			return <div>Test</div>;
		}

		expect(() => {
			render(<TestComponent />);
		}).toThrow("useLocation must be used within RouterProvider");
	});

	it("should throw error when useNavigate is used outside provider", () => {
		function TestComponent() {
			useNavigate();
			return <div>Test</div>;
		}

		expect(() => {
			render(<TestComponent />);
		}).toThrow("useNavigate must be used within RouterProvider");
	});

	it("should throw error when useOpen is used outside provider", () => {
		function TestComponent() {
			useOpen();
			return <div>Test</div>;
		}

		expect(() => {
			render(<TestComponent />);
		}).toThrow("useOpen must be used within RouterProvider");
	});

	it("should throw error when useRedirect is used outside provider", () => {
		function TestComponent() {
			useRedirect();
			return <div>Test</div>;
		}

		expect(() => {
			render(<TestComponent />);
		}).toThrow("useRedirect must be used within RouterProvider");
	});

	it("should provide location from initialPath", () => {
		let pathname = "";

		function TestComponent() {
			const location = useLocation();
			pathname = location.pathname;
			return <div>Test</div>;
		}

		render(
			<RouterProvider initialPath="/test/path">
				<TestComponent />
			</RouterProvider>,
		);

		expect(pathname).toBe("/test/path");
	});

	it("should provide navigate function", () => {
		let navigateFn: ((to: string) => void) | null = null;

		function TestComponent() {
			navigateFn = useNavigate();
			return <div>Test</div>;
		}

		render(
			<RouterProvider initialPath="/test">
				<TestComponent />
			</RouterProvider>,
		);

		expect(navigateFn).toBeDefined();
		expect(typeof navigateFn).toBe("function");
	});
});
