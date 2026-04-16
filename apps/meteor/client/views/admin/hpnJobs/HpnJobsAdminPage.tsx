import {
	Box, Button, ButtonGroup, Field, FieldLabel, FieldRow,
	Skeleton, Tag, Tabs, TextAreaInput,
} from '@rocket.chat/fuselage';
import DOMPurify from 'dompurify';
import { Page, PageHeader, PageScrollableContent } from '@rocket.chat/ui-client';
import { Meteor } from 'meteor/meteor';
import { useEffect, useState } from 'react';

type JobListing = {
	_id: string;
	type: 'job' | 'cv';
	title: string;
	organisation?: string;
	location?: string;
	description: string;
	applyContact?: string;
	experience?: string;
	specialisations?: string;
	availability?: string;
	contactInfo?: string;
	status: 'pending' | 'approved' | 'rejected';
	submittedByUsername: string;
	submittedAt: string;
	rejectionReason?: string;
};

function JobDetail({ item }: { item: JobListing }) {
	const isJob = item.type === 'job';
	return (
		<Box>
			{isJob && (item.organisation || item.location) && (
				<Box mb='x12' display='flex' style={{ gap: 12 }}>
					{item.organisation && <Box fontSize='x13' color='default'>🏢 {item.organisation}</Box>}
					{item.location && <Box fontSize='x13' color='hint'>📍 {item.location}</Box>}
				</Box>
			)}
			{!isJob && (
				<Box mb='x12' display='flex' style={{ gap: 12 }}>
					{item.experience && <Box fontSize='x13' color='default'>⏱ {item.experience} yrs exp</Box>}
					{item.availability && <Box fontSize='x13' color='hint'>Available: {item.availability}</Box>}
				</Box>
			)}
			<Box mb='x4' fontSize='x13' fontWeight='600' color='hint'>{isJob ? 'DESCRIPTION' : 'ABOUT'}</Box>
			<Box color='default' fontSize='x14' mb='x12' dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.description) }} />
			{item.specialisations && (
				<>
					<Box mb='x4' fontSize='x13' fontWeight='600' color='hint'>SPECIALISATIONS</Box>
					<Box color='default' fontSize='x14' mb='x12' dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.specialisations ?? '') }} />
				</>
			)}
			<Box mb='x4' fontSize='x13' fontWeight='600' color='hint'>{isJob ? 'HOW TO APPLY' : 'CONTACT'}</Box>
			<Box color='default' fontSize='x14'>{isJob ? item.applyContact : item.contactInfo}</Box>
			<Box color='hint' fontSize='x12' mt='x12'>Submitted by @{item.submittedByUsername}</Box>
		</Box>
	);
}

function PendingTab() {
	const [listings, setListings] = useState<JobListing[]>([]);
	const [loading, setLoading] = useState(true);
	const [rejecting, setRejecting] = useState<string | null>(null);
	const [rejectReason, setRejectReason] = useState('');
	const [busy, setBusy] = useState(false);

	const load = () => {
		setLoading(true);
		Meteor.callAsync('hpn/jobs/admin/pending')
			.then((res: any) => setListings(res ?? []))
			.finally(() => setLoading(false));
	};
	useEffect(load, []);

	const approve = async (id: string) => {
		setBusy(true);
		try { await Meteor.callAsync('hpn/jobs/approve', id, true); load(); }
		finally { setBusy(false); }
	};

	const reject = async (id: string) => {
		if (!rejectReason.trim()) return;
		setBusy(true);
		try {
			await Meteor.callAsync('hpn/jobs/approve', id, false, rejectReason);
			setRejecting(null); setRejectReason(''); load();
		} finally { setBusy(false); }
	};

	if (loading) return <Skeleton style={{ height: 200 }} />;
	if (listings.length === 0) return <Box color='hint' mt='x24'>No pending submissions.</Box>;

	return (
		<Box display='flex' flexDirection='column' style={{ gap: 16 }}>
			{listings.map((item) => (
				<Box key={item._id} borderRadius='x4' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light' bg='surface' p='x16'>
					<Box display='flex' justifyContent='space-between' alignItems='flex-start' mb='x16'>
						<Box>
							<Box display='flex' alignItems='center' style={{ gap: 8 }}>
								<Box fontSize='x18' fontWeight='700' color='default'>{item.title}</Box>
								<Tag>{item.type === 'job' ? '💼 Job' : '📄 CV'}</Tag>
							</Box>
						</Box>
						<Tag>pending</Tag>
					</Box>
					<JobDetail item={item} />
					<Box mt='x16' pt='x16' borderBlockStartWidth='x2' borderBlockStartStyle='solid' borderBlockStartColor='stroke-extra-light'>
						{rejecting === item._id ? (
							<Box>
								<Field mb='x8'>
									<FieldLabel>Rejection reason *</FieldLabel>
									<FieldRow>
										<TextAreaInput value={rejectReason} onChange={(e: any) => setRejectReason(e.target.value)} rows={3} placeholder='Explain why this is not approved…' />
									</FieldRow>
								</Field>
								<ButtonGroup>
									<Button onClick={() => { setRejecting(null); setRejectReason(''); }}>Cancel</Button>
									<Button disabled={busy || !rejectReason.trim()} onClick={() => reject(item._id)}>Confirm Reject</Button>
								</ButtonGroup>
							</Box>
						) : (
							<ButtonGroup>
								<Button primary disabled={busy} onClick={() => approve(item._id)}>Approve</Button>
								<Button disabled={busy} onClick={() => setRejecting(item._id)}>Reject</Button>
							</ButtonGroup>
						)}
					</Box>
				</Box>
			))}
		</Box>
	);
}

