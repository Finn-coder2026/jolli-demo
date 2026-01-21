import {
	DEFAULT_REGION,
	fromNeonRegionId,
	getRegionName,
	isValidRegion,
	PROVIDER_REGIONS,
	toNeonRegionId,
} from "./Regions";
import { describe, expect, it } from "vitest";

describe("Regions", () => {
	describe("PROVIDER_REGIONS", () => {
		it("should have 6 regions", () => {
			expect(PROVIDER_REGIONS).toHaveLength(6);
		});

		it("should have all expected regions", () => {
			const slugs = PROVIDER_REGIONS.map(r => r.slug);
			expect(slugs).toContain("us-east-1");
			expect(slugs).toContain("us-east-2");
			expect(slugs).toContain("us-west-2");
			expect(slugs).toContain("eu-central-1");
			expect(slugs).toContain("ap-southeast-1");
			expect(slugs).toContain("ap-southeast-2");
		});

		it("should not have aws- prefix in slugs", () => {
			for (const region of PROVIDER_REGIONS) {
				expect(region.slug).not.toMatch(/^aws-/);
			}
		});
	});

	describe("DEFAULT_REGION", () => {
		it("should be us-west-2", () => {
			expect(DEFAULT_REGION).toBe("us-west-2");
		});

		it("should be a valid region", () => {
			expect(isValidRegion(DEFAULT_REGION)).toBe(true);
		});
	});

	describe("isValidRegion", () => {
		it("should return true for valid regions", () => {
			expect(isValidRegion("us-east-1")).toBe(true);
			expect(isValidRegion("us-west-2")).toBe(true);
			expect(isValidRegion("eu-central-1")).toBe(true);
		});

		it("should return false for invalid regions", () => {
			expect(isValidRegion("invalid")).toBe(false);
			expect(isValidRegion("aws-us-east-1")).toBe(false);
			expect(isValidRegion("")).toBe(false);
		});
	});

	describe("getRegionName", () => {
		it("should return display name for valid regions", () => {
			expect(getRegionName("us-east-1")).toBe("US East (N. Virginia)");
			expect(getRegionName("us-west-2")).toBe("US West (Oregon)");
			expect(getRegionName("eu-central-1")).toBe("EU (Frankfurt)");
		});

		it("should return the input for unknown regions", () => {
			expect(getRegionName("unknown")).toBe("unknown");
			expect(getRegionName("custom-region")).toBe("custom-region");
		});
	});

	describe("toNeonRegionId", () => {
		it("should add aws- prefix", () => {
			expect(toNeonRegionId("us-east-1")).toBe("aws-us-east-1");
			expect(toNeonRegionId("us-west-2")).toBe("aws-us-west-2");
			expect(toNeonRegionId("eu-central-1")).toBe("aws-eu-central-1");
		});
	});

	describe("fromNeonRegionId", () => {
		it("should remove aws- prefix", () => {
			expect(fromNeonRegionId("aws-us-east-1")).toBe("us-east-1");
			expect(fromNeonRegionId("aws-us-west-2")).toBe("us-west-2");
			expect(fromNeonRegionId("aws-eu-central-1")).toBe("eu-central-1");
		});

		it("should handle input without aws- prefix", () => {
			expect(fromNeonRegionId("us-east-1")).toBe("us-east-1");
		});
	});
});
