/**
 * Byte size value types for use with Express body-parser and the `bytes` library.
 * Similar to how the `ms` package provides `StringValue` for time durations.
 *
 * @example
 * ```typescript
 * const limit: ByteSizeValue = "5mb";
 * const limit2: ByteSizeValue = "100KB";
 * const limit3: ByteSizeValue = "1024"; // bytes
 * ```
 */

/**
 * Valid byte size units (lowercase).
 * - b: bytes
 * - kb: kilobytes (1024 bytes)
 * - mb: megabytes (1024 KB)
 * - gb: gigabytes (1024 MB)
 * - tb: terabytes (1024 GB)
 * - pb: petabytes (1024 TB)
 */
export type ByteUnit = "b" | "kb" | "mb" | "gb" | "tb" | "pb";

/**
 * Case-insensitive byte size units.
 */
export type ByteUnitAnyCase = ByteUnit | Uppercase<ByteUnit>;

/**
 * Valid byte size string values.
 * Accepts:
 * - Plain numbers as strings (interpreted as bytes): "1024"
 * - Numbers with units: "5mb", "100KB", "1.5GB"
 * - Numbers with space before units: "5 mb", "100 KB"
 */
export type ByteSizeValue = `${number}` | `${number}${ByteUnitAnyCase}` | `${number} ${ByteUnitAnyCase}`;