function AllListingsTab() {
	const [listings, setListings] = useState<JobListing[]>([]);
	const [loading, setLoading] = useState(true);
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [filter, setFilter] = useState<'all' | 'job' | 'cv'>('all');

	useEffect(() => {
		setLoading(true);
		Meteor.callAsync('hpn/jobs/admin/all')
			.then((res: any) => setListings(res ?? []))
			.finally(() => setLoading(false));
	}, []);

	const toggle = (id: string) => setExpanded((prev) => {
		const next = new Set(prev);
		next.has(id) ? next.delete(id) : next.add(id);
		return next;
	});

	const filtered = filter === 'all' ? listings : listings.filter((l) => l.type === filter);

	if (loading) return <Skeleton style={{ height: 200 }} />;
	if (listings.length === 0) return <Box color='hint' mt='x24'>No listings yet.</Box>;

	return (
		<Box>
			<Box display='flex' style={{ gap: 8 }} mb='x16'>
				{(['all', 'job', 'cv'] as const).map((f) => (
					<Button key={f} small primary={filter === f} onClick={() => setFilter(f)}>
						{f === 'all' ? 'All' : f === 'job' ? '💼 Jobs' : '📄 CVs'}
					</Button>
				))}
			</Box>
			<Box display='flex' flexDirection='column' style={{ gap: 12 }}>
				{filtered.map((item) => (
					<Box key={item._id} borderRadius='x4' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light' bg='surface' p='x16'>
						<Box display='flex' justifyContent='space-between' alignItems='flex-start'>
							<Box>
								<Box display='flex' alignItems='center' style={{ gap: 8 }}>
									<Box fontSize='x16' fontWeight='700' color='default'>{item.title}</Box>
									<Tag>{item.type === 'job' ? '💼 Job' : '📄 CV'}</Tag>
								</Box>
								<Box color='hint' fontSize='x12' mt='x2'>@{item.submittedByUsername}</Box>
							</Box>
							<Box display='flex' alignItems='center' style={{ gap: 8 }}>
								<Tag>{item.status}</Tag>
								<Button small icon={expanded.has(item._id) ? 'chevron-up' : 'chevron-down'} onClick={() => toggle(item._id)} />
							</Box>
						</Box>
						{expanded.has(item._id) && (
							<Box mt='x16' pt='x16' borderBlockStartWidth='x2' borderBlockStartStyle='solid' borderBlockStartColor='stroke-extra-light'>
								<JobDetail item={item} />
								{item.status === 'rejected' && item.rejectionReason && (
									<Box mt='x12' p='x8' borderRadius='x4' style={{ background: '#fff0f0' }}>
										<Box fontWeight='600' fontSize='x13' color='danger'>Rejection reason: {item.rejectionReason}</Box>
									</Box>
								)}
							</Box>
						)}
					</Box>
				))}
			</Box>
		</Box>
	);
}

export default function HpnJobsAdminPage() {
	const [tab, setTab] = useState<'pending' | 'all'>('pending');

	return (
		<Page>
			<PageHeader title='Job Board' />
			<Tabs>
				<Tabs.Item selected={tab === 'pending'} onClick={() => setTab('pending')}>Pending Approvals</Tabs.Item>
				<Tabs.Item selected={tab === 'all'} onClick={() => setTab('all')}>All Listings</Tabs.Item>
			</Tabs>
			<PageScrollableContent>
				<Box p='x24'>
					{tab === 'pending' && <PendingTab />}
					{tab === 'all' && <AllListingsTab />}
				</Box>
			</PageScrollableContent>
		</Page>
	);
}
