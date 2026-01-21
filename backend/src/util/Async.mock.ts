export function mockAsyncIterable<T>(items: Array<T> = []): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator]() {
			for (const item of items) {
				yield await item;
			}
		},
	};
}
