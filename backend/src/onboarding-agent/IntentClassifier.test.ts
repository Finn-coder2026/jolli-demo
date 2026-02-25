/**
 * Tests for IntentClassifier pattern matching.
 */

import { classifyByPattern } from "./IntentClassifier";
import { describe, expect, it } from "vitest";

describe("IntentClassifier", () => {
	describe("classifyByPattern", () => {
		describe("confirm intent", () => {
			const confirmMessages = [
				"yes",
				"Yes!",
				"yeah",
				"yep",
				"sure",
				"ok",
				"okay",
				"let's go",
				"lets go",
				"let's do it",
				"ready",
				"sounds good",
				"go ahead",
				"go for it",
				"do it",
				"continue",
				"proceed",
				"next",
				"start",
				"please",
				"absolutely",
				"definitely",
				"of course",
			];

			for (const msg of confirmMessages) {
				it(`should classify "${msg}" as confirm`, () => {
					expect(classifyByPattern(msg)).toBe("confirm");
				});
			}
		});

		describe("skip intent", () => {
			const skipMessages = [
				"skip",
				"no thanks",
				"later",
				"not now",
				"pass",
				"don't want",
				"not interested",
				"maybe later",
			];

			for (const msg of skipMessages) {
				it(`should classify "${msg}" as skip`, () => {
					expect(classifyByPattern(msg)).toBe("skip");
				});
			}
		});

		describe("check intent", () => {
			const checkMessages = [
				"check",
				"did it work",
				"is it done",
				"verify",
				"test",
				"did the sync work",
				"has it synced",
			];

			for (const msg of checkMessages) {
				it(`should classify "${msg}" as check`, () => {
					expect(classifyByPattern(msg)).toBe("check");
				});
			}
		});

		describe("github_done intent", () => {
			const githubDoneMessages = [
				"I've connected",
				"I connected my github",
				"installed the app",
				"installed the github app",
				"github is connected",
				"done connecting",
				"just connected",
				"I've installed",
			];

			for (const msg of githubDoneMessages) {
				it(`should classify "${msg}" as github_done`, () => {
					expect(classifyByPattern(msg)).toBe("github_done");
				});
			}
		});

		describe("import intent", () => {
			const importMessages = ["import", "bring in", "pull in", "import existing docs", "import documents"];

			for (const msg of importMessages) {
				it(`should classify "${msg}" as import`, () => {
					expect(classifyByPattern(msg)).toBe("import");
				});
			}
		});

		describe("generate intent", () => {
			const generateMessages = [
				"generate",
				"create docs",
				"write docs",
				"generate new documentation",
				"generate articles",
			];

			for (const msg of generateMessages) {
				it(`should classify "${msg}" as generate`, () => {
					expect(classifyByPattern(msg)).toBe("generate");
				});
			}
		});

		describe("both intent", () => {
			const bothMessages = ["both", "all", "everything", "import and generate", "do both"];

			for (const msg of bothMessages) {
				it(`should classify "${msg}" as both`, () => {
					expect(classifyByPattern(msg)).toBe("both");
				});
			}
		});

		describe("change_github intent", () => {
			const changeGithubMessages = [
				"change repo",
				"different repo",
				"another repo",
				"switch repo",
				"reconnect github",
				"add more apps",
				"add github",
				"reinstall",
				"switch to a different",
				"switch to another",
			];

			for (const msg of changeGithubMessages) {
				it(`should classify "${msg}" as change_github`, () => {
					expect(classifyByPattern(msg)).toBe("change_github");
				});
			}
		});

		describe("reimport intent", () => {
			const reimportMessages = ["reimport", "re-import", "import again", "import more", "run import again"];

			for (const msg of reimportMessages) {
				it(`should classify "${msg}" as reimport`, () => {
					expect(classifyByPattern(msg)).toBe("reimport");
				});
			}
		});

		describe("status intent", () => {
			const statusMessages = [
				"what github app",
				"what's connected",
				"what is installed",
				"show status",
				"show me progress",
				"status",
				"current status",
				"what have I done",
				"what have we set up",
				"which repo",
				"which repository",
			];

			for (const msg of statusMessages) {
				it(`should classify "${msg}" as status`, () => {
					expect(classifyByPattern(msg)).toBe("status");
				});
			}
		});

		describe("help intent", () => {
			const helpMessages = [
				"how do I connect",
				"what should I do",
				"explain",
				"help",
				"why is this needed",
				"tell me more",
			];

			for (const msg of helpMessages) {
				it(`should classify "${msg}" as help`, () => {
					expect(classifyByPattern(msg)).toBe("help");
				});
			}
		});

		describe("goodbye intent", () => {
			const goodbyeMessages = [
				"bye",
				"goodbye",
				"good bye",
				"I'm done",
				"im done",
				"all done",
				"that's all",
				"thats it",
				"exit",
				"quit",
				"see you",
				"see ya",
				"thanks bye",
				"thanks!",
				"no more questions",
			];

			for (const msg of goodbyeMessages) {
				it(`should classify "${msg}" as goodbye`, () => {
					expect(classifyByPattern(msg)).toBe("goodbye");
				});
			}

			it("should NOT classify standalone 'done' as goodbye", () => {
				// "done" alone should fall through to LLM to avoid conflicts with github_done
				expect(classifyByPattern("done")).not.toBe("goodbye");
			});
		});

		describe("off_topic / null", () => {
			it("should return off_topic for empty string", () => {
				expect(classifyByPattern("")).toBe("off_topic");
			});

			it("should return off_topic for whitespace-only", () => {
				expect(classifyByPattern("   ")).toBe("off_topic");
			});

			it("should return null for ambiguous messages", () => {
				// These should fall through to LLM classification
				expect(classifyByPattern("I was thinking about something else")).toBeNull();
			});
		});

		describe("priority ordering", () => {
			it("should classify 'import and generate' as both (not import)", () => {
				// "both" patterns are checked before "import"
				expect(classifyByPattern("import and generate")).toBe("both");
			});

			it("should classify 'do everything' as both", () => {
				expect(classifyByPattern("do everything")).toBe("both");
			});
		});
	});
});
