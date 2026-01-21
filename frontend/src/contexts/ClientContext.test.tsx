import { ClientProvider, useClient } from "./ClientContext";
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("ClientContext", () => {
	it("should provide a client instance to children", () => {
		let client: ReturnType<typeof useClient> | undefined;
		function TestComponent() {
			client = useClient();
			return <div>Test</div>;
		}

		render(
			<ClientProvider>
				<TestComponent />
			</ClientProvider>,
		);

		expect(client).toBeDefined();
		expect(client?.chat).toBeDefined();
		expect(client?.convos).toBeDefined();
	});

	it("should throw error when useClient is used outside provider", () => {
		function TestComponent() {
			useClient();
			return <div>Test</div>;
		}

		expect(() => {
			render(<TestComponent />);
		}).toThrow("useClient must be used within a ClientProvider");
	});
});
