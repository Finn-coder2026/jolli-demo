/**
 * @vitest-environment jsdom
 */

import { mockClient } from "../../test-utils/Client.mock";
import { ClientProvider, useClientContext } from "./ClientContext";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock ExitContext
vi.mock("./ExitContext", () => ({
	useExitContext: vi.fn(),
}));

// Import mocked hook
import { useExitContext } from "./ExitContext";

describe("ClientContext", () => {
	beforeEach(() => {
		// Mock ExitContext
		vi.mocked(useExitContext).mockReturnValue({
			shouldExit: false,
			setShouldExit: vi.fn(),
			isMountedRef: { current: true },
			abortControllerRef: { current: null },
		});
	});

	describe("useClientContext", () => {
		it("should throw error when used outside ClientProvider", () => {
			const TestComponent = () => {
				expect(() => useClientContext()).toThrow("useClientContext must be used within a ClientProvider");
				return <div>Test</div>;
			};

			render(<TestComponent />);
		});

		it("should return context value when used inside ClientProvider", () => {
			const client = mockClient();

			const TestComponent = () => {
				const context = useClientContext();
				expect(context).toBeDefined();
				expect(context.client).toBe(client);
				expect(context.isMountedRef).toBeDefined();
				expect(context.isMountedRef.current).toBe(true);
				return <div>Test</div>;
			};

			render(
				<ClientProvider client={client}>
					<TestComponent />
				</ClientProvider>,
			);
		});

		it("should provide client from context", () => {
			const client = mockClient();

			const TestComponent = () => {
				const { client: contextClient } = useClientContext();
				expect(contextClient).toBe(client);
				expect(typeof contextClient.status).toBe("function");
				expect(typeof contextClient.login).toBe("function");
				return <div>Test</div>;
			};

			render(
				<ClientProvider client={client}>
					<TestComponent />
				</ClientProvider>,
			);
		});
	});
});
