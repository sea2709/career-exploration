import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, getToolName, isToolUIPart } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import HumanCheck from './HumanCheck';

/** Re-verify this long before the server-side session expires so sends don't race the cookie expiry. */
const REVERIFY_MARGIN_MS = 60_000;

const TOOL_LABELS: Record<string, string> = {
	searchOccupations: 'Searching occupations',
	getOccupationProfile: 'Reading occupation profile',
	compareOccupations: 'Comparing occupations',
	getRelatedOccupations: 'Finding related occupations',
	groq_query: 'Querying Sanity content',
	schema_explorer: 'Exploring content schema',
};

const SUGGESTIONS = [
	'I like solving puzzles with numbers and working with computers. What careers fit?',
	'What does a data scientist actually do day to day?',
	"I'm a retail supervisor. How could I move into project management?",
	'Jobs working with animals that need less than a bachelor’s degree?',
];

function ToolChip({ part }: { part: Parameters<typeof getToolName>[0] }) {
	const name = getToolName(part);
	const label = TOOL_LABELS[name] ?? name;
	const input = part.input as Record<string, unknown> | undefined;
	const detail = input?.query ?? input?.code ?? (input?.fromCode ? `${input.fromCode} → ${input.toCode}` : '');
	const done = part.state === 'output-available';
	const failed = part.state === 'output-error';

	return (
		<div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
			<span
				className={`size-2 rounded-full ${failed ? 'bg-red-500' : done ? 'bg-emerald-500' : 'animate-pulse bg-amber-400'}`}
			/>
			{label}
			{detail ? <code className="text-slate-500">{String(detail)}</code> : null}
		</div>
	);
}

export default function CareerChat() {
	const [humanUntil, setHumanUntil] = useState<number | null>(null);
	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: '/api/chat',
				fetch: async (input, init) => {
					const res = await fetch(input, init);
					if (res.status === 403) setHumanUntil(null);
					return res;
				},
			}),
		[],
	);
	const { messages, sendMessage, status, error, stop } = useChat({ transport });
	const [input, setInput] = useState('');
	const bottomRef = useRef<HTMLDivElement>(null);
	const busy = status === 'submitted' || status === 'streaming';
	const verified = humanUntil !== null;

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	useEffect(() => {
		if (humanUntil === null) return;
		const timer = setTimeout(() => setHumanUntil(null), humanUntil - Date.now() - REVERIFY_MARGIN_MS);
		return () => clearTimeout(timer);
	}, [humanUntil]);

	const send = (text: string) => {
		if (!text.trim() || busy || !verified) return;
		sendMessage({ text });
		setInput('');
	};

	return (
		<div className="mx-auto flex h-dvh max-w-3xl flex-col px-4">
			<header className="py-6">
				<h1 className="text-2xl font-semibold text-slate-900">Career Explorer</h1>
				<p className="text-sm text-slate-500">
					Ask about careers. Answers use O*NET 31.0 data via local tools and your Sanity dataset.
				</p>
			</header>

			<main className="flex-1 space-y-6 overflow-y-auto pb-6">
				{messages.length === 0 && (
					<div className="grid gap-2 sm:grid-cols-2">
						{SUGGESTIONS.map((s) => (
							<button
								key={s}
								onClick={() => send(s)}
								disabled={!verified}
								className="rounded-xl border border-slate-200 p-4 text-left text-sm text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-transparent"
							>
								{s}
							</button>
						))}
					</div>
				)}

				{messages.map((message) => (
					<div key={message.id} className={message.role === 'user' ? 'flex justify-end' : ''}>
						<div
							className={
								message.role === 'user'
									? 'max-w-[85%] rounded-2xl bg-slate-900 px-4 py-2 text-white'
									: 'space-y-3 text-slate-800'
							}
						>
							{message.parts.map((part, i) => {
								if (part.type === 'text') {
									return message.role === 'user' ? (
										<p key={i}>{part.text}</p>
									) : (
										<div
											key={i}
											className="space-y-3 leading-relaxed [&_a]:text-blue-700 [&_a]:underline [&_h3]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
										>
											<Markdown
												components={{
													a: ({ node: _node, ...props }) => (
														<a {...props} target="_blank" rel="noreferrer" />
													),
												}}
											>
												{part.text}
											</Markdown>
										</div>
									);
								}
								if (isToolUIPart(part)) {
									return <ToolChip key={i} part={part} />;
								}
								return null;
							})}
						</div>
					</div>
				))}

				{status === 'submitted' && <p className="text-sm text-slate-400">Thinking…</p>}
				{error && (
					<p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
						{error.message || 'Something went wrong.'}
					</p>
				)}
				<div ref={bottomRef} />
			</main>

			{!verified && <HumanCheck onVerified={setHumanUntil} />}

			<form
				onSubmit={(e) => {
					e.preventDefault();
					send(input);
				}}
				className="flex gap-2 border-t border-slate-200 py-4"
			>
				<input
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="What kind of work interests you?"
					className="flex-1 rounded-xl border border-slate-300 px-4 py-2 outline-none focus:border-slate-500"
				/>
				{busy ? (
					<button type="button" onClick={stop} className="rounded-xl bg-slate-200 px-4 py-2 text-slate-700">
						Stop
					</button>
				) : (
					<button
						type="submit"
						disabled={!input.trim() || !verified}
						className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-40"
					>
						Send
					</button>
				)}
			</form>
		</div>
	);
}
