import { getToolName, isToolUIPart, type UIMessage } from 'ai';
import { useEffect, useRef, useState } from 'react';
import HumanCheck from './HumanCheck';
import MarkdownText from './chat/MarkdownText';
import { useVerifiedChat } from './chat/useVerifiedChat';

/** Mirrors the scoreAnswer / finishInterview tool inputs in ../../agent/src/interview-agent.ts. */
type InterviewScore = {
	questionNumber: number;
	question: string;
	competency: string;
	rating: number;
	demonstratedLevel: number | null;
	requiredLevel: number | null;
	anchorUsed: string | null;
	strengths: string[];
	improvements: string[];
	strongerAnswerTip: string;
};

type InterviewReport = {
	role: string;
	overallRating: number;
	readiness: 'not-yet' | 'getting-there' | 'ready';
	summary: string;
	strengths: string[];
	focusAreas: { competency: string; why: string; practice: string }[];
};

type Focus = 'mixed' | 'behavioral' | 'skills';

type SetupMetadata = { kind: 'setup'; job: string; count: number; focus: Focus };

type ToolPart = Parameters<typeof getToolName>[0];

const QUESTION_COUNTS = [3, 5, 7];

const FOCUS_OPTIONS: { value: Focus; label: string; hint: string }[] = [
	{ value: 'mixed', label: 'Mixed', hint: 'Both kinds of questions' },
	{ value: 'behavioral', label: 'Behavioral', hint: '“Tell me about a time…”' },
	{ value: 'skills', label: 'Skills', hint: '“How would you…”' },
];

const JOB_SUGGESTIONS = ['Registered Nurse', 'Data Scientist', 'Electrician', 'Project Manager', 'Graphic Designer'];

const READINESS: Record<InterviewReport['readiness'], { label: string; className: string }> = {
	'not-yet': { label: 'Not yet', className: 'bg-red-100 text-red-800' },
	'getting-there': { label: 'Getting there', className: 'bg-amber-100 text-amber-800' },
	ready: { label: 'Interview ready', className: 'bg-emerald-100 text-emerald-800' },
};

const PREP_LABELS: Record<string, string> = {
	searchOccupations: 'Finding the role',
	getInterviewBrief: 'Reading O*NET interview brief',
	initial_context: 'Reading coaching outline',
	knowledge_base_read: 'Reading coaching guidance',
	scoreAnswer: 'Scoring your answer',
	finishInterview: 'Writing your report',
};

function toolOutput<T>(part: ToolPart, name: string): T | null {
	return getToolName(part) === name && part.state === 'output-available' ? (part.output as T) : null;
}

function setupOf(message: UIMessage): SetupMetadata | null {
	const meta = message.metadata as SetupMetadata | undefined;
	return meta?.kind === 'setup' ? meta : null;
}

function RatingDots({ rating }: { rating: number }) {
	return (
		<span className="inline-flex gap-1" aria-label={`${rating} out of 5`}>
			{[1, 2, 3, 4, 5].map((n) => (
				<span
					key={n}
					className={`size-2.5 rounded-full ${n <= Math.round(rating) ? (rating >= 4 ? 'bg-emerald-500' : rating >= 3 ? 'bg-amber-400' : 'bg-red-400') : 'bg-slate-200'}`}
				/>
			))}
		</span>
	);
}

/** Demonstrated vs required level on O*NET's 0–7 Level scale. */
function LevelBar({ demonstrated, required }: { demonstrated: number; required: number | null }) {
	const pct = (v: number) => `${(Math.min(Math.max(v, 0), 7) / 7) * 100}%`;
	return (
		<div className="space-y-1">
			<div className="relative h-2 rounded-full bg-slate-100">
				<div className="absolute inset-y-0 left-0 rounded-full bg-slate-700" style={{ width: pct(demonstrated) }} />
				{required != null && (
					<div className="absolute -inset-y-1 w-0.5 bg-emerald-600" style={{ left: pct(required) }} title="Required level" />
				)}
			</div>
			<p className="text-xs text-slate-500">
				Demonstrated level {demonstrated.toFixed(1)}
				{required != null && <> · job needs about {required.toFixed(1)}</>} (O*NET 0–7 scale)
			</p>
		</div>
	);
}

