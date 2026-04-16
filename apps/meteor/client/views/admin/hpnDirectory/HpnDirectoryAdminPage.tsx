import {
	Box,
	Button,
	ButtonGroup,
	Field,
	FieldLabel,
	FieldRow,
	Skeleton,
	Tabs,
	Tag,
	TextInput,
	TextAreaInput,
} from '@rocket.chat/fuselage';
import { Page, PageHeader, PageScrollableContent } from '@rocket.chat/ui-client';
import DOMPurify from 'dompurify';
import { Meteor } from 'meteor/meteor';
import { useEffect, useState } from 'react';

type PendingEdit = {
	businessName: string;
	categories?: string[];
	category?: string;
	briefDescription: string;
	fullDescription: string;
	contactName: string;
	contactEmail: string;
	contactPhone: string;
	website: string;
	submittedAt: string;
	editRejectionReason?: string;
};

type Listing = {
	_id: string;
	businessName: string;
	categories?: string[];
	category?: string;
	briefDescription: string;
	fullDescription: string;
	contactName: string;
	contactEmail: string;
	contactPhone: string;
	website: string;
	status: 'pending' | 'approved' | 'rejected';
	submittedAt: string;
	rejectionReason?: string;
	reviewCount: number;
	reviewAvg: number;
	score: number;
	pendingEdit?: PendingEdit;
	editStatus?: 'pending' | 'rejected' | null;
};

type Category = { _id: string; name: string; slug: string };

type BotKeyword = { _id: string; keyword: string; source: 'auto' | 'manual'; addedAt: string; listingId?: string };

// ─── Shared: full listing detail block ───────────────────────────────────────

function ListingDetail({ l, label }: { l: { businessName: string; categories?: string[]; category?: string; briefDescription: string; fullDescription: string; contactName: string; contactEmail: string; contactPhone: string; website: string }; label?: string }) {
	return (
		<Box>
			{label && <Box fontSize='x13' fontWeight='600' color='hint' mb='x8'>{label}</Box>}
			<Box mb='x4' fontSize='x13' fontWeight='600' color='hint'>BRIEF DESCRIPTION</Box>
			<Box color='default' fontSize='x14' mb='x12'>{l.briefDescription}</Box>

			<Box mb='x4' fontSize='x13' fontWeight='600' color='hint'>FULL DESCRIPTION</Box>
			<Box color='default' fontSize='x14' mb='x16' dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(l.fullDescription) }} />

			<Box mb='x4' fontSize='x13' fontWeight='600' color='hint'>CONTACT DETAILS</Box>
			<Box display='flex' flexDirection='column' fontSize='x14' style={{ gap: 4 }}>
				<Box color='default'>&#128100; {l.contactName}</Box>
				<Box color='default'>&#9993;&#65039; {l.contactEmail}</Box>
				{l.contactPhone && <Box color='default'>&#128222; {l.contactPhone}</Box>}
				{l.website && (
					<Box color='default'>
						&#127760; <a href={l.website} target='_blank' rel='noopener noreferrer' style={{ color: '#C41230' }}>{l.website}</a>
					</Box>
				)}
			</Box>
		</Box>
	);
}

// ─── Pending New Listings Tab ─────────────────────────────────────────────────

