export interface Queue<T> {
	add(item: T): void;
	close(): Promise<void>;
}

export function createQueue<T>(concurrency: number, processor: (item: T) => Promise<void>): Queue<T> {
	const promises = new Set<Promise<void>>();
	const queue: Array<T> = [];

	return { add, close };

	function add(item: T): void {
		queue.push(item);
		process();
	}

	async function close(): Promise<void> {
		while (queue.length > 0 || promises.size > 0) {
			if (promises.size > 0) {
				await Promise.race(promises);
			}
			process();
		}
	}

	function process(): void {
		while (queue.length > 0 && promises.size < concurrency) {
			const item = queue[0];
			queue.shift();

			const promise = processor(item).finally(() => {
				promises.delete(promise);
				process();
			});
			promises.add(promise);
		}
	}
}
