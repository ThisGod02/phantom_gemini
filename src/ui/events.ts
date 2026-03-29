type EventListener = (event: string, data: unknown) => void;

const listeners = new Set<EventListener>();

export function subscribe(listener: EventListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function publish(event: string, data: unknown): void {
	for (const listener of listeners) {
		try {
			listener(event, data);
		} catch {
			// Don't let one listener crash others
		}
	}
}

export function createSSEResponse(): Response {
	let unsubscribe: (() => void) | null = null;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`));
			unsubscribe = subscribe((event, data) => {
				try {
					controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
				} catch {
					// Stream may be closed
				}
			});
		},
		cancel() {
			unsubscribe?.();
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
		},
	});
}

export function getListenerCount(): number {
	return listeners.size;
}
