import { matches, matchesAnyJrnPattern, matchesJrnPattern, matchesJrnV3Pattern } from "./JrnMatcher";
import { describe, expect, it } from "vitest";

describe("JrnMatcher", () => {
	describe("exact matching", () => {
		it("matches exact JRN", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:/spc_01:sources:github/myorg/myrepo/main";

			expect(matches(jrn, pattern)).toBe(true);
			expect(matchesJrnPattern(jrn, pattern)).toBe(true);
		});

		it("does not match different JRN", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:/spc_01:sources:github/myorg/myrepo/develop";

			expect(matches(jrn, pattern)).toBe(false);
		});
	});

	describe("single wildcard (*)", () => {
		it("matches any workspace with *", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:*:sources:github/myorg/myrepo/main";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("matches any service with *", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:/spc_01:*:github/myorg/myrepo/main";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("matches any single path segment with *", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:/spc_01:sources:github/*/myrepo/main";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("matches any repo with *", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:/spc_01:sources:github/myorg/*/main";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("matches any branch with *", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:/spc_01:sources:github/myorg/myrepo/*";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("matches multiple path wildcards", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:*:sources:github/*/*/*";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("does not match when * pattern has wrong literal", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:*:sources:github/otherorg/*/*";

			expect(matches(jrn, pattern)).toBe(false);
		});
	});

	describe("granular workspace wildcards", () => {
		it("matches any org but specific space with */spaceId", () => {
			const jrn = "jrn:org_01/spc_01:docs:article/art_01";
			const pattern = "jrn:*/spc_01:docs:article/art_01";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("matches empty org with specific space using */spaceId", () => {
			const jrn = "jrn:/spc_01:docs:article/art_01";
			const pattern = "jrn:*/spc_01:docs:article/art_01";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("matches specific org but any space with orgId/*", () => {
			const jrn = "jrn:org_01/spc_01:docs:article/art_01";
			const pattern = "jrn:org_01/*:docs:article/art_01";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("matches ** for entire workspace", () => {
			const jrn = "jrn:org_01/spc_01:docs:article/art_01";
			const pattern = "jrn:**:docs:article/art_01";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("matches ** for entire workspace with empty org", () => {
			const jrn = "jrn:/spc_01:docs:article/art_01";
			const pattern = "jrn:**:docs:article/art_01";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("matches exact workspace with empty org", () => {
			const jrn = "jrn:/spc_01:docs:article/art_01";
			const pattern = "jrn:/spc_01:docs:article/art_01";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("does not match when spaceId differs", () => {
			const jrn = "jrn:org_01/spc_01:docs:article/art_01";
			const pattern = "jrn:*/spc_02:docs:article/art_01";

			expect(matches(jrn, pattern)).toBe(false);
		});

		it("does not match when orgId differs", () => {
			const jrn = "jrn:org_01/spc_01:docs:article/art_01";
			const pattern = "jrn:org_02/*:docs:article/art_01";

			expect(matches(jrn, pattern)).toBe(false);
		});

		it("matches empty org with specific space", () => {
			const jrn = "jrn:/spc_01:docs:article/art_01";
			const pattern = "jrn:*/spc_01:docs:article/art_01";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("falls back to exact match when pattern has wrong number of parts", () => {
			// Pattern has only 1 part instead of 2
			const jrn = "jrn:/spc_01:docs:article/art_01";
			const pattern = "jrn:spc_01:docs:article/art_01";

			// This should not match because pattern workspace "spc_01" != JRN workspace "/spc_01"
			expect(matches(jrn, pattern)).toBe(false);
		});

		it("exact match works when pattern has wrong number of parts but values match", () => {
			// Pattern workspace = JRN workspace exactly (both have non-standard format)
			const jrn = "jrn:spc_01:docs:article/art_01";
			const pattern = "jrn:spc_01:docs:article/art_01";

			// This should match because both have same workspace string
			expect(matches(jrn, pattern)).toBe(true);
		});
	});

	describe("multi wildcard (**)", () => {
		it("matches all remaining path segments with **", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:/spc_01:sources:github/**";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("matches zero path segments with **", () => {
			const jrn = "jrn:/spc_01:sources:github";
			const pattern = "jrn:/spc_01:sources:github/**";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("matches any github source with wildcards", () => {
			const jrn = "jrn:/spc_01:sources:github/anthropics/claude-code/feature/branch";
			const pattern = "jrn:*:sources:github/**";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("matches ** in middle of path", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/feature/deep/branch";
			const pattern = "jrn:/spc_01:sources:github/**/branch";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("matches ** followed by literal at end", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:/spc_01:sources:github/**/main";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("matches ** with zero segments in middle", () => {
			const jrn = "jrn:/spc_01:sources:github/main";
			const pattern = "jrn:/spc_01:sources:github/**/main";

			expect(matches(jrn, pattern)).toBe(true);
		});
	});

	describe("default wildcards for missing segments", () => {
		it("missing workspace defaults to *", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn::sources:github/myorg/myrepo/main";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("missing service defaults to *", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:/spc_01::github/myorg/myrepo/main";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("missing resource path defaults to **", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:/spc_01:sources:";

			expect(matches(jrn, pattern)).toBe(true);
		});
	});

	describe("edge cases", () => {
		it("returns false for invalid JRN (not starting with jrn:)", () => {
			const jrn = "arn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:*:sources:github/**";

			expect(matches(jrn, pattern)).toBe(false);
		});

		it("returns false for invalid pattern (not starting with jrn:)", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "arn:*:sources:github/**";

			expect(matches(jrn, pattern)).toBe(false);
		});

		it("returns false for JRN with too few parts", () => {
			const jrn = "jrn:/spc_01";
			const pattern = "jrn:*:sources:github/**";

			expect(matches(jrn, pattern)).toBe(false);
		});

		it("returns false when workspace does not match", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:/spc_02:sources:github/myorg/myrepo/main";

			expect(matches(jrn, pattern)).toBe(false);
		});

		it("returns false when service does not match", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:/spc_01:docs:github/myorg/myrepo/main";

			expect(matches(jrn, pattern)).toBe(false);
		});

		it("returns false when ** in middle does not find match", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/develop";
			// Pattern expects "main" at the end, but JRN has "develop"
			const pattern = "jrn:/spc_01:sources:github/**/main";

			expect(matches(jrn, pattern)).toBe(false);
		});

		it("does not match when pattern has more path segments than JRN", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg";
			const pattern = "jrn:/spc_01:sources:github/myorg/myrepo/main";

			expect(matches(jrn, pattern)).toBe(false);
		});

		it("does not match when pattern has fewer non-** path segments", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:/spc_01:sources:github/myorg";

			expect(matches(jrn, pattern)).toBe(false);
		});
	});

	describe("docs service matching", () => {
		it("matches article JRN with wildcards", () => {
			const jrn = "jrn:/spc_01:docs:article/my-article";
			const pattern = "jrn:*:docs:article/*";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("matches article JRN with version qualifier using **", () => {
			const jrn = "jrn:/spc_01:docs:article/my-article:v/12";
			// Version qualifiers add colons which become part of the resource path
			// Use ** to match the entire resource path including qualifiers
			const pattern = "jrn:*:docs:**";

			expect(matches(jrn, pattern)).toBe(true);
		});

		it("matches any docs resource with **", () => {
			const jrn = "jrn:/spc_01:docs:article/my-article";
			const pattern = "jrn:*:docs:**";

			expect(matches(jrn, pattern)).toBe(true);
		});
	});

	describe("jobs service matching", () => {
		it("matches job JRN with wildcards", () => {
			const jrn = "jrn:/spc_01:jobs:job/job_01J999";
			const pattern = "jrn:*:jobs:job/*";

			expect(matches(jrn, pattern)).toBe(true);
		});
	});

	describe("agents service matching", () => {
		it("matches agent JRN with wildcards", () => {
			const jrn = "jrn:/spc_01:agents:agent/agt_01J888";
			const pattern = "jrn:*:agents:agent/*";

			expect(matches(jrn, pattern)).toBe(true);
		});
	});
});

// =============================================================================
// V3 JRN Matcher Tests
// =============================================================================

describe("JrnMatcher V3", () => {
	describe("matchesJrnV3Pattern", () => {
		describe("exact matching", () => {
			it("matches exact v3 JRN", () => {
				const jrn = "jrn::path:/home/org_01/sources/github/myorg/myrepo/main";
				const pattern = "jrn::path:/home/org_01/sources/github/myorg/myrepo/main";

				expect(matchesJrnV3Pattern(jrn, pattern)).toBe(true);
			});

			it("does not match different v3 JRN", () => {
				const jrn = "jrn::path:/home/org_01/sources/github/myorg/myrepo/main";
				const pattern = "jrn::path:/home/org_01/sources/github/myorg/myrepo/develop";

				expect(matchesJrnV3Pattern(jrn, pattern)).toBe(false);
			});
		});

		describe("controlling path matching", () => {
			it("matches empty controlling path exactly", () => {
				const jrn = "jrn::path:/home/org_01/docs/article/art_01";
				const pattern = "jrn::path:/home/org_01/docs/article/art_01";

				expect(matchesJrnV3Pattern(jrn, pattern)).toBe(true);
			});

			it("matches non-empty controlling path exactly", () => {
				const jrn = "jrn:ctrl:path:/home/org_01/docs/article/art_01";
				const pattern = "jrn:ctrl:path:/home/org_01/docs/article/art_01";

				expect(matchesJrnV3Pattern(jrn, pattern)).toBe(true);
			});

			it("does not match different controlling path", () => {
				const jrn = "jrn:ctrl1:path:/home/org_01/docs/article/art_01";
				const pattern = "jrn:ctrl2:path:/home/org_01/docs/article/art_01";

				expect(matchesJrnV3Pattern(jrn, pattern)).toBe(false);
			});

			it("matches any controlling path with *", () => {
				const jrn = "jrn:anyctrl:path:/home/org_01/docs/article/art_01";
				const pattern = "jrn:*:path:/home/org_01/docs/article/art_01";

				expect(matchesJrnV3Pattern(jrn, pattern)).toBe(true);
			});

			it("matches empty controlling path with *", () => {
				const jrn = "jrn::path:/home/org_01/docs/article/art_01";
				const pattern = "jrn:*:path:/home/org_01/docs/article/art_01";

				expect(matchesJrnV3Pattern(jrn, pattern)).toBe(true);
			});
		});

		describe("path wildcards", () => {
			it("matches single path segment with *", () => {
				const jrn = "jrn::path:/home/org_01/sources/github/myorg/myrepo/main";
				const pattern = "jrn::path:/home/org_01/sources/github/*/myrepo/main";

				expect(matchesJrnV3Pattern(jrn, pattern)).toBe(true);
			});

			it("matches multiple path wildcards", () => {
				const jrn = "jrn::path:/home/org_01/sources/github/myorg/myrepo/main";
				const pattern = "jrn::path:/home/*/sources/github/*/*/*";

				expect(matchesJrnV3Pattern(jrn, pattern)).toBe(true);
			});

			it("matches all remaining segments with **", () => {
				const jrn = "jrn::path:/home/org_01/sources/github/myorg/myrepo/main";
				const pattern = "jrn::path:/home/org_01/sources/github/**";

				expect(matchesJrnV3Pattern(jrn, pattern)).toBe(true);
			});

			it("matches zero remaining segments with **", () => {
				const jrn = "jrn::path:/home/org_01/sources/github";
				const pattern = "jrn::path:/home/org_01/sources/github/**";

				expect(matchesJrnV3Pattern(jrn, pattern)).toBe(true);
			});

			it("matches ** in middle of path", () => {
				const jrn = "jrn::path:/home/org_01/sources/github/myorg/myrepo/feature/branch";
				const pattern = "jrn::path:/home/org_01/sources/github/**/branch";

				expect(matchesJrnV3Pattern(jrn, pattern)).toBe(true);
			});

			it("matches any github source with wildcards", () => {
				const jrn = "jrn::path:/home/org_01/sources/github/anthropics/claude-code/feature/branch";
				const pattern = "jrn:*:path:/home/*/sources/github/**";

				expect(matchesJrnV3Pattern(jrn, pattern)).toBe(true);
			});
		});

		describe("edge cases", () => {
			it("returns false for v2 JRN", () => {
				const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
				const pattern = "jrn::path:/home/org_01/sources/github/**";

				expect(matchesJrnV3Pattern(jrn, pattern)).toBe(false);
			});

			it("returns false for invalid pattern", () => {
				const jrn = "jrn::path:/home/org_01/docs/article/art_01";
				const pattern = "invalid";

				expect(matchesJrnV3Pattern(jrn, pattern)).toBe(false);
			});

			it("returns false when pattern is not v3 format", () => {
				const jrn = "jrn::path:/home/org_01/docs/article/art_01";
				const pattern = "jrn:/spc_01:docs:article/art_01";

				expect(matchesJrnV3Pattern(jrn, pattern)).toBe(false);
			});
		});
	});

	describe("matchesAnyJrnPattern", () => {
		it("matches v2 JRN with v2 pattern", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn:*:sources:github/**";

			expect(matchesAnyJrnPattern(jrn, pattern)).toBe(true);
		});

		it("matches v3 JRN with v3 pattern", () => {
			const jrn = "jrn::path:/home/org_01/sources/github/myorg/myrepo/main";
			const pattern = "jrn:*:path:/home/*/sources/github/**";

			expect(matchesAnyJrnPattern(jrn, pattern)).toBe(true);
		});

		it("returns false for v2 JRN with v3 pattern", () => {
			const jrn = "jrn:/spc_01:sources:github/myorg/myrepo/main";
			const pattern = "jrn::path:/home/org_01/sources/github/**";

			expect(matchesAnyJrnPattern(jrn, pattern)).toBe(false);
		});

		it("returns false for v3 JRN with v2 pattern", () => {
			const jrn = "jrn::path:/home/org_01/sources/github/myorg/myrepo/main";
			const pattern = "jrn:*:sources:github/**";

			expect(matchesAnyJrnPattern(jrn, pattern)).toBe(false);
		});

		it("returns false for non-jrn JRN string", () => {
			const jrn = "not-a-jrn";
			const pattern = "jrn::path:/home/org_01/sources/github/**";

			expect(matchesAnyJrnPattern(jrn, pattern)).toBe(false);
		});

		it("returns false for non-jrn pattern string", () => {
			const jrn = "jrn::path:/home/org_01/sources/github/myorg/myrepo/main";
			const pattern = "not-a-jrn";

			expect(matchesAnyJrnPattern(jrn, pattern)).toBe(false);
		});
	});
});
