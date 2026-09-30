import { PUBLIC_TURNSTILE_SITE_KEY } from 'astro:env/client';
import { useEffect, useRef, useState } from 'react';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface Turnstile {
	render(container: HTMLElement, options: Record<string, unknown>): string;
	reset(widgetId: string): void;
	remove(widgetId: string): void;
}

declare global {
	interface Window {
		turnstile?: Turnstile;
	}
}

let scriptPromise: Promise<Turnstile> | undefined;

function loadTurnstile(): Promise<Turnstile> {
	scriptPromise ??= new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = SCRIPT_SRC;
		script.async = true;
		script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile missing')));
		script.onerror = () => {
			scriptPromise = undefined;
			script.remove();
			reject(new Error('Failed to load Turnstile'));
		};
		document.head.appendChild(script);
	});
	return scriptPromise;
}

/** Runs a Cloudflare Turnstile challenge and exchanges the token for a server-side human session. */
export default function HumanCheck({ onVerified }: { onVerified: (expiresAt: number) => void }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		let widgetId: string | undefined;

		loadTurnstile()
			.then((turnstile) => {
				if (cancelled || !containerRef.current) return;
				widgetId = turnstile.render(containerRef.current, {
					sitekey: PUBLIC_TURNSTILE_SITE_KEY,
					action: 'chat',
					appearance: 'interaction-only',
					callback: async (token: string) => {
						setError(null);
						try {
							const res = await fetch('/api/verify-human', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ token }),
							});
							if (!res.ok) throw new Error(await res.text());
							const { expiresAt } = (await res.json()) as { expiresAt: number };
							if (!cancelled) onVerified(expiresAt);
						} catch (err) {
							if (cancelled) return;
							console.error('[HumanCheck] verification failed', err);
							setError('Verification failed. Retrying…');
							if (widgetId) turnstile.reset(widgetId);
						}
					},
					'error-callback': () => setError('Verification hit a problem. Retrying…'),
				});
			})
			.catch(() => {
				if (!cancelled) setError('Could not load the human check. Disable content blockers and reload the page.');
			});

		return () => {
			cancelled = true;
			if (widgetId) window.turnstile?.remove(widgetId);
		};
	}, [onVerified]);

	return (
		<div className="flex flex-col items-center gap-2 pt-4 text-sm">
			<div ref={containerRef} />
			<p className={error ? 'text-red-700' : 'text-slate-500'}>{error ?? 'Checking that you’re human…'}</p>
		</div>
	);
}
