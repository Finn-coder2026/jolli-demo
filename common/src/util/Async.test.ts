import { iterateAsync } from "./Async";

test("iterateAsync with empty async iterable", async () => {
	let count = 0;

	async function* iterator() {
		await Promise.resolve(); // Satisfy async requirement
		yield count++;
	}

	await iterateAsync(iterator());
	expect(count).toBe(1);
});
