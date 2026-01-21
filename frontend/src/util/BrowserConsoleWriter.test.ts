import { browserConsoleWriter } from "./BrowserConsoleWriter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("BrowserConsoleWriter", () => {
	let mockConsole: Console;

	beforeEach(() => {
		mockConsole = {
			trace: vi.fn(),
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		} as unknown as Console;
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("browserConsoleWriter", () => {
		it("should create a writer with all log level functions", () => {
			const writer = browserConsoleWriter(mockConsole);

			expect(writer).toBeDefined();
			expect(writer.trace).toBeTypeOf("function");
			expect(writer.debug).toBeTypeOf("function");
			expect(writer.info).toBeTypeOf("function");
			expect(writer.warn).toBeTypeOf("function");
			expect(writer.error).toBeTypeOf("function");
			expect(writer.fatal).toBeTypeOf("function");
		});

		it("should log trace messages with magenta background", () => {
			const writer = browserConsoleWriter(mockConsole);
			const logObject = {
				time: Date.now(),
				name: "TestModule",
				msg: "trace message",
			};

			writer.trace(logObject);

			expect(mockConsole.trace).toHaveBeenCalled();
			const args = (mockConsole.trace as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(args[0]).toContain("TRACE");
			expect(args[0]).toContain("TestModule");
			expect(args[0]).toContain("trace message");
			expect(args[1]).toContain("magenta");
		});

		it("should log debug messages with blue background", () => {
			const writer = browserConsoleWriter(mockConsole);
			const logObject = {
				time: Date.now(),
				name: "TestModule",
				msg: "debug message",
			};

			writer.debug(logObject);

			expect(mockConsole.debug).toHaveBeenCalled();
			const args = (mockConsole.debug as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(args[0]).toContain("DEBUG");
			expect(args[0]).toContain("TestModule");
			expect(args[0]).toContain("debug message");
			expect(args[1]).toContain("blue");
		});

		it("should log info messages with green background", () => {
			const writer = browserConsoleWriter(mockConsole);
			const logObject = {
				time: Date.now(),
				name: "TestModule",
				msg: "info message",
			};

			writer.info(logObject);

			expect(mockConsole.info).toHaveBeenCalled();
			const args = (mockConsole.info as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(args[0]).toContain("INFO");
			expect(args[0]).toContain("TestModule");
			expect(args[0]).toContain("info message");
			expect(args[1]).toContain("green");
		});

		it("should log warn messages with orange background", () => {
			const writer = browserConsoleWriter(mockConsole);
			const logObject = {
				time: Date.now(),
				name: "TestModule",
				msg: "warn message",
			};

			writer.warn(logObject);

			expect(mockConsole.warn).toHaveBeenCalled();
			const args = (mockConsole.warn as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(args[0]).toContain("WARN");
			expect(args[0]).toContain("TestModule");
			expect(args[0]).toContain("warn message");
			expect(args[1]).toContain("orange");
		});

		it("should log error messages with red background", () => {
			const writer = browserConsoleWriter(mockConsole);
			const logObject = {
				time: Date.now(),
				name: "TestModule",
				msg: "error message",
			};

			writer.error(logObject);

			expect(mockConsole.error).toHaveBeenCalled();
			const args = (mockConsole.error as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(args[0]).toContain("ERROR");
			expect(args[0]).toContain("TestModule");
			expect(args[0]).toContain("error message");
			expect(args[1]).toContain("red");
		});

		it("should log fatal messages as error with red background and bold font", () => {
			const writer = browserConsoleWriter(mockConsole);
			const logObject = {
				time: Date.now(),
				name: "TestModule",
				msg: "fatal message",
			};

			writer.fatal(logObject);

			expect(mockConsole.error).toHaveBeenCalled();
			const args = (mockConsole.error as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(args[0]).toContain("FATAL");
			expect(args[0]).toContain("TestModule");
			expect(args[0]).toContain("fatal message");
			expect(args[1]).toContain("red");
			expect(args[1]).toContain("font-weight: bold");
		});

		it("should handle log messages without a name", () => {
			const writer = browserConsoleWriter(mockConsole);
			const logObject = {
				time: Date.now(),
				name: "",
				msg: "message without name",
			};

			writer.info(logObject);

			expect(mockConsole.info).toHaveBeenCalled();
			const args = (mockConsole.info as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(args[0]).toContain("INFO");
			expect(args[0]).not.toContain("()");
			expect(args[0]).toContain("message without name");
		});

		it("should extract and parse JSON objects from log messages", () => {
			const writer = browserConsoleWriter(mockConsole);
			const jsonObject = { key: "value", nested: { prop: 123 } };
			const logObject = {
				time: Date.now(),
				name: "TestModule",
				msg: `Test message with JSON ${JSON.stringify(jsonObject)}`,
			};

			writer.info(logObject);

			expect(mockConsole.info).toHaveBeenCalled();
			const args = (mockConsole.info as ReturnType<typeof vi.fn>).mock.calls[0];
			// Check that %O is used as a placeholder for the JSON object
			expect(args[0]).toContain("%O");
			// Check that the parsed JSON object is passed as an argument
			expect(args).toContainEqual(jsonObject);
		});

		it("should handle messages with multiple JSON objects", () => {
			const writer = browserConsoleWriter(mockConsole);
			const json1 = { id: 1 };
			const json2 = { id: 2 };
			const logObject = {
				time: Date.now(),
				name: "TestModule",
				msg: `First ${JSON.stringify(json1)} and second ${JSON.stringify(json2)}`,
			};

			writer.info(logObject);

			expect(mockConsole.info).toHaveBeenCalled();
			const args = (mockConsole.info as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(args).toContainEqual(json1);
			expect(args).toContainEqual(json2);
		});

		it("should handle invalid JSON gracefully", () => {
			const writer = browserConsoleWriter(mockConsole);
			const logObject = {
				time: Date.now(),
				name: "TestModule",
				msg: "Message with invalid JSON {not valid json}",
			};

			writer.info(logObject);

			expect(mockConsole.info).toHaveBeenCalled();
			const args = (mockConsole.info as ReturnType<typeof vi.fn>).mock.calls[0];
			// Should still contain the invalid JSON string
			expect(args).toContainEqual("{not valid json}");
		});

		it("should handle empty messages", () => {
			const writer = browserConsoleWriter(mockConsole);
			const logObject = {
				time: Date.now(),
				name: "TestModule",
				msg: "",
			};

			writer.info(logObject);

			expect(mockConsole.info).toHaveBeenCalled();
		});

		it("should handle undefined messages", () => {
			const writer = browserConsoleWriter(mockConsole);
			const logObject = {
				time: Date.now(),
				name: "TestModule",
				msg: undefined as unknown as string,
			};

			writer.info(logObject);

			expect(mockConsole.info).toHaveBeenCalled();
			const args = (mockConsole.info as ReturnType<typeof vi.fn>).mock.calls[0];
			// Should have the formatted message even with undefined msg
			expect(args[0]).toContain("INFO");
		});

		it("should handle messages without JSON when no additional objects provided", () => {
			const writer = browserConsoleWriter(mockConsole);
			const logObject = {
				time: Date.now(),
				name: "TestModule",
				msg: "Simple message without any JSON",
			};

			writer.info(logObject);

			expect(mockConsole.info).toHaveBeenCalled();
			const args = (mockConsole.info as ReturnType<typeof vi.fn>).mock.calls[0];
			// Should have 4 elements (message + 3 style strings)
			expect(args.length).toBe(4);
		});

		it("should catch and log errors during formatting", () => {
			const errorConsole = {
				info: vi.fn(() => {
					throw new Error("Console error");
				}),
				error: vi.fn(),
			} as unknown as Console;

			const writer = browserConsoleWriter(errorConsole);
			const logObject = {
				time: Date.now(),
				name: "TestModule",
				msg: "test message",
			};

			writer.info(logObject);

			expect(errorConsole.info).toHaveBeenCalled();
			expect(errorConsole.error).toHaveBeenCalled();
			expect(errorConsole.error).toHaveBeenCalledWith(expect.any(Error));
		});

		it("should include CSS styling for colored output", () => {
			const writer = browserConsoleWriter(mockConsole);
			const logObject = {
				time: Date.now(),
				name: "TestModule",
				msg: "styled message",
			};

			writer.info(logObject);

			const args = (mockConsole.info as ReturnType<typeof vi.fn>).mock.calls[0];
			// Check for CSS styles in arguments
			expect(args[1]).toContain("background-color");
			expect(args[1]).toContain("padding");
			expect(args[1]).toContain("border-radius");
			expect(args[1]).toContain("color: white");
			expect(args[2]).toContain("color: graytext");
			expect(args[3]).toContain("color: canvastext");
		});

		it("should handle null message gracefully", () => {
			const writer = browserConsoleWriter(mockConsole);
			const logObject = {
				time: Date.now(),
				name: "TestModule",
				msg: null as unknown as string,
			};

			writer.info(logObject);

			expect(mockConsole.info).toHaveBeenCalled();
			const args = (mockConsole.info as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(args[0]).toContain("INFO");
		});
	});
});