function PendingTab() {
	const [listings, setListings] = useState<Listing[]>([]);
	const [loading, setLoading] = useState(true);
	const [rejecting, setRejecting] = useState<string | null>(null);
	const [rejectReason, setRejectReason] = useState('');
	const [busy, setBusy] = useState(false);

	const load = () => {
		setLoading(true);
		Meteor.callAsync('hpn/directory/admin/pending')
			.then((res: any) => setListings(res ?? []))
			.finally(() => setLoading(false));
	};

	useEffect(load, []);

	const approve = async (id: string) => {
		setBusy(true);
		try { await Meteor.callAsync('hpn/directory/approve', id, true); load(); }
		finally { setBusy(false); }
	};

	const reject = async (id: string) => {
		if (!rejectReason.trim()) return;
		setBusy(true);
		try {
			await Meteor.callAsync('hpn/directory/approve', id, false, rejectReason);
			setRejecting(null); setRejectReason(''); load();
		} finally { setBusy(false); }
	};

	if (loading) return <Skeleton style={{ height: 200 }} />;
	if (listings.length === 0) return <Box color='hint' mt='x24'>No pending submissions.</Box>;

	return (
		<Box display='flex' flexDirection='column' style={{ gap: 16 }}>
			{listings.map((l) => (
				<Box key={l._id} borderRadius='x4' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light' bg='surface' p='x16'>
					<Box display='flex' justifyContent='space-between' alignItems='flex-start' mb='x16'>
						<Box>
							<Box fontSize='x18' fontWeight='700' color='default'>{l.businessName}</Box>
							<Box color='hint' fontSize='x12' mt='x4'>
								{(l.categories?.length ? l.categories : (l.category ? [l.category] : [])).join(', ')}
							</Box>
						</Box>
						<Tag>pending</Tag>
					</Box>

					<ListingDetail l={l} />

					<Box mt='x16' pt='x16' borderBlockStartWidth='x2' borderBlockStartStyle='solid' borderBlockStartColor='stroke-extra-light'>
						{rejecting === l._id ? (
							<Box>
								<Field mb='x8'>
									<FieldLabel>Rejection reason *</FieldLabel>
									<FieldRow>
										<TextAreaInput value={rejectReason} onChange={(e: any) => setRejectReason(e.target.value)} rows={3} placeholder='Explain why this listing is not approved\u2026' />
									</FieldRow>
								</Field>
								<ButtonGroup>
									<Button onClick={() => { setRejecting(null); setRejectReason(''); }}>Cancel</Button>
									<Button disabled={busy || !rejectReason.trim()} onClick={() => reject(l._id)}>Confirm Reject</Button>
								</ButtonGroup>
							</Box>
						) : (
							<ButtonGroup>
								<Button primary disabled={busy} onClick={() => approve(l._id)}>Approve</Button>
								<Button disabled={busy} onClick={() => setRejecting(l._id)}>Reject</Button>
							</ButtonGroup>
						)}
					</Box>
				</Box>
			))}
		</Box>
	);
}

// ─── Pending Edits Tab ────────────────────────────────────────────────────────

function PendingEditsTab() {
	const [listings, setListings] = useState<Listing[]>([]);
	const [loading, setLoading] = useState(true);
	const [rejecting, setRejecting] = useState<string | null>(null);
	const [rejectReason, setRejectReason] = useState('');
	const [busy, setBusy] = useState(false);

	const load = () => {
		setLoading(true);
		Meteor.callAsync('hpn/directory/admin/pending-edits')
			.then((res: any) => setListings(res ?? []))
			.finally(() => setLoading(false));
	};

	useEffect(load, []);

	const approveEdit = async (id: string) => {
		setBusy(true);
		try { await Meteor.callAsync('hpn/directory/approve-edit', id, true); load(); }
		finally { setBusy(false); }
	};

	const rejectEdit = async (id: string) => {
		if (!rejectReason.trim()) return;
		setBusy(true);
		try {
			await Meteor.callAsync('hpn/directory/approve-edit', id, false, rejectReason);
			setRejecting(null); setRejectReason(''); load();
		} finally { setBusy(false); }
	};

	if (loading) return <Skeleton style={{ height: 200 }} />;
	if (listings.length === 0) return <Box color='hint' mt='x24'>No pending edits.</Box>;

	return (
		<Box display='flex' flexDirection='column' style={{ gap: 16 }}>
			{listings.map((l) => (
				<Box key={l._id} borderRadius='x4' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light' bg='surface' p='x16'>
					<Box display='flex' justifyContent='space-between' alignItems='flex-start' mb='x16'>
						<Box>
							<Box fontSize='x18' fontWeight='700' color='default'>{l.businessName}</Box>
							<Box color='hint' fontSize='x12' mt='x4'>Approved listing \u2014 edit submitted for review</Box>
						</Box>
						<Tag>edit pending</Tag>
					</Box>

					{/* Current live version */}
					<Box mb='x20'>
						<Box fontSize='x14' fontWeight='700' color='default' mb='x12'
							p='x8' borderRadius='x4' style={{ background: '#f0f9f0' }}>
							&#9989; Current live version
						</Box>
						<ListingDetail l={l} />
					</Box>

					{/* Proposed edit */}
					{l.pendingEdit && (
						<Box>
							<Box fontSize='x14' fontWeight='700' color='default' mb='x12'
								p='x8' borderRadius='x4' style={{ background: '#fff8e1' }}>
								&#9999;&#65039; Proposed changes
							</Box>
							<ListingDetail l={l.pendingEdit} />
						</Box>
					)}

					<Box mt='x16' pt='x16' borderBlockStartWidth='x2' borderBlockStartStyle='solid' borderBlockStartColor='stroke-extra-light'>
						{rejecting === l._id ? (
							<Box>
								<Field mb='x8'>
									<FieldLabel>Rejection reason *</FieldLabel>
									<FieldRow>
										<TextAreaInput value={rejectReason} onChange={(e: any) => setRejectReason(e.target.value)} rows={3} placeholder='Explain why this edit is not approved\u2026' />
									</FieldRow>
								</Field>
								<ButtonGroup>
									<Button onClick={() => { setRejecting(null); setRejectReason(''); }}>Cancel</Button>
									<Button disabled={busy || !rejectReason.trim()} onClick={() => rejectEdit(l._id)}>Confirm Reject</Button>
								</ButtonGroup>
							</Box>
						) : (
							<ButtonGroup>
								<Button primary disabled={busy} onClick={() => approveEdit(l._id)}>Approve Edit</Button>
								<Button disabled={busy} onClick={() => setRejecting(l._id)}>Reject Edit</Button>
							</ButtonGroup>
						)}
					</Box>
				</Box>
			))}
		</Box>
	);
}

