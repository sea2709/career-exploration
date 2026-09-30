import { getToolName, isToolUIPart, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai';
import { useEffect, useRef, useState } from 'react';
import HumanCheck from './HumanCheck';
import MarkdownText from './chat/MarkdownText';
import { useVerifiedChat } from './chat/useVerifiedChat';

/** Mirror the tool inputs/outputs in ../../agent/src/quiz-agent.ts and ../../agent/src/onet/interests.ts. */
type Round = 'broad' | 'focused';
type Rating = 'like' | 'unsure' | 'dislike';

type QuizActivities = { round: Round; focusTypes?: string[]; activities: { id: string; text: string }[] };

type PresentInput = { round: Round; intro: string };

type RatingsOutput = { ratings: { id: string; rating: Rating }[] };

type InterestProfile = {
	hollandCode: string;
	ratedActivities: number;
	types: { code: string; name: string; score: number; description: string | null; keywords: string[] }[];
	likedAreas: { name: string; score: number }[];
	dislikedAreas: string[];
};

type OccupationMatches = {
	maxJobZone: number | null;
	matches: {
		code: string;
		title: string;
		url: string;
		jobZone: number | null;
		matchPercent: number;
		interestCode: string;
		matchingAreas: string[];
	}[];
};

type SetupMetadata = { kind: 'setup'; maxJobZone: number | null };

type ToolPart = Parameters<typeof getToolName>[0];

const PREPARATION: { value: number | null; label: string; hint: string }[] = [
	{ value: 2, label: 'A little', hint: 'High school, on-the-job training (Job Zone 1–2)' },
	{ value: 3, label: 'Some', hint: 'Vocational school or associate degree (up to 3)' },
	{ value: 4, label: 'A degree', hint: 'Bachelor’s degree (up to 4)' },
	{ value: null, label: 'Any amount', hint: 'Including graduate school (1–5)' },
];

const RATING_OPTIONS: { value: Rating; label: string; className: string }[] = [
	{ value: 'like', label: 'Like', className: 'aria-pressed:border-emerald-600 aria-pressed:bg-emerald-600' },
	{ value: 'unsure', label: 'Not sure', className: 'aria-pressed:border-slate-500 aria-pressed:bg-slate-500' },
	{ value: 'dislike', label: 'Dislike', className: 'aria-pressed:border-rose-500 aria-pressed:bg-rose-500' },
];

const TYPE_COLORS: Record<string, string> = {
	R: 'bg-orange-500',
	I: 'bg-sky-500',
	A: 'bg-fuchsia-500',
	S: 'bg-emerald-500',
	E: 'bg-amber-500',
	C: 'bg-indigo-500',
};

const STATUS_LABELS: Record<string, string> = {
	getQuizActivities: 'Picking activities',
	buildInterestProfile: 'Scoring your interests',
	matchOccupations: 'Matching occupations',
	searchOccupations: 'Searching occupations',
	getOccupationProfile: 'Reading O*NET profile',
	getRelatedOccupations: 'Finding related occupations',
};

function toolOutput<T>(part: ToolPart, name: string): T | null {
	return getToolName(part) === name && part.state === 'output-available' ? (part.output as T) : null;
}

function setupOf(message: UIMessage): SetupMetadata | null {
	const meta = message.metadata as SetupMetadata | undefined;
	return meta?.kind === 'setup' ? meta : null;
}

function StatusChip({ part }: { part: ToolPart }) {
	const done = part.state === 'output-available';
	const failed = part.state === 'output-error';
	const input = part.input as { query?: string; code?: string } | undefined;
	const detail = input?.query ?? input?.code;
	return (
		<div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
			<span
				className={`size-2 rounded-full ${failed ? 'bg-red-500' : done ? 'bg-emerald-500' : 'animate-pulse bg-amber-400'}`}
			/>
			{STATUS_LABELS[getToolName(part)] ?? getToolName(part)}
			{detail ? <code className="text-slate-500">{detail}</code> : null}
		</div>
	);
}

function ActivityCard({
	input,
	activities,
	disabled,
	onSubmit,
}: {
	input: PresentInput;
	activities: QuizActivities['activities'];
	disabled: boolean;
	onSubmit: (output: RatingsOutput) => void;
}) {
	const [ratings, setRatings] = useState<Record<string, Rating>>({});
	const rated = activities.filter((a) => ratings[a.id]).length;

	return (
		<div className="space-y-4 rounded-2xl border border-slate-300 p-5">
			<div className="flex items-baseline justify-between gap-2">
				<p className="font-medium text-slate-900">{input.intro}</p>
				<p className="shrink-0 text-xs text-slate-500">
					{rated} / {activities.length} rated
				</p>
			</div>
			<ul className="divide-y divide-slate-100">
				{activities.map((activity) => (
					<li key={activity.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
						<span className="text-sm text-slate-800">{activity.text}</span>
						<div className="flex gap-1" role="group" aria-label={activity.text}>
							{RATING_OPTIONS.map((option) => (
								<button
									key={option.value}
									type="button"
									aria-pressed={ratings[activity.id] === option.value}
									onClick={() => setRatings((r) => ({ ...r, [activity.id]: option.value }))}
									className={`rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700 aria-pressed:text-white ${option.className}`}
								>
									{option.label}
								</button>
							))}
						</div>
					</li>
				))}
			</ul>
			<div className="flex flex-wrap items-center gap-3">
				<button
					type="button"
					disabled={disabled || rated < activities.length}
					onClick={() =>
						onSubmit({ ratings: activities.map((a) => ({ id: a.id, rating: ratings[a.id] })) })
					}
					className="rounded-xl bg-slate-900 px-5 py-2 text-white disabled:opacity-40"
				>
					Submit ratings
				</button>
				<button
					type="button"
					disabled={disabled}
					onClick={() =>
						setRatings((r) => ({ ...Object.fromEntries(activities.map((a) => [a.id, 'unsure' as const])), ...r }))
					}
					className="text-xs text-slate-500 hover:text-slate-800 disabled:opacity-40"
				>
					Mark the rest “Not sure”
				</button>
			</div>
		</div>
	);
}

function RatedSummary({ output }: { output: RatingsOutput }) {
	const count = (r: Rating) => output.ratings.filter((x) => x.rating === r).length;
	return (
		<p className="text-sm text-slate-500">
			Rated {output.ratings.length} activities: {count('like')} liked, {count('unsure')} not sure, {count('dislike')}{' '}
			disliked.
		</p>
	);
}

function ProfileCard({ profile }: { profile: InterestProfile }) {
	const top = profile.types.slice(0, 3);
	return (
		<div className="space-y-4 rounded-2xl border border-slate-300 p-5">
			<div className="flex flex-wrap items-end justify-between gap-2">
				<div>
					<p className="text-xs uppercase tracking-wide text-slate-500">Your interest code</p>
					<p className="flex gap-1 text-3xl font-semibold">
						{profile.hollandCode.split('').map((c) => (
							<span key={c} className={`rounded-md px-2 text-white ${TYPE_COLORS[c] ?? 'bg-slate-700'}`}>
								{c}
							</span>
						))}
					</p>
				</div>
				<p className="text-xs text-slate-500">
					{top.map((t) => t.name).join(' · ')} · from {profile.ratedActivities} ratings
				</p>
			</div>

			<div className="space-y-2">
				{profile.types.map((t) => (
					<div key={t.code} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-sm">
						<span className="text-slate-700">{t.name}</span>
						<div className="h-2.5 rounded-full bg-slate-100">
							<div
								className={`h-full rounded-full ${TYPE_COLORS[t.code] ?? 'bg-slate-700'}`}
								style={{ width: `${((t.score - 1) / 6) * 100}%` }}
							/>
						</div>
						<span className="text-right text-xs text-slate-500">{t.score.toFixed(1)}</span>
					</div>
				))}
				<p className="text-xs text-slate-400">O*NET interest scale, 1–7</p>
			</div>

			<div className="grid gap-3 sm:grid-cols-3">
				{top.map((t) => (
					<div key={t.code} className="rounded-lg bg-slate-50 p-3 text-sm">
						<p className="font-medium text-slate-900">{t.name}</p>
						{t.description && <p className="mt-1 text-xs text-slate-600">{t.description}</p>}
						<div className="mt-2 flex flex-wrap gap-1">
							{t.keywords.map((k) => (
								<span key={k} className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">
									{k}
								</span>
							))}
						</div>
					</div>
				))}
			</div>

			{profile.likedAreas.length > 0 && (
				<div className="text-sm">
					<p className="font-medium text-emerald-700">Areas you liked</p>
					<div className="mt-1 flex flex-wrap gap-1">
						{profile.likedAreas.map((a) => (
							<span
								key={a.name}
								className={`rounded-full px-2.5 py-0.5 text-xs ${a.score >= 7 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}
							>
								{a.name}
							</span>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function MatchList({ result }: { result: OccupationMatches }) {
	if (!result.matches.length) {
		return <p className="text-sm text-slate-500">No matching occupations at this preparation level.</p>;
	}
	return (
		<div className="space-y-2 rounded-2xl border border-slate-300 p-5">
			<p className="text-xs uppercase tracking-wide text-slate-500">
				Best-fit occupations{result.maxJobZone ? ` · Job Zone ${result.maxJobZone} or below` : ''}
			</p>
			<ol className="divide-y divide-slate-100">
				{result.matches.map((m) => (
					<li key={m.code} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
						<span
							className={`w-11 text-sm font-semibold ${m.matchPercent >= 85 ? 'text-emerald-700' : m.matchPercent >= 70 ? 'text-amber-700' : 'text-slate-500'}`}
						>
							{m.matchPercent}%
						</span>
						<div className="min-w-0 flex-1">
							<a href={m.url} target="_blank" rel="noreferrer" className="font-medium text-slate-900 hover:underline">
								{m.title}
							</a>
							<p className="text-xs text-slate-500">
								{[m.interestCode && `Interest code ${m.interestCode}`, m.jobZone && `Job Zone ${m.jobZone}`, ...m.matchingAreas]
									.filter(Boolean)
									.join(' · ')}
							</p>
						</div>
						<a
							href={`/interview?job=${encodeURIComponent(m.title)}`}
							className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-400"
						>
							Practice interview
						</a>
					</li>
				))}
			</ol>
		</div>
	);
}

function SetupForm({ disabled, onStart }: { disabled: boolean; onStart: (setup: SetupMetadata) => void }) {
	const [maxJobZone, setMaxJobZone] = useState<number | null>(null);

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				onStart({ kind: 'setup', maxJobZone });
			}}
			className="space-y-6"
		>
			<div className="space-y-2 text-sm text-slate-600">
				<p>
					Rate about 35 everyday work activities by whether you'd <em>enjoy</em> them, not whether you have the
					experience. Your answers become a RIASEC interest profile, matched against how O*NET rates every occupation.
				</p>
			</div>

			<fieldset className="space-y-2" aria-describedby="preparation-help">
				<legend className="text-sm font-medium text-slate-900">How much preparation are you open to?</legend>
				<div id="preparation-help" className="space-y-1 text-xs text-slate-500">
					<p>
						Pick the most school or training you'd be willing to complete for the right career, not what you have
						today. Careers that usually need more than that are left out of your matches. Your activity ratings are
						scored the same either way.
					</p>
					<p>
						Levels follow O*NET's Job Zones, from 1 (little or no preparation) to 5 (usually a graduate degree). Not
						sure? Keep “Any amount” to see everything.
					</p>
				</div>
				<div className="grid gap-2 sm:grid-cols-2">
					{PREPARATION.map((o) => (
						<button
							key={o.label}
							type="button"
							onClick={() => setMaxJobZone(o.value)}
							aria-pressed={maxJobZone === o.value}
							className="rounded-xl border border-slate-300 p-3 text-left aria-pressed:border-slate-900 aria-pressed:ring-1 aria-pressed:ring-slate-900"
						>
							<p className="text-sm font-medium text-slate-900">{o.label}</p>
							<p className="text-xs text-slate-500">{o.hint}</p>
						</button>
					))}
				</div>
			</fieldset>

			<button type="submit" disabled={disabled} className="rounded-xl bg-slate-900 px-5 py-2 text-white disabled:opacity-40">
				Start quiz
			</button>
		</form>
	);
}

export default function InterestQuiz() {
	const { messages, sendMessage, setMessages, addToolOutput, status, error, stop, busy, verified, onVerified } =
		useVerifiedChat('/api/quiz', { sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls });
	const [question, setQuestion] = useState('');
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	const setup = messages.map(setupOf).find(Boolean) ?? null;
	const toolParts = messages.flatMap((m) => m.parts.filter(isToolUIPart));
	const activitySets = new Map<Round, QuizActivities>();
	for (const part of toolParts) {
		const set = toolOutput<QuizActivities>(part, 'getQuizActivities');
		if (set?.activities) activitySets.set(set.round, set);
	}
	const answeredRounds = new Set(
		toolParts
			.filter((p) => getToolName(p) === 'presentActivities' && p.state === 'output-available')
			.map((p) => (p.input as PresentInput).round),
	);
	const awaitingRatings = toolParts.some((p) => getToolName(p) === 'presentActivities' && p.state === 'input-available');
	const hasResults = toolParts.some((p) => toolOutput<InterestProfile>(p, 'buildInterestProfile'));
	const step = hasResults ? 'Results' : answeredRounds.has('broad') ? 'Round 2 of 2' : 'Round 1 of 2';

	const start = (meta: SetupMetadata) => {
		sendMessage({
			text: `Start the interest quiz.\nPreparation: ${meta.maxJobZone ? `up to Job Zone ${meta.maxJobZone}` : 'any'}`,
			metadata: meta,
		});
	};

	const send = (text: string) => {
		if (!text.trim() || busy || !verified) return;
		sendMessage({ text });
		setQuestion('');
	};

	const restart = () => {
		stop();
		setMessages([]);
		setQuestion('');
	};

	return (
		<div className="mx-auto flex h-full max-w-3xl flex-col px-4">
			<header className="flex items-start justify-between gap-4 py-6">
				<div>
					<h1 className="text-2xl font-semibold text-slate-900">Interest Quiz</h1>
					<p className="text-sm text-slate-500">
						{setup
							? `${step} · ${setup.maxJobZone ? `Job Zone ${setup.maxJobZone} or below` : 'any preparation level'}`
							: 'Find occupations that fit what you enjoy, using the O*NET RIASEC interest model.'}
					</p>
				</div>
				{setup && (
					<button
						type="button"
						onClick={restart}
						className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
					>
						Retake quiz
					</button>
				)}
			</header>

			<section className="flex-1 space-y-6 overflow-y-auto pb-6">
				{!setup && <SetupForm disabled={!verified || busy} onStart={start} />}

				{messages.map((message) => {
					if (setupOf(message)) return null;
					if (message.role === 'user') {
						return (
							<div key={message.id} className="flex justify-end">
								<div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-slate-900 px-4 py-2 text-white">
									{message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('')}
								</div>
							</div>
						);
					}
					return (
						<div key={message.id} className="space-y-3 text-slate-800">
							{message.parts.map((part, i) => {
								if (part.type === 'text') return <MarkdownText key={i} text={part.text} />;
								if (!isToolUIPart(part)) return null;
								const name = getToolName(part);

								if (name === 'getQuizActivities' && part.state === 'output-available') return null;
								if (name === 'presentActivities') {
									if (part.state === 'output-available') {
										return <RatedSummary key={i} output={part.output as RatingsOutput} />;
									}
									if (part.state !== 'input-available') return null;
									const input = part.input as PresentInput;
									const set = activitySets.get(input.round);
									if (!set) return <StatusChip key={i} part={part} />;
									return (
										<ActivityCard
											key={part.toolCallId}
											input={input}
											activities={set.activities}
											disabled={busy || !verified}
											onSubmit={(output) =>
												addToolOutput({ tool: 'presentActivities', toolCallId: part.toolCallId, output })
											}
										/>
									);
								}
								const profile = toolOutput<InterestProfile>(part, 'buildInterestProfile');
								if (profile?.types) return <ProfileCard key={i} profile={profile} />;
								const matches = toolOutput<OccupationMatches>(part, 'matchOccupations');
								if (matches?.matches) return <MatchList key={i} result={matches} />;
								return <StatusChip key={i} part={part} />;
							})}
						</div>
					);
				})}

				{status === 'submitted' && <p className="text-sm text-slate-400">Thinking…</p>}
				{error && (
					<p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.message || 'Something went wrong.'}</p>
				)}
				<div ref={bottomRef} />
			</section>

			{!verified && <HumanCheck onVerified={onVerified} />}

			{setup && hasResults && !awaitingRatings && (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						send(question);
					}}
					className="flex items-end gap-2 border-t border-slate-200 py-4"
				>
					<input
						value={question}
						onChange={(e) => setQuestion(e.target.value)}
						placeholder="Ask about a match, or try “show jobs with less training”…"
						className="flex-1 rounded-xl border border-slate-300 px-4 py-2 outline-none focus:border-slate-500"
					/>
					{busy ? (
						<button type="button" onClick={stop} className="rounded-xl bg-slate-200 px-4 py-2 text-slate-700">
							Stop
						</button>
					) : (
						<button
							type="submit"
							disabled={!question.trim() || !verified}
							className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-40"
						>
							Send
						</button>
					)}
				</form>
			)}
		</div>
	);
}
