/**
 * Browser console writer for pino browser mode.
 * This file contains console references required by pino's browser transport.
 * The noConsole lint rule is disabled for this file via biome.json overrides.
 */

import dateFormat from "dateformat";

const jsonExtractorRegExp = new RegExp(/{(?:[^{}]|({(?:[^{}]|({(?:[^{}]|())*}))*}))*}/g);

/**
 * Log levels
 */
enum LogLevels {
	TRACE = "trace",
	DEBUG = "debug",
	INFO = "info",
	WARN = "warn",
	ERROR = "error",
	FATAL = "fatal",
}

/**
 * log object
 */
type LogObject = {
	/**
	 * The time
	 */
	time: string | number;
	/**
	 * Name of file where log occurred
	 */
	name: string;
	/**
	 * Log message
	 */
	msg: string;
};

type StringOrObject = string | object;

/**
 * Used for formatting log messages
 */
type Formatter = (
	logObject: LogObject,
	level: string,
	backgroundColor: string,
	additionalStyles?: string,
) => Array<StringOrObject>;

/**
 * Pino's write callback function abstracted out with our own type added for the
 * log object.
 */
type WriteFunction = (logObject: LogObject) => void;

/**
 * Pino's write method.
 */
type PinoWrite = {
	fatal: WriteFunction;
	error: WriteFunction;
	warn: WriteFunction;
	info: WriteFunction;
	debug: WriteFunction;
	trace: WriteFunction;
} & { [p: string]: WriteFunction };

/**
 * Adds color to the log message output, this currently assumes that the output will have three colors:
 * 1. the color of the log level "pill" background
 * 2. the color of the location of where the log came from
 * 3. the color of the log message text
 *
 * @param message the message to log
 * @param backgroundColor the background color of the log level pill
 * @param additionalStyles any additional styles
 * @param additionalObjects any additional objects to log.
 */
function logColor(
	message: string,
	backgroundColor: string,
	additionalStyles?: string,
	additionalObjects: Array<JSON> = [],
): Array<StringOrObject> {
	return [
		message,
		`background-color: ${backgroundColor}; padding: 2px 3px; border-radius: 3px; color: white; ${additionalStyles}`,
		"color: graytext",
		"color: canvastext",
		...additionalObjects,
	];
}

/**
 * Formatter for log messages.
 *
 * @param logMessage the log message
 * @param level the log level
 * @param backgroundColor the background color of the log level pill
 * @param additionalStyles any additional objects to log
 */
function logMessageFormatter(
	logMessage: LogObject,
	level: string,
	backgroundColor: string,
	additionalStyles?: string,
): Array<StringOrObject> {
	const { name, msg } = logMessage;
	const updatedLogMessage = msg?.replace(jsonExtractorRegExp, "%O") ?? "";
	const extractedObjects =
		msg?.match(jsonExtractorRegExp)?.map(jsonString => {
			try {
				return JSON.parse(jsonString);
			} catch {
				return jsonString;
			}
		}) ?? [];

	const time = dateFormat(Date.now(), "HH:MM:ss.l");
	return logColor(
		`[${time}] %c${level}%c ${name ? `(${name})` : ""}: %c${updatedLogMessage}`,
		backgroundColor,
		additionalStyles,
		extractedObjects,
	);
}

/**
 * Creates a log writer to be used with pino.
 *
 * @param console the console
 * @param formatter the formatter used to format log message output
 * @param level the log level
 * @param backgroundColor the background color of the log level pill
 * @param additionalStyles any additional objects to log
 */
function createLogger(
	console: Console,
	formatter: Formatter,
	level: LogLevels,
	backgroundColor: string,
	additionalStyles?: string,
): (logObject: LogObject) => void {
	return function logger(logObject: LogObject) {
		const command = level === LogLevels.FATAL ? "error" : level;
		try {
			console[command](...formatter(logObject, level.toUpperCase(), backgroundColor, additionalStyles));
		} catch (error) {
			console.error(error);
		}
	};
}

/**
 * Creates a log writer for use in the browser console
 *
 * @param console the console
 * @param formatter the formatter used to format log message output
 */
function consoleWriter(console: Console, formatter: Formatter): PinoWrite {
	return {
		trace: createLogger(console, formatter, LogLevels.TRACE, "magenta"),
		debug: createLogger(console, formatter, LogLevels.DEBUG, "blue"),
		info: createLogger(console, formatter, LogLevels.INFO, "green"),
		warn: createLogger(console, formatter, LogLevels.WARN, "orange"),
		error: createLogger(console, formatter, LogLevels.ERROR, "red"),
		fatal: createLogger(console, formatter, LogLevels.FATAL, "red", "font-weight: bold"),
	};
}

/**
 * Creates a browser console writer for standard log messages.
 *
 * @param console the console
 */
export function browserConsoleWriter(console: Console): PinoWrite {
	return consoleWriter(console, logMessageFormatter);
}
