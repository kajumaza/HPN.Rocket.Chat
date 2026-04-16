import {
	Box,
	Button,
	ButtonGroup,
	Field,
	FieldLabel,
	FieldRow,
	Select,
	Skeleton,
	Tag,
	Tabs,
	TabsItem,
	TextAreaInput,
	TextInput,
} from '@rocket.chat/fuselage';
import { Page, PageHeader, PageScrollableContentWithShadow } from '@rocket.chat/ui-client';
import { useSetting } from '@rocket.chat/ui-contexts';
import { Meteor } from 'meteor/meteor';
import type { ReactElement } from 'react';
import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type PollOption = { text: string; votes: string[]; voteCount: number };
type Poll = {
	_id: string;
	question: string;
	options: PollOption[];
	closed: boolean;
	anonymous: boolean;
	audience: string;
	createdAt: string;
};

type SurveyQuestion = {
	type: 'single' | 'multiple' | 'text' | 'rating';
	text: string;
	options?: string[];
};
type Survey = {
	_id: string;
	title: string;
	description: string;
	questions: SurveyQuestion[];
	questionCount: number;
	audience: string;
	status: 'active' | 'closed';
};

type SurveyResultAgg =
	| { questionIndex: number; type: 'single' | 'multiple'; text: string; counts: Record<string, number> }
	| { questionIndex: number; type: 'rating'; text: string; average: number; count: number }
	| { questionIndex: number; type: 'text'; text: string; responses: string[] };

