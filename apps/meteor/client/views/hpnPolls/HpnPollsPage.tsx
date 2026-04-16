import {
	Box,
	Button,
	ButtonGroup,
	Field,
	FieldLabel,
	FieldRow,
	Skeleton,
	Tag,
	TextInput,
	Tabs,
	TabsItem,
} from '@rocket.chat/fuselage';
import { Page, PageHeader, PageScrollableContentWithShadow } from '@rocket.chat/ui-client';
import { useUserId, useUser, useSetting } from '@rocket.chat/ui-contexts';
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
	hasResponded: boolean;
	status: 'active' | 'closed';
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const PAID_ROLES = ['hpn-student', 'hpn-manager', 'hpn-executive', 'hpn-supplier', 'admin'];

function canCreate(permission: string, roles: string[]): boolean {
	if (permission === 'everyone') return true;
	if (permission === 'paid') return PAID_ROLES.some((r) => roles.includes(r));
	return roles.includes('admin');
}

// ---------------------------------------------------------------------------
// Vote bar
// ---------------------------------------------------------------------------
function VoteBar({ pct }: { pct: number }): ReactElement {
	return (
		<Box style={{ height: 6, borderRadius: 3, backgroundColor: '#eee', margin: '4px 0' }}>
			<Box
				style={{
					height: '100%',
					borderRadius: 3,
					backgroundColor: '#C41230',
					width: `${pct}%`,
					transition: 'width 0.3s',
				}}
			/>
		</Box>
	);
}

