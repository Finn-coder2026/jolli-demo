import { RouterProvider, useBasename, useLocation, useNavigate, useOpen, useRedirect } from "./RouterContext";
import { act, render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

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

	it("should throw error when useBasename is used outside provider", () => {
		function TestComponent() {
			useBasename();
			return <div>Test</div>;
		}

		expect(() => {
			render(<TestComponent />);
		}).toThrow("useBasename must be used within RouterProvider");
	});

	describe("basename functionality", () => {
		it("should provide empty basename by default", () => {
			let basename = "";

			function TestComponent() {
				basename = useBasename();
				return <div>Test</div>;
			}

			render(
				<RouterProvider initialPath="/test">
					<TestComponent />
				</RouterProvider>,
			);

			expect(basename).toBe("");
		});

		it("should provide custom basename when specified", () => {
			let basename = "";

			function TestComponent() {
				basename = useBasename();
				return <div>Test</div>;
			}

			render(
				<RouterProvider initialPath="/tenant/dashboard" basename="/tenant">
					<TestComponent />
				</RouterProvider>,
			);

			expect(basename).toBe("/tenant");
		});

		it("should strip basename from pathname when reading location", () => {
			let pathname = "";

			function TestComponent() {
				const location = useLocation();
				pathname = location.pathname;
				return <div>Test</div>;
			}

			render(
				<RouterProvider initialPath="/tenant/dashboard" basename="/tenant">
					<TestComponent />
				</RouterProvider>,
			);

			expect(pathname).toBe("/dashboard");
		});

		it("should handle root path with basename correctly", () => {
			let pathname = "";

			function TestComponent() {
				const location = useLocation();
				pathname = location.pathname;
				return <div>Test</div>;
			}

			render(
				<RouterProvider initialPath="/tenant" basename="/tenant">
					<TestComponent />
				</RouterProvider>,
			);

			expect(pathname).toBe("/");
		});

		it("should not strip basename if path doesn't start with it", () => {
			let pathname = "";

			function TestComponent() {
				const location = useLocation();
				pathname = location.pathname;
				return <div>Test</div>;
			}

			render(
				<RouterProvider initialPath="/other/path" basename="/tenant">
					<TestComponent />
				</RouterProvider>,
			);

			expect(pathname).toBe("/other/path");
		});

		it("should prepend basename to history URL when navigating", () => {
			const pushStateSpy = vi.spyOn(window.history, "pushState");
			let navigateFn: ((to: string) => void) | null = null;

			function TestComponent() {
				navigateFn = useNavigate();
				return <div>Test</div>;
			}

			render(
				<RouterProvider initialPath="/tenant/start" basename="/tenant">
					<TestComponent />
				</RouterProvider>,
			);

			act(() => {
				navigateFn?.("/dashboard");
			});

			expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/tenant/dashboard");
			pushStateSpy.mockRestore();
		});

		it("should not double-prefix basename when path already starts with it", () => {
			const pushStateSpy = vi.spyOn(window.history, "pushState");
			let navigateFn: ((to: string) => void) | null = null;

			function TestComponent() {
				navigateFn = useNavigate();
				return <div>Test</div>;
			}

			render(
				<RouterProvider initialPath="/tenant/start" basename="/tenant">
					<TestComponent />
				</RouterProvider>,
			);

			act(() => {
				navigateFn?.("/tenant/dashboard");
			});

			expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/tenant/dashboard");
			pushStateSpy.mockRestore();
		});

		it("should normalize path without leading slash when adding basename", () => {
			const pushStateSpy = vi.spyOn(window.history, "pushState");
			let navigateFn: ((to: string) => void) | null = null;
			let pathname = "";

			function TestComponent() {
				navigateFn = useNavigate();
				pathname = useLocation().pathname;
				return <div>Test</div>;
			}

			render(
				<RouterProvider initialPath="/tenant/start" basename="/tenant">
					<TestComponent />
				</RouterProvider>,
			);

			act(() => {
				navigateFn?.("dashboard");
			});

			expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/tenant/dashboard");
			expect(pathname).toBe("/dashboard");
			pushStateSpy.mockRestore();
		});
	});

	describe("navigate", () => {
		it("should update location when navigate is called", () => {
			let pathname = "";
			let navigateFn: ((to: string) => void) | null = null;

			function TestComponent() {
				const location = useLocation();
				navigateFn = useNavigate();
				pathname = location.pathname;
				return <div>Test</div>;
			}

			render(
				<RouterProvider initialPath="/start">
					<TestComponent />
				</RouterProvider>,
			);

			expect(pathname).toBe("/start");

			act(() => {
				navigateFn?.("/new-path");
			});

			expect(pathname).toBe("/new-path");
		});
	});

	describe("open", () => {
		it("should call window.open with _blank target", () => {
			const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
			let openFn: ((to: string) => void) | null = null;

			function TestComponent() {
				openFn = useOpen();
				return <div>Test</div>;
			}

			render(
				<RouterProvider initialPath="/test">
					<TestComponent />
				</RouterProvider>,
			);

			act(() => {
				openFn?.("/external");
			});

			expect(openSpy).toHaveBeenCalledWith("/external", "_blank");
			openSpy.mockRestore();
		});
	});

	describe("redirect", () => {
		it("should set window.location.href when redirect is called", () => {
			let redirectFn: ((to: string) => void) | null = null;

			function TestComponent() {
				redirectFn = useRedirect();
				return <div>Test</div>;
			}

			// Save the original location and replace with a mock that tracks href assignments
			const originalLocation = window.location;
			const hrefSpy = vi.fn();
			const mockLocation = {
				...originalLocation,
				assign: originalLocation.assign,
				replace: originalLocation.replace,
				reload: originalLocation.reload,
			} as Location;
			Object.defineProperty(mockLocation, "href", {
				get: () => originalLocation.href,
				set: hrefSpy,
				configurable: true,
			});
			Object.defineProperty(window, "location", {
				value: mockLocation,
				configurable: true,
				writable: true,
			});

			render(
				<RouterProvider initialPath="/test">
					<TestComponent />
				</RouterProvider>,
			);

			act(() => {
				redirectFn?.("https://example.com");
			});

			expect(hrefSpy).toHaveBeenCalledWith("https://example.com");

			// Restore the original location
			Object.defineProperty(window, "location", {
				value: originalLocation,
				configurable: true,
				writable: true,
			});
		});
	});

	describe("popstate", () => {
		it("should update location on popstate event", () => {
			let pathname = "";

			function TestComponent() {
				const location = useLocation();
				pathname = location.pathname;
				return <div>{location.pathname}</div>;
			}

			// No initialPath so the popstate listener is registered
			render(
				<RouterProvider>
					<TestComponent />
				</RouterProvider>,
			);

			window.history.pushState({}, "", "/new-location");

			act(() => {
				window.dispatchEvent(new PopStateEvent("popstate"));
			});

			expect(pathname).toBe("/new-location");
		});
	});

	describe("getLocationFromWindow", () => {
		it("should read location from window when no initialPath is provided", () => {
			let pathname = "";

			// Set a known URL before rendering
			window.history.pushState({}, "", "/from-window");

			function TestComponent() {
				const location = useLocation();
				pathname = location.pathname;
				return <div>Test</div>;
			}

			render(
				<RouterProvider>
					<TestComponent />
				</RouterProvider>,
			);

			expect(pathname).toBe("/from-window");
		});
	});
});