function ScoreCard({ score }: { score: InterviewScore }) {
	return (
		<div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
			<div className="flex items-center justify-between gap-2">
				<p className="font-medium text-slate-900">
					Feedback · Question {score.questionNumber} · {score.competency}
				</p>
				<RatingDots rating={score.rating} />
			</div>
			{score.demonstratedLevel != null && (
				<LevelBar demonstrated={score.demonstratedLevel} required={score.requiredLevel} />
			)}
			{score.anchorUsed && (
				<p className="text-xs text-slate-500">
					Closest O*NET example: <span className="italic">“{score.anchorUsed}”</span>
				</p>
			)}
			<div className="grid gap-3 sm:grid-cols-2">
				{score.strengths.length > 0 && (
					<div>
						<p className="font-medium text-emerald-700">What worked</p>
						<ul className="list-disc space-y-1 pl-5 text-slate-700">
							{score.strengths.map((s) => (
								<li key={s}>{s}</li>
							))}
						</ul>
					</div>
				)}
				{score.improvements.length > 0 && (
					<div>
						<p className="font-medium text-amber-700">To improve</p>
						<ul className="list-disc space-y-1 pl-5 text-slate-700">
							{score.improvements.map((s) => (
								<li key={s}>{s}</li>
							))}
						</ul>
					</div>
				)}
			</div>
			<p className="text-slate-700">
				<span className="font-medium">Stronger answer: </span>
				{score.strongerAnswerTip}
			</p>
		</div>
	);
}

