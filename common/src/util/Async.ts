export async function iterateAsync<T>(iterable: AsyncIterable<T>): Promise<void> {
	for await (const _ of iterable) {
		//
	}
}
