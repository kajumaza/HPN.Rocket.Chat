import { Box, Button, Skeleton, Tag } from '@rocket.chat/fuselage';
import { Meteor } from 'meteor/meteor';
import { useEffect, useState } from 'react';

type InsightsReport = {
	batchId: string;
	weekOf: string;
	savedAt: string;
	summary?: {
		totalMessages?: number;
		activeMembers?: number;
		mostActiveRoom?: string;
	};
	themes?: Array<{ theme: string; mentions: number; summary?: string }>;
	faqs?: Array<{ question: string; frequency: number; room?: string }>;
	sentiment?: Array<{ room: string; score: string; positive?: string; concerns?: string }>;
	directoryViews?: Array<{ businessName: string; category?: string; viewCount: number }>;
	botRecommendations?: Array<{ businessName: string; recommendationCount: number }>;
	engagement?: Array<{ room: string; messages: number; members: number }>;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<Box mb='x24'>
			<Box fontSize='x16' fontWeight='700' color='default' mb='x12' pb='x8'
				borderBlockEndWidth='x2' borderBlockEndStyle='solid' borderBlockEndColor='stroke-extra-light'>
				{title}
			</Box>
			{children}
		</Box>
	);
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
	return (
		<Box p='x16' bg='surface' borderRadius='x4' borderWidth='x2' borderStyle='solid'
			borderColor='stroke-extra-light' display='flex' flexDirection='column' style={{ minWidth: 140 }}>
			<Box fontSize='x28' fontWeight='700' color='default'>{value}</Box>
			<Box fontSize='x13' fontWeight='600' color='hint' mt='x4'>{label}</Box>
			{sub && <Box fontSize='x12' color='hint' mt='x2'>{sub}</Box>}
		</Box>
	);
}

function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
	if (!rows.length) return <Box color='hint' fontSize='x13'>No data available.</Box>;
	return (
		<Box style={{ overflowX: 'auto' }}>
			<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
				<thead>
					<tr>
						{headers.map((h) => (
							<th key={h} style={{ textAlign: 'left', padding: '6px 12px', borderBottom: '2px solid #eee', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row, i) => (
						<tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : '#fafafa' }}>
							{row.map((cell, j) => (
								<td key={j} style={{ padding: '6px 12px', borderBottom: '1px solid #f0f0f0' }}>{cell}</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</Box>
	);
}

export default function HpnInsightsDashboard() {
	const [report, setReport] = useState<InsightsReport | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	const load = () => {
		setLoading(true);
		setError('');
		Meteor.callAsync('hpn/insights/latest')
			.then((res: any) => setReport(res ?? null))
			.catch((err: any) => setError(err.reason || 'Failed to load insights'))
			.finally(() => setLoading(false));
	};

	useEffect(() => { load(); }, []);

	return (
		<Box display='flex' flexDirection='column' height='100%' bg='surface-light'>
			{/* Header */}
			<Box p='x24' pb='x16' bg='surface' borderBlockEndWidth='x2' borderBlockEndStyle='solid' borderBlockEndColor='stroke-extra-light'>
				<Box display='flex' justifyContent='space-between' alignItems='center'>
					<Box>
						<Box fontSize='x24' fontWeight='700' color='default'>HPN Insights</Box>
						{report?.weekOf && (
							<Box color='hint' fontSize='x13' mt='x4'>Week of {new Date(report.weekOf).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</Box>
						)}
					</Box>
					<Button small onClick={load} disabled={loading}>
						{loading ? 'Loading…' : 'Refresh'}
					</Button>
				</Box>
			</Box>

			<Box flexGrow={1} overflow='auto' p='x24'>
				{loading && (
					<Box display='flex' flexDirection='column' style={{ gap: 12 }}>
						{[1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 100, borderRadius: 4 }} />)}
					</Box>
				)}

				{!loading && error && (
					<Box color='danger' fontSize='x14' p='x16' bg='surface' borderRadius='x4'>
						{error}
						{error.includes('No insights') || !error ? null : (
							<Box color='hint' fontSize='x13' mt='x8'>
								Insights are generated weekly by n8n. Check back after the next Monday export run,
								or trigger a manual export via the Meteor shell.
							</Box>
						)}
					</Box>
				)}

				{!loading && !error && !report && (
					<Box color='hint' textAlign='center' mt='x48' fontSize='x16'>
						No insights yet. They will appear after the first weekly n8n analysis run.
					</Box>
				)}

				{!loading && report && (
					<>
						{/* Summary Stats */}
						{report.summary && (
							<Section title='Weekly Summary'>
								<Box display='flex' flexWrap='wrap' style={{ gap: 12 }}>
									{report.summary.totalMessages !== undefined && (
										<StatCard label='Total Messages' value={report.summary.totalMessages} />
									)}
									{report.summary.activeMembers !== undefined && (
										<StatCard label='Active Members' value={report.summary.activeMembers} />
									)}
									{report.summary.mostActiveRoom && (
										<StatCard label='Most Active Room' value={`#${report.summary.mostActiveRoom}`} />
									)}
								</Box>
							</Section>
						)}

						{/* Room Engagement */}
						{report.engagement?.length ? (
							<Section title='Room Engagement'>
								<Table
									headers={['Room', 'Messages', 'Active Members']}
									rows={report.engagement.map((e) => [`#${e.room}`, e.messages, e.members])}
								/>
							</Section>
						) : null}

						{/* Top Themes */}
						{report.themes?.length ? (
							<Section title='Top Community Themes'>
								<Box display='flex' flexDirection='column' style={{ gap: 8 }}>
									{report.themes.map((t, i) => (
										<Box key={i} p='x12' bg='surface' borderRadius='x4' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light'>
											<Box display='flex' alignItems='center' style={{ gap: 8 }} mb='x4'>
												<Tag>{t.mentions} mentions</Tag>
												<Box fontWeight='600' color='default'>{t.theme}</Box>
											</Box>
											{t.summary && <Box color='hint' fontSize='x13'>{t.summary}</Box>}
										</Box>
									))}
								</Box>
							</Section>
						) : null}

						{/* FAQs */}
						{report.faqs?.length ? (
							<Section title='Frequently Asked Questions'>
								<Table
									headers={['Question', 'Times Asked', 'Room']}
									rows={report.faqs.map((f) => [f.question, f.frequency, f.room ? `#${f.room}` : '—'])}
								/>
							</Section>
						) : null}

						{/* Sentiment */}
						{report.sentiment?.length ? (
							<Section title='Sentiment by Room'>
								<Table
									headers={['Room', 'Sentiment', 'Positive Highlights', 'Concerns']}
									rows={report.sentiment.map((s) => [
										`#${s.room}`,
										s.score,
										s.positive || '—',
										s.concerns || '—',
									])}
								/>
							</Section>
						) : null}

						{/* Directory Views */}
						{report.directoryViews?.length ? (
							<Section title='Business Directory Views'>
								<Table
									headers={['Business', 'Category', 'Views This Week']}
									rows={report.directoryViews.map((d) => [d.businessName, d.category || '—', d.viewCount])}
								/>
							</Section>
						) : null}

						{/* Bot Recommendations */}
						{report.botRecommendations?.length ? (
							<Section title='Bot Recommendation Counts'>
								<Table
									headers={['Business', 'Times Recommended']}
									rows={report.botRecommendations.map((b) => [b.businessName, b.recommendationCount])}
								/>
							</Section>
						) : null}
					</>
				)}
			</Box>
		</Box>
	);
}