// ─── All Listings Tab ─────────────────────────────────────────────────────────

function AllListingsTab() {
	const [listings, setListings] = useState<Listing[]>([]);
	const [loading, setLoading] = useState(true);
	const [expanded, setExpanded] = useState<Set<string>>(new Set());

	useEffect(() => {
		setLoading(true);
		Meteor.callAsync('hpn/directory/admin/all')
			.then((res: any) => setListings(res ?? []))
			.finally(() => setLoading(false));
	}, []);

	const toggle = (id: string) => setExpanded((prev) => {
		const next = new Set(prev);
		next.has(id) ? next.delete(id) : next.add(id);
		return next;
	});

	if (loading) return <Skeleton style={{ height: 200 }} />;
	if (listings.length === 0) return <Box color='hint' mt='x24'>No listings yet.</Box>;

	return (
		<Box display='flex' flexDirection='column' style={{ gap: 12 }}>
			{listings.map((l) => {
				const isOpen = expanded.has(l._id);
				return (
					<Box key={l._id} borderRadius='x4' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light' bg='surface' p='x16'>
						<Box display='flex' justifyContent='space-between' alignItems='flex-start'>
							<Box>
								<Box fontSize='x16' fontWeight='700' color='default'>{l.businessName}</Box>
								<Box color='hint' fontSize='x12' mt='x2'>
									{(l.categories?.length ? l.categories : (l.category ? [l.category] : [])).join(', ')} &middot; Score: {l.score} &middot; &#11088; {l.reviewAvg.toFixed(1)} ({l.reviewCount})
									{l.editStatus === 'pending' && <Box as='span' style={{ color: '#f59f00', marginLeft: 8 }}>&middot; &#9999;&#65039; Edit pending</Box>}
								</Box>
							</Box>
							<Box display='flex' alignItems='center' style={{ gap: 8 }}>
								<Tag>{l.status}</Tag>
								<Button small icon={isOpen ? 'chevron-up' : 'chevron-down'} onClick={() => toggle(l._id)} />
							</Box>
						</Box>

						{isOpen && (
							<Box mt='x16' pt='x16' borderBlockStartWidth='x2' borderBlockStartStyle='solid' borderBlockStartColor='stroke-extra-light'>
								<ListingDetail l={l} label='LIVE VERSION' />
								{l.pendingEdit && l.editStatus === 'pending' && (
									<Box mt='x16' pt='x16' borderBlockStartWidth='x2' borderBlockStartStyle='solid' borderBlockStartColor='stroke-extra-light'>
										<ListingDetail l={l.pendingEdit} label='&#9999;&#65039; PENDING EDIT' />
									</Box>
								)}
							</Box>
						)}
					</Box>
				);
			})}
		</Box>
	);
}

// ─── Categories Tab ───────────────────────────────────────────────────────────

function CategoriesTab() {
	const [categories, setCategories] = useState<Category[]>([]);
	const [loading, setLoading] = useState(true);
	const [editing, setEditing] = useState<Category | null>(null);
	const [newName, setNewName] = useState('');
	const [busy, setBusy] = useState(false);
	const [maxCategories, setMaxCategories] = useState(1);
	const [maxCatInput, setMaxCatInput] = useState('1');

	const load = () => {
		setLoading(true);
		Meteor.callAsync('hpn/directory/categories/get')
			.then((res: any) => setCategories(res ?? []))
			.finally(() => setLoading(false));
		Meteor.callAsync('hpn/directory/settings/get').then((res: any) => {
			const n = res?.maxCategories ?? 1;
			setMaxCategories(n);
			setMaxCatInput(String(n));
		});
	};

	useEffect(load, []);

	const save = async () => {
		const name = editing ? editing.name : newName;
		if (!name.trim()) return;
		setBusy(true);
		try {
			await Meteor.callAsync('hpn/directory/categories/save', name.trim(), editing?._id);
			setEditing(null); setNewName(''); load();
		} finally { setBusy(false); }
	};

	const remove = async (id: string) => {
		if (!window.confirm('Remove this category?')) return;
		setBusy(true);
		try { await Meteor.callAsync('hpn/directory/categories/remove', id); load(); }
		finally { setBusy(false); }
	};

	if (loading) return <Skeleton style={{ height: 200 }} />;

	return (
		<Box>
			<Box mb='x20' p='x16' borderRadius='x4' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light' bg='surface'>
				<Box fontSize='x14' fontWeight='700' color='default' mb='x8'>Max Categories per Listing</Box>
				<Box fontSize='x13' color='hint' mb='x12'>How many categories a supplier can select when submitting or editing their listing.</Box>
				<Box display='flex' alignItems='center' style={{ gap: 8 }}>
					<TextInput
						type='number'
						value={maxCatInput}
						onChange={(e: any) => setMaxCatInput(e.target.value)}
						style={{ width: 80 }}
						min={1}
						max={10}
					/>
					<Button
						primary
						small
						disabled={busy}
						onClick={async () => {
							const n = parseInt(maxCatInput, 10);
							if (!n || n < 1 || n > 10) return;
							setBusy(true);
							try {
								await Meteor.callAsync('hpn/directory/settings/save', n);
								setMaxCategories(n);
							} finally { setBusy(false); }
						}}
					>
						Save
					</Button>
					<Box fontSize='x13' color='hint'>Current: {maxCategories}</Box>
				</Box>
			</Box>

			<Box display='flex' flexDirection='column' style={{ gap: 8 }} mb='x20'>
				{categories.map((c) => (
					<Box key={c._id} display='flex' alignItems='center' justifyContent='space-between'
						borderRadius='x4' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light' bg='surface' p='x12'>
						{editing?._id === c._id ? (
							<Box display='flex' alignItems='center' style={{ gap: 8, flexGrow: 1, marginRight: 8 }}>
								<TextInput value={editing.name} onChange={(e: any) => setEditing({ ...editing, name: e.target.value })} />
								<Button small primary disabled={busy} onClick={save}>Save</Button>
								<Button small onClick={() => setEditing(null)}>Cancel</Button>
							</Box>
						) : (
							<>
								<Box fontWeight='600' color='default'>{c.name}</Box>
								<ButtonGroup>
									<Button small onClick={() => setEditing(c)}>Edit</Button>
									<Button small disabled={busy} onClick={() => remove(c._id)}>Remove</Button>
								</ButtonGroup>
							</>
						)}
					</Box>
				))}
			</Box>

			<Box fontSize='x14' fontWeight='700' color='default' mb='x8'>Add Category</Box>
			<Box display='flex' alignItems='center' style={{ gap: 8 }}>
				<TextInput placeholder='Category name' value={newName} onChange={(e: any) => setNewName(e.target.value)} onKeyDown={(e: any) => e.key === 'Enter' && save()} />
				<Button primary disabled={busy || !newName.trim()} onClick={save}>Add</Button>
			</Box>
		</Box>
	);
}

// ─── Bot Keywords Tab ─────────────────────────────────────────────────────────

function BotKeywordsTab() {
	const [keywords, setKeywords] = useState<BotKeyword[]>([]);
	const [loading, setLoading] = useState(true);
	const [newKeyword, setNewKeyword] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	const load = () => {
		setLoading(true);
		Meteor.callAsync('hpn/bot/keywords/get')
			.then((res: any) => setKeywords(res ?? []))
			.finally(() => setLoading(false));
	};

	useEffect(load, []);

	const add = async () => {
		const kw = newKeyword.trim();
		if (!kw) return;
		setBusy(true); setError('');
		try {
			await Meteor.callAsync('hpn/bot/keywords/add', kw);
			setNewKeyword(''); load();
		} catch (err: any) {
			setError(err?.message ?? 'Failed to add keyword');
		} finally { setBusy(false); }
	};

	const remove = async (id: string, keyword: string) => {
		if (!window.confirm(`Remove keyword "${keyword}"?`)) return;
		setBusy(true);
		try { await Meteor.callAsync('hpn/bot/keywords/remove', id); load(); }
		finally { setBusy(false); }
	};

	if (loading) return <Skeleton style={{ height: 200 }} />;

	return (
		<Box>
			<Box color='hint' fontSize='x13' mb='x20'>
				These keywords trigger the supplier bot gate. Auto keywords are extracted from approved listing categories and services.
				Manual keywords let you add niche terms that don&apos;t appear in any listing yet.
				<Box mt='x4'><strong>{keywords.length} keywords active</strong></Box>
			</Box>

			<Box mb='x20'>
				<Box fontSize='x14' fontWeight='700' color='default' mb='x8'>Add Keyword</Box>
				<Box display='flex' alignItems='center' style={{ gap: 8 }}>
					<TextInput
						placeholder='e.g. retrenchment'
						value={newKeyword}
						onChange={(e: any) => { setNewKeyword(e.target.value); setError(''); }}
						onKeyDown={(e: any) => e.key === 'Enter' && add()}
					/>
					<Button primary disabled={busy || !newKeyword.trim()} onClick={add}>Add</Button>
				</Box>
				{error && <Box color='danger' fontSize='x13' mt='x4'>{error}</Box>}
			</Box>

			<Box display='flex' flexDirection='column' style={{ gap: 6 }}>
				{keywords.map((k) => (
					<Box key={k._id} display='flex' alignItems='center' justifyContent='space-between'
						borderRadius='x4' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light' bg='surface' p='x10' pi='x12'>
						<Box display='flex' alignItems='center' style={{ gap: 8 }}>
							<Box fontWeight='600' color='default' fontSize='x14'>{k.keyword}</Box>
							<Box
								fontSize='x11'
								fontWeight='600'
								style={{
									background: k.source === 'auto' ? '#e8f4fd' : '#f0faf0',
									color: k.source === 'auto' ? '#1a6fa3' : '#1a7a3a',
									padding: '2px 6px',
									borderRadius: 4,
								}}
							>
								{k.source}
							</Box>
						</Box>
						<Button small disabled={busy} onClick={() => remove(k._id, k.keyword)}>Remove</Button>
					</Box>
				))}
				{keywords.length === 0 && <Box color='hint' mt='x8'>No keywords yet. Approve a listing to auto-populate, or add manually above.</Box>}
			</Box>
		</Box>
	);
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────

export default function HpnDirectoryAdminPage() {
	const [tab, setTab] = useState<'pending' | 'edits' | 'all' | 'categories' | 'keywords'>('pending');

	return (
		<Page>
			<PageHeader title='Business Directory' />
			<Tabs>
				<Tabs.Item selected={tab === 'pending'} onClick={() => setTab('pending')}>Pending Approvals</Tabs.Item>
				<Tabs.Item selected={tab === 'edits'} onClick={() => setTab('edits')}>Pending Edits</Tabs.Item>
				<Tabs.Item selected={tab === 'all'} onClick={() => setTab('all')}>All Listings</Tabs.Item>
				<Tabs.Item selected={tab === 'categories'} onClick={() => setTab('categories')}>Categories</Tabs.Item>
				<Tabs.Item selected={tab === 'keywords'} onClick={() => setTab('keywords')}>Bot Keywords</Tabs.Item>
			</Tabs>
			<PageScrollableContent>
				<Box p='x24'>
					{tab === 'pending' && <PendingTab />}
					{tab === 'edits' && <PendingEditsTab />}
					{tab === 'all' && <AllListingsTab />}
					{tab === 'categories' && <CategoriesTab />}
					{tab === 'keywords' && <BotKeywordsTab />}
				</Box>
			</PageScrollableContent>
		</Page>
	);
}
