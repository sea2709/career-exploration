import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useMemo, useState } from 'react';

/** Re-verify this long before the server-side session expires so sends don't race the cookie expiry. */
const REVERIFY_MARGIN_MS = 60_000;

/**
 * `useChat` against one of the proxied agent routes, plus the Turnstile human-session state.
 * Render `HumanCheck` with `onVerified` while `verified` is false.
 */
export function useVerifiedChat(api: string) {
	const [humanUntil, setHumanUntil] = useState<number | null>(null);
	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api,
				fetch: async (input, init) => {
					const res = await fetch(input, init);
					if (res.status === 403) setHumanUntil(null);
					return res;
				},
			}),
		[api],
	);
	const chat = useChat({ transport });

	useEffect(() => {
		if (humanUntil === null) return;
		const timer = setTimeout(() => setHumanUntil(null), humanUntil - Date.now() - REVERIFY_MARGIN_MS);
		return () => clearTimeout(timer);
	}, [humanUntil]);

	return {
		...chat,
		busy: chat.status === 'submitted' || chat.status === 'streaming',
		verified: humanUntil !== null,
		onVerified: setHumanUntil,
	};
}