type SurveyResults = {
	survey: Survey;
	responseCount: number;
	aggregated: SurveyResultAgg[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const PERM_OPTIONS: [string, string][] = [
	['everyone', 'Everyone'],
	['paid', 'Paid Members'],
	['admin', 'Admins Only'],
];

const AUDIENCE_OPTIONS: [string, string][] = [
	['everyone', 'Everyone'],
	['hpn-student', 'HR Students Only'],
	['hpn-manager', 'HR Managers Only'],
	['hpn-executive', 'HR Executives Only'],
	['hpn-supplier', 'Suppliers Only'],
	['admin', 'Admins Only'],
];

function audienceLabel(audience: string): string {
	return AUDIENCE_OPTIONS.find(([v]) => v === audience)?.[1] ?? audience;
}

// ---------------------------------------------------------------------------
// Export helpers (standalone, outside components)
// ---------------------------------------------------------------------------
function exportSurveyCSV(results: SurveyResults) {
	const rows: string[][] = [['Question', 'Type', 'Option/Response', 'Count/Value']];
	results.aggregated.forEach((agg) => {
		if (agg.type === 'single' || agg.type === 'multiple') {
			Object.entries((agg as any).counts).forEach(([opt, count]) => {
				rows.push([agg.text, agg.type, opt, String(count)]);
			});
		} else if (agg.type === 'rating') {
			rows.push([agg.text, 'rating', 'Average', String((agg as any).average)]);
		} else {
			((agg as any).responses as string[]).forEach((r: string) => {
				rows.push([agg.text, 'text', r, '']);
			});
		}
	});
	const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
	const blob = new Blob([csv], { type: 'text/csv' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a'); a.href = url; a.download = `survey-${results.survey._id}.csv`; a.click();
	URL.revokeObjectURL(url);
}

function exportSurveyJSON(results: SurveyResults) {
	const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a'); a.href = url; a.download = `survey-${results.survey._id}.json`; a.click();
	URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Post to Rooms Modal
// ---------------------------------------------------------------------------
const AUDIENCE_ROOM_MAP: Record<string, string> = {
	everyone: 'hpn-general',
	'hpn-student': 'hpn-students',
	'hpn-manager': 'hpn-managers',
	'hpn-executive': 'hpn-executives',
	admin: 'hpn-admin',
};

function PostToRoomsModal({
	onClose,
	onPost,
	label,
	audience,
}: {
	onClose: () => void;
	onPost: (roomIds: string[], pin: boolean) => Promise<void>;
	label: string;
	audience?: string;
}): ReactElement {
	const [rooms, setRooms] = useState<{ _id: string; name: string; type: string }[]>([]);
	const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
	const [pin, setPin] = useState(false);
	const [posting, setPosting] = useState(false);

	useEffect(() => {
		Meteor.callAsync('hpn/rooms/list').then((r: any) => {
			const loaded = r ?? [];
			setRooms(loaded);
			// Pre-select the room matching the audience
			if (audience && AUDIENCE_ROOM_MAP[audience]) {
				const suggestedName = AUDIENCE_ROOM_MAP[audience];
				const match = loaded.find((room: any) => room.name === suggestedName);
				if (match) setSelectedRooms([match._id]);
			}
		}).catch(console.error);
	}, [audience]);

	const toggle = (id: string) => setSelectedRooms((prev) =>
		prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
	);

	const handlePost = async () => {
		if (selectedRooms.length === 0) return;
		setPosting(true);
		try {
			await onPost(selectedRooms, pin);
			onClose();
		} catch (e: any) { console.error(e); }
		finally { setPosting(false); }
	};

	return (
		<Box
			style={{
				position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
				background: 'rgba(0,0,0,0.5)', zIndex: 1000,
				display: 'flex', alignItems: 'center', justifyContent: 'center',
			}}
			onClick={onClose}
		>
			<Box
				p={24}
				style={{ background: '#fff', borderRadius: 8, minWidth: 360, maxWidth: 480, maxHeight: '80vh', overflowY: 'auto' }}
				onClick={(e: any) => e.stopPropagation()}
			>
				<Box fontWeight='700' fontSize='x16' mb={16}>Post "{label}" to Rooms</Box>
				<Box mb={8} fontWeight='600' fontSize='x13'>Select rooms:</Box>
				<Box mb={12} style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4, padding: 8 }}>
					{rooms.map((room) => (
						<Box key={room._id} display='flex' alignItems='center' mb={6} style={{ gap: 8 }}>
							<input
								type='checkbox'
								id={`room-${room._id}`}
								checked={selectedRooms.includes(room._id)}
								onChange={() => toggle(room._id)}
							/>
							<label htmlFor={`room-${room._id}`} style={{ cursor: 'pointer', fontSize: 13 }}>
								{room.type === 'c' ? '#' : '🔒'} {room.name}
							</label>
						</Box>
					))}
				</Box>
				<Box display='flex' alignItems='center' mb={16} style={{ gap: 8 }}>
					<input type='checkbox' id='pin-msg' checked={pin} onChange={(e) => setPin(e.target.checked)} />
					<label htmlFor='pin-msg' style={{ cursor: 'pointer', fontSize: 13 }}>Pin message in selected rooms</label>
				</Box>
				<ButtonGroup>
					<Button primary onClick={handlePost} disabled={posting || selectedRooms.length === 0}>
						{posting ? 'Posting...' : `Post to ${selectedRooms.length} room${selectedRooms.length !== 1 ? 's' : ''}`}
					</Button>
					<Button onClick={onClose}>Cancel</Button>
				</ButtonGroup>
			</Box>
		</Box>
	);
}

// ---------------------------------------------------------------------------
// Create Poll Form (admin)
// ---------------------------------------------------------------------------
function AdminCreatePollForm({ onCreated }: { onCreated: () => void }): ReactElement {
	const [question, setQuestion] = useState('');
	const [options, setOptions] = useState(['', '']);
	const [anonymous, setAnonymous] = useState(false);
	const [audience, setAudience] = useState('everyone');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	const addOption = () => {
		if (options.length < 10) setOptions((p) => [...p, '']);
	};
	const updateOption = (idx: number, val: string) =>
		setOptions((p) => p.map((o, i) => (i === idx ? val : o)));
	const removeOption = (idx: number) => {
		if (options.length <= 2) return;
		setOptions((p) => p.filter((_, i) => i !== idx));
	};

	const handleSubmit = async () => {
		setError('');
		const filtered = options.map((o) => o.trim()).filter(Boolean);
		if (!question.trim()) { setError('Question is required'); return; }
		if (filtered.length < 2) { setError('At least 2 options required'); return; }
		setSubmitting(true);
		try {
			await Meteor.callAsync('hpn/poll/create', { question: question.trim(), options: filtered, anonymous, audience });
			setQuestion(''); setOptions(['', '']); setAnonymous(false); setAudience('everyone');
			onCreated();
		} catch (e: any) {
			setError(e.reason ?? e.message ?? 'Error');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Box p={16} mb={16} style={{ border: '1px solid #e0e0e0', borderRadius: 8, background: '#fafafa' }}>
			<Box fontWeight='700' mb={10}>Create Poll</Box>
			{error && <Box mb={8} style={{ color: '#C41230' }}>{error}</Box>}
			<Field mb={8}>
				<FieldLabel>Question</FieldLabel>
				<FieldRow>
					<TextInput value={question} onChange={(e: any) => setQuestion(e.currentTarget.value)} placeholder='Question...' />
				</FieldRow>
			</Field>
			<Box mb={6} fontWeight='600' fontSize='x13'>Options</Box>
			{options.map((opt, idx) => (
				<Box key={idx} display='flex' alignItems='center' mb={6} style={{ gap: 8 }}>
					<TextInput value={opt} onChange={(e: any) => updateOption(idx, e.currentTarget.value)} placeholder={`Option ${idx + 1}`} />
					{options.length > 2 && <Button small danger onClick={() => removeOption(idx)}>Remove</Button>}
				</Box>
			))}
			{options.length < 10 && <Button small onClick={addOption} mb={8}>+ Add option</Button>}
			<Field mb={8}>
				<FieldLabel>Audience</FieldLabel>
				<FieldRow>
					<Select value={audience} onChange={(val: any) => setAudience(val)} options={AUDIENCE_OPTIONS} />
				</FieldRow>
			</Field>
			<Box display='flex' alignItems='center' mb={12} style={{ gap: 8 }}>
				<input type='checkbox' id='adm-poll-anon' checked={anonymous} onChange={(e) => setAnonymous(e.currentTarget.checked)} />
				<label htmlFor='adm-poll-anon' style={{ cursor: 'pointer', fontSize: 13 }}>Anonymous</label>
			</Box>
			<Button primary onClick={handleSubmit} disabled={submitting}>{submitting ? 'Creating...' : 'Create Poll'}</Button>
		</Box>
	);
}

// ---------------------------------------------------------------------------
// VoteBar
// ---------------------------------------------------------------------------
function VoteBar({ pct }: { pct: number }): ReactElement {
	return (
		<Box style={{ height: 6, borderRadius: 3, backgroundColor: '#eee', margin: '4px 0' }}>
			<Box style={{ height: '100%', borderRadius: 3, backgroundColor: '#C41230', width: `${pct}%`, transition: 'width 0.3s' }} />
		</Box>
	);
}

// ---------------------------------------------------------------------------
// Poll Row (admin) — with View Results, Export CSV/JSON, Post to Rooms
// ---------------------------------------------------------------------------
function AdminPollRow({ poll, onAction }: { poll: Poll; onAction: () => void }): ReactElement {
	const totalVotes = poll.options.reduce((sum, o) => sum + (o.voteCount ?? 0), 0);
	const [acting, setActing] = useState(false);
	const [results, setResults] = useState<any>(null);
	const [loadingResults, setLoadingResults] = useState(false);
	const [showPostModal, setShowPostModal] = useState(false);

	const loadResults = async () => {
		if (results) { setResults(null); return; }
		setLoadingResults(true);
		try {
			const r = await Meteor.callAsync('hpn/poll/results', poll._id);
			setResults(r);
		} catch (e: any) { console.error(e); }
		finally { setLoadingResults(false); }
	};

	const exportJSON = () => {
		if (!results) return;
		const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a'); a.href = url; a.download = `poll-${poll._id}.json`; a.click();
		URL.revokeObjectURL(url);
	};

	const exportCSV = () => {
		if (!results) return;
		const rows = [['Option', 'Votes', 'Percentage'], ...results.options.map((o: any) => [o.text, o.voteCount, `${o.pct}%`])];
		const csv = rows.map((r) => r.join(',')).join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a'); a.href = url; a.download = `poll-${poll._id}.csv`; a.click();
		URL.revokeObjectURL(url);
	};

	const close = async () => {
		setActing(true);
		try { await Meteor.callAsync('hpn/poll/close', poll._id); onAction(); }
		catch (e: any) { console.error(e); }
		finally { setActing(false); }
	};
	const del = async () => {
		if (!window.confirm('Delete this poll?')) return;
		setActing(true);
		try { await Meteor.callAsync('hpn/poll/delete', poll._id); onAction(); }
		catch (e: any) { console.error(e); }
		finally { setActing(false); }
	};

	return (
		<Box mb={10}>
			<Box p={14} style={{ border: '1px solid #e0e0e0', borderRadius: 8, background: '#fff' }}>
				<Box display='flex' justifyContent='space-between' alignItems='center' mb={6}>
					<Box fontWeight='700' fontSize='x14'>{poll.question}</Box>
					<Box display='flex' style={{ gap: 6 }}>
						{poll.closed ? <Tag variant='danger'>Closed</Tag> : <Tag variant='primary'>Open</Tag>}
						{poll.anonymous && <Tag variant='secondary'>Anon</Tag>}
					</Box>
				</Box>
				<Box fontSize='x12' mb={8} style={{ color: '#888' }}>
					{poll.options.length} options · {totalVotes} votes · 👥 {audienceLabel(poll.audience ?? 'everyone')}
				</Box>
				<ButtonGroup>
					<Button small onClick={loadResults} disabled={loadingResults}>
						{results ? 'Hide Results' : loadingResults ? 'Loading...' : 'View Results'}
					</Button>
					<Button small onClick={() => setShowPostModal(true)}>Post to Rooms</Button>
					{!poll.closed && <Button small onClick={close} disabled={acting}>Close</Button>}
					<Button small danger onClick={del} disabled={acting}>Delete</Button>
				</ButtonGroup>
			</Box>
			{results && (
				<Box p={14} style={{ border: '1px solid #C41230', borderRadius: 8, background: '#fff8f8', marginTop: 4 }}>
					<Box display='flex' justifyContent='space-between' alignItems='center' mb={8}>
						<Box fontWeight='700'>{results.question} — Results</Box>
						<ButtonGroup>
							<Button small onClick={exportCSV}>Export CSV</Button>
							<Button small onClick={exportJSON}>Export JSON</Button>
						</ButtonGroup>
					</Box>
					<Box mb={6} fontSize='x12' style={{ color: '#888' }}>{results.totalVotes} total votes</Box>
					{results.options.map((opt: any, i: number) => (
						<Box key={i} mb={8}>
							<Box display='flex' justifyContent='space-between' fontSize='x13'>
								<span>{opt.text}</span>
								<span>{opt.voteCount} ({opt.pct}%)</span>
							</Box>
							<Box style={{ height: 6, borderRadius: 3, backgroundColor: '#eee', margin: '4px 0' }}>
								<Box style={{ height: '100%', borderRadius: 3, backgroundColor: '#C41230', width: `${opt.pct}%`, transition: 'width 0.3s' }} />
							</Box>
						</Box>
					))}
				</Box>
			)}
			{showPostModal && (
				<PostToRoomsModal
					label={poll.question}
					audience={poll.audience}
					onClose={() => setShowPostModal(false)}
					onPost={(roomIds, pin) => Meteor.callAsync('hpn/poll/post-to-rooms', { pollId: poll._id, roomIds, pin })}
				/>
			)}
		</Box>
	);
}

// ---------------------------------------------------------------------------
// Question builder
// ---------------------------------------------------------------------------
type DraftQuestion = {
	type: 'single' | 'multiple' | 'text' | 'rating';
	text: string;
	options: string[];
};

const emptyQuestion = (): DraftQuestion => ({ type: 'single', text: '', options: ['', ''] });

function QuestionBuilder({
	questions,
	onChange,
}: {
	questions: DraftQuestion[];
	onChange: (qs: DraftQuestion[]) => void;
}): ReactElement {
	const updateQ = (idx: number, patch: Partial<DraftQuestion>) =>
		onChange(questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)));

	const updateOpt = (qIdx: number, oIdx: number, val: string) => {
		const opts = questions[qIdx].options.map((o, i) => (i === oIdx ? val : o));
		updateQ(qIdx, { options: opts });
	};

	const addOpt = (qIdx: number) => {
		if (questions[qIdx].options.length >= 10) return;
		updateQ(qIdx, { options: [...questions[qIdx].options, ''] });
	};

	const removeOpt = (qIdx: number, oIdx: number) => {
		if (questions[qIdx].options.length <= 2) return;
		updateQ(qIdx, { options: questions[qIdx].options.filter((_, i) => i !== oIdx) });
	};

	const removeQ = (idx: number) => onChange(questions.filter((_, i) => i !== idx));
	const addQ = () => onChange([...questions, emptyQuestion()]);

	const typeOptions: [string, string][] = [
		['single', 'Single Choice'],
		['multiple', 'Multiple Choice'],
		['text', 'Text'],
		['rating', 'Rating (1–5)'],
	];

	return (
		<Box>
			{questions.map((q, idx) => (
				<Box key={idx} p={12} mb={10} style={{ border: '1px solid #ddd', borderRadius: 6, background: '#fafafa' }}>
					<Box display='flex' justifyContent='space-between' alignItems='center' mb={8}>
						<Box fontWeight='600' fontSize='x13'>Question {idx + 1}</Box>
						<Button small danger onClick={() => removeQ(idx)}>Remove</Button>
					</Box>
					<Field mb={8}>
						<FieldLabel>Type</FieldLabel>
						<FieldRow>
							<Select
								value={q.type}
								onChange={(val: any) => updateQ(idx, { type: val as DraftQuestion['type'] })}
								options={typeOptions}
							/>
						</FieldRow>
					</Field>
					<Field mb={8}>
						<FieldLabel>Question text</FieldLabel>
						<FieldRow>
							<TextInput value={q.text} onChange={(e: any) => updateQ(idx, { text: e.currentTarget.value })} placeholder='Question...' />
						</FieldRow>
					</Field>
					{(q.type === 'single' || q.type === 'multiple') && (
						<Box>
							<Box fontWeight='600' fontSize='x12' mb={6}>Options</Box>
							{q.options.map((opt, oIdx) => (
								<Box key={oIdx} display='flex' alignItems='center' mb={4} style={{ gap: 8 }}>
									<TextInput value={opt} onChange={(e: any) => updateOpt(idx, oIdx, e.currentTarget.value)} placeholder={`Option ${oIdx + 1}`} />
									{q.options.length > 2 && <Button small danger onClick={() => removeOpt(idx, oIdx)}>×</Button>}
								</Box>
							))}
							{q.options.length < 10 && <Button small onClick={() => addOpt(idx)} mt={4}>+ Add option</Button>}
						</Box>
					)}
				</Box>
			))}
			<Button onClick={addQ} mb={8}>+ Add Question</Button>
		</Box>
	);
}

// ---------------------------------------------------------------------------
// Create Survey Form
// ---------------------------------------------------------------------------
function AdminCreateSurveyForm({ onCreated }: { onCreated: () => void }): ReactElement {
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
	const [audience, setAudience] = useState('everyone');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	const handleSubmit = async () => {
		setError('');
		if (!title.trim()) { setError('Title is required'); return; }
		if (questions.length === 0) { setError('At least one question required'); return; }

		const payload = questions.map((q) => ({
			type: q.type,
			text: q.text.trim(),
			...(q.type === 'single' || q.type === 'multiple'
				? { options: q.options.map((o) => o.trim()).filter(Boolean) }
				: {}),
		}));

		setSubmitting(true);
		try {
			await Meteor.callAsync('hpn/survey/create', { title: title.trim(), description: description.trim(), questions: payload, audience });
			setTitle(''); setDescription(''); setQuestions([emptyQuestion()]); setAudience('everyone');
			onCreated();
		} catch (e: any) {
			setError(e.reason ?? e.message ?? 'Error');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Box p={16} mb={16} style={{ border: '1px solid #e0e0e0', borderRadius: 8, background: '#fafafa' }}>
			<Box fontWeight='700' mb={10}>Create Survey</Box>
			{error && <Box mb={8} style={{ color: '#C41230' }}>{error}</Box>}
			<Field mb={8}>
				<FieldLabel>Title</FieldLabel>
				<FieldRow>
					<TextInput value={title} onChange={(e: any) => setTitle(e.currentTarget.value)} placeholder='Survey title...' />
				</FieldRow>
			</Field>
			<Field mb={12}>
				<FieldLabel>Description</FieldLabel>
				<FieldRow>
					<TextAreaInput value={description} onChange={(e: any) => setDescription(e.currentTarget.value)} placeholder='Optional description...' rows={2} />
				</FieldRow>
			</Field>
			<Field mb={12}>
				<FieldLabel>Audience</FieldLabel>
				<FieldRow>
					<Select value={audience} onChange={(val: any) => setAudience(val)} options={AUDIENCE_OPTIONS} />
				</FieldRow>
			</Field>
			<Box fontWeight='600' mb={8}>Questions</Box>
			<QuestionBuilder questions={questions} onChange={setQuestions} />
			<ButtonGroup mt={8}>
				<Button primary onClick={handleSubmit} disabled={submitting}>{submitting ? 'Creating...' : 'Create Survey'}</Button>
			</ButtonGroup>
		</Box>
	);
}

// ---------------------------------------------------------------------------
// Survey Results Breakdown
// ---------------------------------------------------------------------------
function SurveyResultsView({ results }: { results: SurveyResults }): ReactElement {
	return (
		<Box p={14} mb={10} style={{ border: '1px solid #C41230', borderRadius: 8, background: '#fff8f8' }}>
			<Box fontWeight='700' mb={6}>{results.survey.title} — Results</Box>
			<Box mb={10} fontSize='x12' style={{ color: '#888' }}>{results.responseCount} responses</Box>
			{results.aggregated.map((agg) => (
				<Box key={agg.questionIndex} mb={14}>
					<Box fontWeight='600' fontSize='x13' mb={6}>{agg.questionIndex + 1}. {agg.text}</Box>
					{(agg.type === 'single' || agg.type === 'multiple') && (() => {
						const total = Object.values(agg.counts).reduce((a, b) => a + b, 0);
						return Object.entries(agg.counts).map(([opt, count]) => {
							const pct = total > 0 ? Math.round((count / total) * 100) : 0;
							return (
								<Box key={opt} mb={6}>
									<Box display='flex' justifyContent='space-between' fontSize='x12'>
										<span>{opt}</span>
										<span>{count} ({pct}%)</span>
									</Box>
									<VoteBar pct={pct} />
								</Box>
							);
						});
					})()}
					{agg.type === 'rating' && (
						<Box fontSize='x13'>
							Average: <strong>{(agg as any).average}/5</strong> ({(agg as any).count} answers)
						</Box>
					)}
					{agg.type === 'text' && (
						<Box>
							{((agg as any).responses as string[]).length === 0 ? (
								<Box fontSize='x12' style={{ color: '#aaa' }}>No responses yet.</Box>
							) : (
								((agg as any).responses as string[]).map((r, i) => (
									<Box key={i} p={8} mb={4} style={{ background: '#f5f5f5', borderRadius: 4, fontSize: 13 }}>
										{r}
									</Box>
								))
							)}
						</Box>
					)}
				</Box>
			))}
		</Box>
	);
}

// ---------------------------------------------------------------------------
// Survey Row (admin) — with always-fresh results, Refresh, Export, Post to Rooms
// ---------------------------------------------------------------------------
function AdminSurveyRow({ survey, onAction }: { survey: Survey; onAction: () => void }): ReactElement {
	const [acting, setActing] = useState(false);
	const [results, setResults] = useState<SurveyResults | null>(null);
	const [loadingResults, setLoadingResults] = useState(false);
	const [showPostModal, setShowPostModal] = useState(false);

	const loadResults = async () => {
		if (results && !loadingResults) { setResults(null); return; } // toggle off
		setLoadingResults(true);
		try {
			const r = await Meteor.callAsync('hpn/survey/results', survey._id);
			setResults(r as SurveyResults);
		} catch (e: any) { console.error(e); }
		finally { setLoadingResults(false); }
	};

	const refreshResults = async () => {
		setLoadingResults(true);
		try {
			const r = await Meteor.callAsync('hpn/survey/results', survey._id);
			setResults(r as SurveyResults);
		} catch (e: any) { console.error(e); }
		finally { setLoadingResults(false); }
	};

	const close = async () => {
		setActing(true);
		try { await Meteor.callAsync('hpn/survey/close', survey._id); onAction(); }
		catch (e: any) { console.error(e); }
		finally { setActing(false); }
	};
	const del = async () => {
		if (!window.confirm('Delete this survey and all responses?')) return;
		setActing(true);
		try { await Meteor.callAsync('hpn/survey/delete', survey._id); onAction(); }
		catch (e: any) { console.error(e); }
		finally { setActing(false); }
	};

	return (
		<Box mb={10}>
			<Box p={14} style={{ border: '1px solid #e0e0e0', borderRadius: 8, background: '#fff' }}>
				<Box display='flex' justifyContent='space-between' alignItems='center' mb={6}>
					<Box fontWeight='700' fontSize='x14'>{survey.title}</Box>
					<Tag variant={survey.status === 'active' ? 'primary' : 'danger'}>
						{survey.status === 'active' ? 'Active' : 'Closed'}
					</Tag>
				</Box>
				{survey.description && (
					<Box fontSize='x12' mb={6} style={{ color: '#555' }}>{survey.description}</Box>
				)}
				<Box fontSize='x12' mb={8} style={{ color: '#888' }}>
					{survey.questionCount} question{survey.questionCount !== 1 ? 's' : ''} · 👥 {audienceLabel(survey.audience ?? 'everyone')}
				</Box>
				<ButtonGroup>
					<Button small onClick={loadResults} disabled={loadingResults}>
						{results ? 'Hide Results' : loadingResults ? 'Loading...' : 'View Results'}
					</Button>
					{results && <Button small onClick={refreshResults} disabled={loadingResults}>↻ Refresh</Button>}
					{results && <Button small onClick={() => exportSurveyCSV(results)}>CSV</Button>}
					{results && <Button small onClick={() => exportSurveyJSON(results)}>JSON</Button>}
					<Button small onClick={() => setShowPostModal(true)}>Post to Rooms</Button>
					{survey.status === 'active' && <Button small onClick={close} disabled={acting}>Close</Button>}
					<Button small danger onClick={del} disabled={acting}>Delete</Button>
				</ButtonGroup>
			</Box>
			{loadingResults && <Skeleton mt={4} />}
			{results && <SurveyResultsView results={results} />}
			{showPostModal && (
				<PostToRoomsModal
					label={survey.title}
					audience={survey.audience}
					onClose={() => setShowPostModal(false)}
					onPost={(roomIds, pin) => Meteor.callAsync('hpn/survey/post-to-rooms', { surveyId: survey._id, roomIds, pin })}
				/>
			)}
		</Box>
	);
}

// ---------------------------------------------------------------------------
// Permissions Tab
// ---------------------------------------------------------------------------
function PermissionsTab(): ReactElement {
	const currentPollPerm = useSetting('HPN_Poll_Create_Permission', 'admin') as string;
	const currentSurveyPerm = useSetting('HPN_Survey_Create_Permission', 'admin') as string;
	const [pollPerm, setPollPerm] = useState(currentPollPerm);
	const [surveyPerm, setSurveyPerm] = useState(currentSurveyPerm);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState('');

	// Sync when settings load
	useEffect(() => { setPollPerm(currentPollPerm); }, [currentPollPerm]);
	useEffect(() => { setSurveyPerm(currentSurveyPerm); }, [currentSurveyPerm]);

	const handleSave = async () => {
		setSaving(true);
		setSaved(false);
		setError('');
		try {
			await Meteor.callAsync('hpn/settings/polls/save', {
				pollPermission: pollPerm,
				surveyPermission: surveyPerm,
			});
			setSaved(true);
			setTimeout(() => setSaved(false), 3000);
		} catch (e: any) {
			setError(e.reason ?? e.message ?? 'Save failed');
		} finally {
			setSaving(false);
		}
	};

	const permOptions: [string, string][] = PERM_OPTIONS;

	return (
		<Box maxWidth={480} pt={16}>
			<Box fontWeight='700' fontSize='x16' mb={16}>Poll &amp; Survey Permissions</Box>
			{error && <Box mb={8} style={{ color: '#C41230' }}>{error}</Box>}
			{saved && <Box mb={8} style={{ color: '#27ae60' }}>Settings saved.</Box>}
			<Field mb={16}>
				<FieldLabel>Who can create polls</FieldLabel>
				<FieldRow>
					<Select value={pollPerm} onChange={(val: any) => setPollPerm(val)} options={permOptions} />
				</FieldRow>
			</Field>
			<Field mb={20}>
				<FieldLabel>Who can create surveys</FieldLabel>
				<FieldRow>
					<Select value={surveyPerm} onChange={(val: any) => setSurveyPerm(val)} options={permOptions} />
				</FieldRow>
			</Field>
			<Button primary onClick={handleSave} disabled={saving}>
				{saving ? 'Saving...' : 'Save'}
			</Button>
		</Box>
	);
}

// ---------------------------------------------------------------------------
// Main Admin Page
// ---------------------------------------------------------------------------
const HpnPollsAdminPage = (): ReactElement => {
	const [activeTab, setActiveTab] = useState<'polls' | 'surveys' | 'permissions'>('polls');
	const [polls, setPolls] = useState<Poll[]>([]);
	const [surveys, setSurveys] = useState<Survey[]>([]);
	const [loadingPolls, setLoadingPolls] = useState(true);
	const [loadingSurveys, setLoadingSurveys] = useState(true);
	const [showCreatePoll, setShowCreatePoll] = useState(false);
	const [showCreateSurvey, setShowCreateSurvey] = useState(false);

	const loadPolls = useCallback(async () => {
		setLoadingPolls(true);
		try {
			const result = await Meteor.callAsync('hpn/poll/list', { includeAll: true });
			setPolls((result as Poll[]) ?? []);
		} finally {
			setLoadingPolls(false);
		}
	}, []);

	const loadSurveys = useCallback(async () => {
		setLoadingSurveys(true);
		try {
			const result = await Meteor.callAsync('hpn/survey/admin/list');
			setSurveys((result as Survey[]) ?? []);
		} finally {
			setLoadingSurveys(false);
		}
	}, []);

	useEffect(() => { loadPolls(); }, [loadPolls]);
	useEffect(() => { loadSurveys(); }, [loadSurveys]);

	return (
		<Page>
			<PageHeader title='Polls &amp; Surveys — Admin' />
			<PageScrollableContentWithShadow>
				<Box maxWidth={820} margin='0 auto' p={16}>
					<Tabs>
						<TabsItem selected={activeTab === 'polls'} onClick={() => setActiveTab('polls')}>Polls</TabsItem>
						<TabsItem selected={activeTab === 'surveys'} onClick={() => setActiveTab('surveys')}>Surveys</TabsItem>
						<TabsItem selected={activeTab === 'permissions'} onClick={() => setActiveTab('permissions')}>Permissions</TabsItem>
					</Tabs>

					<Box mt={16}>
						{activeTab === 'polls' && (
							<>
								<Box mb={12}>
									{!showCreatePoll ? (
										<Button primary onClick={() => setShowCreatePoll(true)}>+ Create Poll</Button>
									) : (
										<>
											<AdminCreatePollForm onCreated={() => { setShowCreatePoll(false); loadPolls(); }} />
											<Button onClick={() => setShowCreatePoll(false)} mb={8}>Cancel</Button>
										</>
									)}
								</Box>
								{loadingPolls ? (
									<><Skeleton mb={8} /><Skeleton mb={8} /></>
								) : polls.length === 0 ? (
									<Box style={{ color: '#888', textAlign: 'center', padding: 32 }}>No polls yet.</Box>
								) : (
									polls.map((poll) => (
										<AdminPollRow key={poll._id} poll={poll} onAction={loadPolls} />
									))
								)}
							</>
						)}

						{activeTab === 'surveys' && (
							<>
								<Box mb={12}>
									{!showCreateSurvey ? (
										<Button primary onClick={() => setShowCreateSurvey(true)}>+ Create Survey</Button>
									) : (
										<>
											<AdminCreateSurveyForm onCreated={() => { setShowCreateSurvey(false); loadSurveys(); }} />
											<Button onClick={() => setShowCreateSurvey(false)} mb={8}>Cancel</Button>
										</>
									)}
								</Box>
								{loadingSurveys ? (
									<><Skeleton mb={8} /><Skeleton mb={8} /></>
								) : surveys.length === 0 ? (
									<Box style={{ color: '#888', textAlign: 'center', padding: 32 }}>No surveys yet.</Box>
								) : (
									surveys.map((survey) => (
										<AdminSurveyRow key={survey._id} survey={survey} onAction={loadSurveys} />
									))
								)}
							</>
						)}

						{activeTab === 'permissions' && <PermissionsTab />}
					</Box>
				</Box>
			</PageScrollableContentWithShadow>
		</Page>
	);
};

export default HpnPollsAdminPage;