// ---------------------------------------------------------------------------
// Create Poll Form
// ---------------------------------------------------------------------------
function CreatePollForm({ onCreated }: { onCreated: () => void }): ReactElement {
	const [question, setQuestion] = useState('');
	const [options, setOptions] = useState(['', '']);
	const [anonymous, setAnonymous] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	const addOption = () => {
		if (options.length < 10) setOptions((prev) => [...prev, '']);
	};

	const updateOption = (idx: number, val: string) => {
		setOptions((prev) => prev.map((o, i) => (i === idx ? val : o)));
	};

	const removeOption = (idx: number) => {
		if (options.length <= 2) return;
		setOptions((prev) => prev.filter((_, i) => i !== idx));
	};

	const handleSubmit = async () => {
		setError('');
		const filteredOptions = options.map((o) => o.trim()).filter(Boolean);
		if (!question.trim()) { setError('Question is required'); return; }
		if (filteredOptions.length < 2) { setError('At least 2 options required'); return; }
		setSubmitting(true);
		try {
			await Meteor.callAsync('hpn/poll/create', { question: question.trim(), options: filteredOptions, anonymous });
			setQuestion('');
			setOptions(['', '']);
			setAnonymous(false);
			onCreated();
		} catch (e: any) {
			setError(e.reason ?? e.message ?? 'Failed to create poll');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Box
			p={16}
			mb={16}
			style={{ border: '1px solid #e0e0e0', borderRadius: 8, background: '#fafafa' }}
		>
			<Box fontWeight='700' fontSize='x16' mb={12}>
				Create Poll
			</Box>
			{error && (
				<Box mb={8} style={{ color: '#C41230' }}>
					{error}
				</Box>
			)}
			<Field mb={8}>
				<FieldLabel>Question</FieldLabel>
				<FieldRow>
					<TextInput value={question} onChange={(e: any) => setQuestion(e.currentTarget.value)} placeholder='What would you like to ask?' />
				</FieldRow>
			</Field>
			<Box mb={8} fontWeight='600' fontSize='x13'>
				Options
			</Box>
			{options.map((opt, idx) => (
				<Box key={idx} display='flex' alignItems='center' mb={6} style={{ gap: 8 }}>
					<TextInput
						value={opt}
						onChange={(e: any) => updateOption(idx, e.currentTarget.value)}
						placeholder={`Option ${idx + 1}`}
					/>
					{options.length > 2 && (
						<Button small danger onClick={() => removeOption(idx)}>
							Remove
						</Button>
					)}
				</Box>
			))}
			{options.length < 10 && (
				<Button small onClick={addOption} mb={8}>
					+ Add option
				</Button>
			)}
			<Box display='flex' alignItems='center' mb={12} style={{ gap: 8 }}>
				<input
					type='checkbox'
					id='poll-anon'
					checked={anonymous}
					onChange={(e) => setAnonymous(e.currentTarget.checked)}
				/>
				<label htmlFor='poll-anon' style={{ cursor: 'pointer', fontSize: 13 }}>
					Anonymous poll (hide voter names)
				</label>
			</Box>
			<ButtonGroup>
				<Button primary onClick={handleSubmit} disabled={submitting}>
					{submitting ? 'Creating...' : 'Create Poll'}
				</Button>
			</ButtonGroup>
		</Box>
	);
}

// ---------------------------------------------------------------------------
// Poll Card
// ---------------------------------------------------------------------------
function PollCard({
	poll,
	userId,
	onVoted,
}: {
	poll: Poll;
	userId: string | null;
	onVoted: () => void;
}): ReactElement {
	const totalVotes = poll.options.reduce((sum, opt) => sum + (opt.votes?.length ?? 0), 0);
	const userVotedIndex = poll.options.findIndex((opt) => userId && opt.votes?.includes(userId));
	const [voting, setVoting] = useState(false);

	const handleVote = async (idx: number) => {
		if (poll.closed || voting) return;
		setVoting(true);
		try {
			await Meteor.callAsync('hpn/poll/vote', { pollId: poll._id, optionIndex: idx });
			onVoted();
		} catch (e: any) {
			console.error('[HPN Polls] Vote error:', e);
		} finally {
			setVoting(false);
		}
	};

	return (
		<Box
			p={16}
			mb={12}
			style={{ border: '1px solid #e0e0e0', borderRadius: 8, background: '#fff' }}
		>
			<Box display='flex' justifyContent='space-between' alignItems='flex-start' mb={8}>
				<Box fontWeight='700' fontSize='x15' style={{ flex: 1, marginRight: 12 }}>
					{poll.question}
				</Box>
				<Box display='flex' style={{ gap: 6 }}>
					{poll.anonymous && <Tag variant='secondary'>Anonymous</Tag>}
					{poll.closed && <Tag variant='danger'>Closed</Tag>}
					{!poll.closed && <Tag variant='primary'>Open</Tag>}
				</Box>
			</Box>
			<Box mb={8} fontSize='x12' style={{ color: '#888' }}>
				{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
			</Box>
			{poll.options.map((opt, idx) => {
				const count = opt.votes?.length ?? 0;
				const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
				const isSelected = userVotedIndex === idx;
				return (
					<Box key={idx} mb={10}>
						<Box display='flex' justifyContent='space-between' alignItems='center' mb={2}>
							<Box
								fontSize='x13'
								fontWeight={isSelected ? '700' : '400'}
								style={{ color: isSelected ? '#C41230' : undefined }}
							>
								{isSelected && '✓ '}
								{opt.text}
							</Box>
							<Box fontSize='x12' style={{ color: '#555', minWidth: 36, textAlign: 'right' }}>
								{pct}%
							</Box>
						</Box>
						<VoteBar pct={pct} />
						{!poll.closed && (
							<Button
								small
								onClick={() => handleVote(idx)}
								disabled={voting}
								style={{
									marginTop: 4,
									background: isSelected ? '#C41230' : undefined,
									color: isSelected ? '#fff' : undefined,
								}}
							>
								{isSelected ? 'Unvote' : 'Vote'}
							</Button>
						)}
					</Box>
				);
			})}
		</Box>
	);
}

// ---------------------------------------------------------------------------
// Survey answer form
// ---------------------------------------------------------------------------
function SurveyForm({
	survey,
	onSubmitted,
	onCancel,
}: {
	survey: Survey;
	onSubmitted: () => void;
	onCancel: () => void;
}): ReactElement {
	const [answers, setAnswers] = useState<Record<number, string | string[]>>({});
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	const setAnswer = (idx: number, value: string | string[]) => {
		setAnswers((prev) => ({ ...prev, [idx]: value }));
	};

	const toggleMultiple = (idx: number, option: string) => {
		const current: string[] = (answers[idx] as string[]) ?? [];
		if (current.includes(option)) {
			setAnswer(idx, current.filter((v) => v !== option));
		} else {
			setAnswer(idx, [...current, option]);
		}
	};

	const handleSubmit = async () => {
		setError('');
		const payload = Object.entries(answers).map(([qIdx, value]) => ({
			questionIndex: Number(qIdx),
			value,
		}));
		setSubmitting(true);
		try {
			await Meteor.callAsync('hpn/survey/submit', { surveyId: survey._id, answers: payload });
			onSubmitted();
		} catch (e: any) {
			setError(e.reason ?? e.message ?? 'Failed to submit survey');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Box p={16} style={{ border: '1px solid #C41230', borderRadius: 8, background: '#fff' }}>
			<Box fontWeight='700' fontSize='x16' mb={4}>
				{survey.title}
			</Box>
			{survey.description && (
				<Box mb={12} fontSize='x13' style={{ color: '#555' }}>
					{survey.description}
				</Box>
			)}
			{error && (
				<Box mb={8} style={{ color: '#C41230' }}>
					{error}
				</Box>
			)}
			{survey.questions.map((q, idx) => (
				<Box key={idx} mb={16}>
					<Box fontWeight='600' fontSize='x14' mb={6}>
						{idx + 1}. {q.text}
					</Box>
					{q.type === 'single' &&
						(q.options ?? []).map((opt) => (
							<Box key={opt} display='flex' alignItems='center' mb={4} style={{ gap: 8 }}>
								<input
									type='radio'
									name={`q-${idx}`}
									value={opt}
									checked={(answers[idx] as string) === opt}
									onChange={() => setAnswer(idx, opt)}
									id={`q${idx}-opt-${opt}`}
								/>
								<label htmlFor={`q${idx}-opt-${opt}`} style={{ cursor: 'pointer', fontSize: 13 }}>
									{opt}
								</label>
							</Box>
						))}
					{q.type === 'multiple' &&
						(q.options ?? []).map((opt) => (
							<Box key={opt} display='flex' alignItems='center' mb={4} style={{ gap: 8 }}>
								<input
									type='checkbox'
									value={opt}
									checked={((answers[idx] as string[]) ?? []).includes(opt)}
									onChange={() => toggleMultiple(idx, opt)}
									id={`q${idx}-chk-${opt}`}
								/>
								<label htmlFor={`q${idx}-chk-${opt}`} style={{ cursor: 'pointer', fontSize: 13 }}>
									{opt}
								</label>
							</Box>
						))}
					{q.type === 'text' && (
						<textarea
							value={(answers[idx] as string) ?? ''}
							onChange={(e) => setAnswer(idx, e.target.value)}
							placeholder='Your answer...'
							rows={4}
							style={{
								width: '100%',
								resize: 'vertical',
								minHeight: 80,
								padding: '8px 12px',
								border: '1px solid #ddd',
								borderRadius: 4,
								fontSize: 13,
								fontFamily: 'inherit',
								boxSizing: 'border-box',
							}}
						/>
					)}
					{q.type === 'rating' && (
						<Box display='flex' style={{ gap: 8 }}>
							{[1, 2, 3, 4, 5].map((star) => (
								<Box
									key={star}
									onClick={() => setAnswer(idx, String(star))}
									style={{
										cursor: 'pointer',
										fontSize: 24,
										color: Number(answers[idx] as string) >= star ? '#C41230' : '#ccc',
										transition: 'color 0.15s',
									}}
								>
									★
								</Box>
							))}
						</Box>
					)}
				</Box>
			))}
			<ButtonGroup>
				<Button primary onClick={handleSubmit} disabled={submitting}>
					{submitting ? 'Submitting...' : 'Submit Survey'}
				</Button>
				<Button onClick={onCancel}>Cancel</Button>
			</ButtonGroup>
		</Box>
	);
}

// ---------------------------------------------------------------------------
// Survey Card
// ---------------------------------------------------------------------------
function SurveyCard({
	survey,
	onResponded,
}: {
	survey: Survey;
	onResponded: () => void;
}): ReactElement {
	const [expanded, setExpanded] = useState(false);

	if (expanded) {
		return (
			<SurveyForm
				survey={survey}
				onSubmitted={() => {
					setExpanded(false);
					onResponded();
				}}
				onCancel={() => setExpanded(false)}
			/>
		);
	}

	return (
		<Box
			p={16}
			mb={12}
			style={{ border: '1px solid #e0e0e0', borderRadius: 8, background: '#fff' }}
		>
			<Box display='flex' justifyContent='space-between' alignItems='flex-start' mb={6}>
				<Box fontWeight='700' fontSize='x15'>
					{survey.title}
				</Box>
				{survey.hasResponded ? (
					<Tag variant='primary'>Completed ✓</Tag>
				) : (
					<Tag variant='secondary'>Not started</Tag>
				)}
			</Box>
			{survey.description && (
				<Box mb={8} fontSize='x13' style={{ color: '#555' }}>
					{survey.description}
				</Box>
			)}
			<Box mb={12} fontSize='x12' style={{ color: '#888' }}>
				{survey.questionCount} question{survey.questionCount !== 1 ? 's' : ''}
			</Box>
			{!survey.hasResponded && (
				<Button primary small onClick={() => setExpanded(true)}>
					Fill in Survey
				</Button>
			)}
		</Box>
	);
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
const HpnPollsPage = (): ReactElement => {
	const [activeTab, setActiveTab] = useState<'polls' | 'surveys'>('polls');

	useEffect(() => {
		if (window.location.hash === '#surveys') setActiveTab('surveys');
		else if (window.location.hash === '#polls') setActiveTab('polls');
	}, []);
	const [polls, setPolls] = useState<Poll[]>([]);
	const [surveys, setSurveys] = useState<Survey[]>([]);
	const [loadingPolls, setLoadingPolls] = useState(true);
	const [loadingSurveys, setLoadingSurveys] = useState(true);
	const [showCreatePoll, setShowCreatePoll] = useState(false);

	const userId = useUserId();
	const user = useUser();
	const userRoles: string[] = ((user as any)?.roles ?? []) as string[];

	const pollCreatePermission = useSetting('HPN_Poll_Create_Permission', 'admin') as string;
	const canCreatePolls = canCreate(pollCreatePermission, userRoles);

	const loadPolls = useCallback(async () => {
		setLoadingPolls(true);
		try {
			const result = await Meteor.callAsync('hpn/poll/list', {});
			setPolls((result as Poll[]) ?? []);
		} finally {
			setLoadingPolls(false);
		}
	}, []);

	const loadSurveys = useCallback(async () => {
		setLoadingSurveys(true);
		try {
			const result = await Meteor.callAsync('hpn/survey/list');
			setSurveys((result as Survey[]) ?? []);
		} finally {
			setLoadingSurveys(false);
		}
	}, []);

	useEffect(() => {
		loadPolls();
	}, [loadPolls]);

	useEffect(() => {
		loadSurveys();
	}, [loadSurveys]);

	return (
		<Page>
			<PageHeader title='Polls &amp; Surveys' />
			<PageScrollableContentWithShadow>
				<Box p={16}>
					<Tabs>
						<TabsItem selected={activeTab === 'polls'} onClick={() => setActiveTab('polls')}>
							Polls
						</TabsItem>
						<TabsItem selected={activeTab === 'surveys'} onClick={() => setActiveTab('surveys')}>
							Surveys
						</TabsItem>
					</Tabs>

					<Box mt={16}>
						{activeTab === 'polls' && (
							<>
								{canCreatePolls && (
									<Box mb={12}>
										{!showCreatePoll ? (
											<Button primary onClick={() => setShowCreatePoll(true)}>
												+ Create Poll
											</Button>
										) : (
											<>
												<CreatePollForm
													onCreated={() => {
														setShowCreatePoll(false);
														loadPolls();
													}}
												/>
												<Button onClick={() => setShowCreatePoll(false)} mb={8}>
													Cancel
												</Button>
											</>
										)}
									</Box>
								)}
								{loadingPolls ? (
									<>
										<Skeleton mb={8} />
										<Skeleton mb={8} />
										<Skeleton mb={8} />
									</>
								) : polls.length === 0 ? (
									<Box style={{ color: '#888', textAlign: 'center', padding: 32 }}>
										No active polls at the moment.
									</Box>
								) : (
									polls.map((poll) => (
										<PollCard key={poll._id} poll={poll} userId={userId} onVoted={loadPolls} />
									))
								)}
							</>
						)}

						{activeTab === 'surveys' && (
							<>
								{loadingSurveys ? (
									<>
										<Skeleton mb={8} />
										<Skeleton mb={8} />
									</>
								) : surveys.length === 0 ? (
									<Box style={{ color: '#888', textAlign: 'center', padding: 32 }}>
										No active surveys at the moment.
									</Box>
								) : (
									surveys.map((survey) => (
										<SurveyCard key={survey._id} survey={survey} onResponded={loadSurveys} />
									))
								)}
							</>
						)}
					</Box>
				</Box>
			</PageScrollableContentWithShadow>
		</Page>
	);
};

export default HpnPollsPage;