function ReportCard({ report }: { report: InterviewReport }) {
	const readiness = READINESS[report.readiness];
	return (
		<div className="space-y-4 rounded-2xl border border-slate-300 p-5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<p className="text-xs uppercase tracking-wide text-slate-500">Interview report</p>
					<p className="text-lg font-semibold text-slate-900">{report.role}</p>
				</div>
				<div className="flex items-center gap-3">
					<RatingDots rating={report.overallRating} />
					<span className="text-sm text-slate-600">{report.overallRating.toFixed(1)} / 5</span>
					<span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${readiness.className}`}>
						{readiness.label}
					</span>
				</div>
			</div>
			<p className="text-slate-700">{report.summary}</p>
			{report.strengths.length > 0 && (
				<div>
					<p className="text-sm font-medium text-emerald-700">Strengths</p>
					<ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
						{report.strengths.map((s) => (
							<li key={s}>{s}</li>
						))}
					</ul>
				</div>
			)}
			{report.focusAreas.length > 0 && (
				<div className="space-y-2">
					<p className="text-sm font-medium text-amber-700">Focus areas</p>
					{report.focusAreas.map((f) => (
						<div key={f.competency} className="rounded-lg bg-slate-50 p-3 text-sm">
							<p className="font-medium text-slate-900">{f.competency}</p>
							<p className="text-slate-700">{f.why}</p>
							<p className="mt-1 text-slate-600">
								<span className="font-medium">Practice: </span>
								{f.practice}
							</p>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function StatusChip({ part }: { part: ToolPart }) {
	const done = part.state === 'output-available';
	const failed = part.state === 'output-error';
	const input = part.input as { query?: string; code?: string; path?: string } | undefined;
	const detail = input?.query ?? input?.code ?? input?.path;
	return (
		<div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
			<span
				className={`size-2 rounded-full ${failed ? 'bg-red-500' : done ? 'bg-emerald-500' : 'animate-pulse bg-amber-400'}`}
			/>
			{PREP_LABELS[getToolName(part)] ?? getToolName(part)}
			{detail ? <code className="text-slate-500">{detail}</code> : null}
		</div>
	);
}

function SetupForm({ disabled, onStart }: { disabled: boolean; onStart: (setup: SetupMetadata) => void }) {
	const [job, setJob] = useState(() => new URLSearchParams(window.location.search).get('job') ?? '');
	const [count, setCount] = useState(5);
	const [focus, setFocus] = useState<Focus>('mixed');

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				if (job.trim()) onStart({ kind: 'setup', job: job.trim(), count, focus });
			}}
			className="space-y-6"
		>
			<div className="space-y-2">
				<label htmlFor="job" className="text-sm font-medium text-slate-900">
					What job are you interviewing for?
				</label>
				<input
					id="job"
					value={job}
					onChange={(e) => setJob(e.target.value)}
					placeholder="e.g. Registered Nurse"
					className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:border-slate-500"
				/>
				<div className="flex flex-wrap gap-2">
					{JOB_SUGGESTIONS.map((s) => (
						<button
							key={s}
							type="button"
							onClick={() => setJob(s)}
							className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-slate-400"
						>
							{s}
						</button>
					))}
				</div>
			</div>

			<fieldset className="space-y-2">
				<legend className="text-sm font-medium text-slate-900">Number of questions</legend>
				<div className="flex gap-2">
					{QUESTION_COUNTS.map((n) => (
						<button
							key={n}
							type="button"
							onClick={() => setCount(n)}
							aria-pressed={count === n}
							className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm aria-pressed:border-slate-900 aria-pressed:bg-slate-900 aria-pressed:text-white"
						>
							{n}
						</button>
					))}
				</div>
			</fieldset>

			<fieldset className="space-y-2">
				<legend className="text-sm font-medium text-slate-900">Question style</legend>
				<div className="grid gap-2 sm:grid-cols-3">
					{FOCUS_OPTIONS.map((o) => (
						<button
							key={o.value}
							type="button"
							onClick={() => setFocus(o.value)}
							aria-pressed={focus === o.value}
							className="rounded-xl border border-slate-300 p-3 text-left aria-pressed:border-slate-900 aria-pressed:ring-1 aria-pressed:ring-slate-900"
						>
							<p className="text-sm font-medium text-slate-900">{o.label}</p>
							<p className="text-xs text-slate-500">{o.hint}</p>
						</button>
					))}
				</div>
			</fieldset>

			<button
				type="submit"
				disabled={disabled || !job.trim()}
				className="rounded-xl bg-slate-900 px-5 py-2 text-white disabled:opacity-40"
			>
				Start interview
			</button>
		</form>
	);
}

export default function InterviewCoach() {
	const { messages, sendMessage, setMessages, status, error, stop, busy, verified, onVerified } =
		useVerifiedChat('/api/interview');
	const [answer, setAnswer] = useState('');
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	const setup = messages.map(setupOf).find(Boolean) ?? null;
	const toolParts = messages.flatMap((m) => m.parts.filter(isToolUIPart));
	const answered = toolParts.filter((p) => toolOutput<InterviewScore>(p, 'scoreAnswer')).length;
	const finished = toolParts.some((p) => toolOutput<InterviewReport>(p, 'finishInterview'));

	const start = (meta: SetupMetadata) => {
		sendMessage({
			text: `Start my mock interview.\nTarget job: ${meta.job}\nNumber of questions: ${meta.count}\nFocus: ${meta.focus}`,
			metadata: meta,
		});
	};

	const send = (text: string) => {
		if (!text.trim() || busy || !verified) return;
		sendMessage({ text });
		setAnswer('');
	};

	const restart = () => {
		stop();
		setMessages([]);
		setAnswer('');
	};

	return (
		<div className="mx-auto flex h-full max-w-3xl flex-col px-4">
			<header className="flex items-start justify-between gap-4 py-6">
				<div>
					<h1 className="text-2xl font-semibold text-slate-900">Mock Interview Coach</h1>
					<p className="text-sm text-slate-500">
						{setup
							? `${setup.job} · ${setup.focus} · ${finished ? 'complete' : `question ${Math.min(answered + 1, setup.count)} of ${setup.count}`}`
							: 'Practice answering questions for a real occupation, graded against O*NET skill levels.'}
					</p>
				</div>
				{setup && (
					<button
						type="button"
						onClick={restart}
						className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
					>
						New interview
					</button>
				)}
			</header>

			{setup && (
				<div className="mb-4 h-1.5 rounded-full bg-slate-100">
					<div
						className="h-full rounded-full bg-emerald-500 transition-all"
						style={{ width: `${(Math.min(answered, setup.count) / setup.count) * 100}%` }}
					/>
				</div>
			)}

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
								const score = toolOutput<InterviewScore>(part, 'scoreAnswer');
								if (score) return <ScoreCard key={i} score={score} />;
								const report = toolOutput<InterviewReport>(part, 'finishInterview');
								if (report) return <ReportCard key={i} report={report} />;
								return <StatusChip key={i} part={part} />;
							})}
						</div>
					);
				})}

				{status === 'submitted' && <p className="text-sm text-slate-400">Thinking…</p>}
				{error && (
					<p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
						{error.message || 'Something went wrong.'}
					</p>
				)}
				<div ref={bottomRef} />
			</section>

			{!verified && <HumanCheck onVerified={onVerified} />}

			{setup && (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						send(answer);
					}}
					className="flex items-end gap-2 border-t border-slate-200 py-4"
				>
					<textarea
						value={answer}
						onChange={(e) => setAnswer(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								send(answer);
							}
						}}
						rows={3}
						placeholder={
							finished
								? 'Ask for a sample answer, or retry a question…'
								: 'Your answer: the situation, what you did, and the result. Shift+Enter for a new line.'
						}
						className="flex-1 resize-none rounded-xl border border-slate-300 px-4 py-2 outline-none focus:border-slate-500"
					/>
					<div className="flex flex-col gap-2">
						{busy ? (
							<button type="button" onClick={stop} className="rounded-xl bg-slate-200 px-4 py-2 text-slate-700">
								Stop
							</button>
						) : (
							<button
								type="submit"
								disabled={!answer.trim() || !verified}
								className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-40"
							>
								Send
							</button>
						)}
						{!finished && !busy && answered > 0 && (
							<button
								type="button"
								onClick={() => send('Please end the interview now and give me my report.')}
								disabled={!verified}
								className="rounded-xl px-4 py-1 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-40"
							>
								End early
							</button>
						)}
					</div>
				</form>
			)}
		</div>
	);
}
