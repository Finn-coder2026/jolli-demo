import { SpaceImageProvider, transformImageUrlForSpace, useSpaceImageContext } from "./SpaceImageContext";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("SpaceImageContext", () => {
	describe("transformImageUrlForSpace", () => {
		it("should add spaceId query param to /api/images/ URLs", () => {
			const result = transformImageUrlForSpace("/api/images/tenant/org/space/uuid.png", 42);
			expect(result).toBe("/api/images/tenant/org/space/uuid.png?spaceId=42");
		});

		it("should append to existing query params", () => {
			const result = transformImageUrlForSpace("/api/images/tenant/org/space/uuid.png?foo=bar", 42);
			expect(result).toBe("/api/images/tenant/org/space/uuid.png?foo=bar&spaceId=42");
		});

		it("should not transform non-api-images URLs", () => {
			const result = transformImageUrlForSpace("https://example.com/image.png", 42);
			expect(result).toBe("https://example.com/image.png");
		});

		it("should not transform when spaceId is undefined", () => {
			const result = transformImageUrlForSpace("/api/images/tenant/org/space/uuid.png", undefined);
			expect(result).toBe("/api/images/tenant/org/space/uuid.png");
		});

		it("should handle external URLs that start with http", () => {
			const result = transformImageUrlForSpace("http://example.com/api/images/foo.png", 42);
			expect(result).toBe("http://example.com/api/images/foo.png");
		});
	});

	describe("SpaceImageProvider and useSpaceImageContext", () => {
		function TestConsumer() {
			const { spaceId } = useSpaceImageContext();
			return <div data-testid="space-id">{spaceId ?? "undefined"}</div>;
		}

		it("should provide spaceId when wrapped in provider", () => {
			render(
				<SpaceImageProvider spaceId={123}>
					<TestConsumer />
				</SpaceImageProvider>,
			);
			expect(screen.getByTestId("space-id").textContent).toBe("123");
		});

		it("should provide undefined when spaceId is not set", () => {
			render(
				<SpaceImageProvider>
					<TestConsumer />
				</SpaceImageProvider>,
			);
			expect(screen.getByTestId("space-id").textContent).toBe("undefined");
		});

		it("should provide empty context when not wrapped in provider", () => {
			render(<TestConsumer />);
			expect(screen.getByTestId("space-id").textContent).toBe("undefined");
		});
	});
});
