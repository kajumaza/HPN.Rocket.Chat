import { Box, Button, TextInput, Skeleton, Tag } from '@rocket.chat/fuselage';
import DOMPurify from 'dompurify';
import { Meteor } from 'meteor/meteor';
import { useUserId } from '@rocket.chat/ui-contexts';
import { useEffect, useRef, useState } from 'react';

type JobListing = {
	_id: string;
	type: 'job' | 'cv';
	title: string;
	organisation?: string;
	location?: string;
	applyContact?: string;
	jobSpecFileName?: string;
	jobSpecFileData?: string;
	jobSpecFileType?: string;
	// CV-only fields
	description?: string;
	experience?: string;
	specialisations?: string;
	availability?: string;
	contactInfo?: string;
	cvFileName?: string;
	cvFileData?: string;
	cvFileType?: string;
	submittedBy: string;
	submittedByUsername: string;
	submittedAt: string;
};

function cleanPastedHtml(html: string): string {
	const doc = new DOMParser().parseFromString(html, 'text/html');

	// Convert an element's inline children to clean HTML, keeping only b/i/u/br/span content
	const inlineToHtml = (node: Node): string => {
		if (node.nodeType === Node.TEXT_NODE) {
			return (node.textContent ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return '';
		const el = node as Element;
		const tag = el.tagName.toLowerCase();
		const inner = Array.from(el.childNodes).map(inlineToHtml).join('');
		if (tag === 'b' || tag === 'strong') return `<b>${inner}</b>`;
		if (tag === 'i' || tag === 'em') return `<i>${inner}</i>`;
		if (tag === 'u') return `<u>${inner}</u>`;
		if (tag === 'br') return '';
		if (tag === 'a') return inner;
		if (tag.includes(':')) return ''; // Office namespace tags (o:p, w:sdt, etc)
		return inner;
	};

	const lines: string[] = [];

	const processBlock = (el: Element) => {
		const tag = el.tagName.toLowerCase();
		if (['style', 'script', 'head', 'meta', 'link'].includes(tag)) return;
		if (tag.includes(':')) return;

		// Lists: convert each <li> to a prefixed line
		if (tag === 'ul' || tag === 'ol') {
			let counter = 1;
			Array.from(el.children).forEach((li) => {
				if (li.tagName.toLowerCase() === 'li') {
					const prefix = tag === 'ul' ? '• ' : `${counter}. `;
					lines.push(`<div>${prefix}${inlineToHtml(li)}</div>`);
					counter++;
				}
			});
			return;
		}

		if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(tag)) {
			// Word list paragraph: has mso-list in style
			const style = el.getAttribute('style') ?? '';
			if (style.includes('mso-list')) {
				// Remove the bullet symbol span Word injects
				Array.from(el.querySelectorAll('[style*="mso-list:Ignore"]') ).forEach((s) => s.remove());
				const content = inlineToHtml(el);
				if (content.trim()) lines.push(`<div>• ${content}</div>`);
				return;
			}
			// Check for child blocks to recurse into (e.g. nested divs)
			const hasBlockChildren = Array.from(el.children).some((c) =>
				['p', 'div', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(c.tagName.toLowerCase()),
			);
			if (hasBlockChildren) {
				Array.from(el.childNodes).forEach((child) => {
					if (child.nodeType === Node.ELEMENT_NODE) processBlock(child as Element);
					else if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim())
						lines.push(`<div>${inlineToHtml(child)}</div>`);
				});
				return;
			}
			// Leaf block: emit as a single line
			const content = inlineToHtml(el);
			lines.push(`<div>${content || '<br>'}</div>`);
			return;
		}
		// Unknown block-ish element: recurse into children
		Array.from(el.childNodes).forEach((child) => {
			if (child.nodeType === Node.ELEMENT_NODE) processBlock(child as Element);
		});
	};

	Array.from(doc.body.childNodes).forEach((child) => {
		if (child.nodeType === Node.ELEMENT_NODE) processBlock(child as Element);
		else if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim())
			lines.push(`<div>${inlineToHtml(child)}</div>`);
	});

	return lines.join('');
}

const toolbarBtn: React.CSSProperties = {
	width: 28, height: 28, border: '1px solid #ccc', borderRadius: 3,
	background: 'white', cursor: 'pointer', fontSize: 13, lineHeight: 1,
	display: 'flex', alignItems: 'center', justifyContent: 'center',
};

function RichTextarea({ initialValue, onChange, placeholder, rows = 5 }: {
	initialValue: string;
	onChange: (val: string) => void;
	placeholder?: string;
	rows?: number;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const ready = useRef(false);

	useEffect(() => {
		if (ref.current && !ready.current) {
			ref.current.innerHTML = initialValue || '';
			ready.current = true;
		}
	}, []);

	const exec = (cmd: string) => {
		ref.current?.focus();
		document.execCommand(cmd, false, undefined);
	};

	const insertListItem = (e: React.MouseEvent, ordered: boolean) => {
		e.preventDefault();
		const el = ref.current;
		if (!el) return;
		el.focus();

		const sel = window.getSelection();
		const hasSelection = sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed;

		if (hasSelection) {
			const range = sel!.getRangeAt(0);
			const affected = Array.from(el.childNodes).filter((n) => range.intersectsNode(n));

			const txt = (n: Node) => n.textContent?.trimStart() ?? '';
			const allBullet = affected.length > 0 && affected.every((n) => /^•[\s\u00A0]/.test(txt(n)));
			const allNumber = affected.length > 0 && affected.every((n) => /^\d+\.[\s\u00A0]/.test(txt(n)));
			const removing = ordered ? allNumber : allBullet;

			const strip = (html: string) => html.replace(/^[•\u2022][\s\u00A0]?|^\d+\.[\s\u00A0]?/, '');

			let counter = 1;
			affected.forEach((node) => {
				if (node.nodeType === Node.TEXT_NODE) {
					let text = strip(node.textContent ?? '');
					if (!removing) text = (ordered ? `${counter}. ` : '• ') + text;
					node.textContent = text;
					counter++;
				} else if (node.nodeType === Node.ELEMENT_NODE) {
					const nodeEl = node as HTMLElement;
					let html = strip(nodeEl.innerHTML);
					if (!removing) html = (ordered ? `${counter}. ` : '• ') + html;
					nodeEl.innerHTML = html;
					counter++;
				}
			});
			onChange(el.innerHTML);
		} else {
			document.execCommand('insertParagraph', false);
			document.execCommand('insertText', false, ordered ? '1. ' : '• ');
			onChange(el.innerHTML);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key !== 'Enter') return;
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const range = sel.getRangeAt(0);

		// Walk up from cursor to find block element and its text
		let node: Node | null = range.startContainer;
		let lineText = node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '') : '';
		let blockEl: Node | null = null;
		let p: Node | null = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
		while (p && p !== ref.current) {
			const tag = (p as Element).tagName?.toLowerCase();
			if (tag === 'div' || tag === 'p') { lineText = (p as Element).textContent ?? ''; blockEl = p; break; }
			p = p.parentNode;
		}

		const trimmed = lineText.trimStart();
		const isBullet = /^[•][\s\u00A0]/.test(trimmed);
		const numMatch = trimmed.match(/^(\d+)\.[\s\u00A0]/);
		if (!isBullet && !numMatch) return;

		e.preventDefault();
		// Content after prefix — if empty, exit list mode
		const afterPrefix = trimmed.replace(/^[•][\s\u00A0]?/, '').replace(/^\d+\.[\s\u00A0]?/, '').trim();

		if (afterPrefix === '') {
			// Empty bullet/number line — clear it and exit list
			if (blockEl && blockEl.nodeType === Node.ELEMENT_NODE) {
				(blockEl as HTMLElement).innerHTML = '';
				const r = document.createRange();
				r.setStart(blockEl, 0);
				r.collapse(true);
				sel.removeAllRanges();
				sel.addRange(r);
			} else {
				// First-line text node fallback
				document.execCommand('selectAll', false);
				document.execCommand('delete', false);
			}
		} else if (isBullet) {
			document.execCommand('insertParagraph', false);
			document.execCommand('insertText', false, '• ');
		} else if (numMatch) {
			document.execCommand('insertParagraph', false);
			document.execCommand('insertText', false, `${parseInt(numMatch[1]) + 1}. `);
		}
		onChange(ref.current!.innerHTML);
	};

	const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
		e.preventDefault();
		const html = e.clipboardData.getData('text/html');
		const text = e.clipboardData.getData('text/plain');
		if (html) {
			document.execCommand('insertHTML', false, cleanPastedHtml(html));
		} else if (text) {
			const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
			const lines = escaped.split('\n').map((l: string) => `<div>${l || '<br>'}</div>`).join('');
			document.execCommand('insertHTML', false, lines);
		}
		if (ref.current) onChange(ref.current.innerHTML);
	};

	return (
		<div style={{ border: '1px solid #ddd', borderRadius: 4, overflow: 'hidden' }}>
			<div style={{ display: 'flex', gap: 3, padding: '5px 8px', background: '#f5f5f5', borderBottom: '1px solid #ddd', flexWrap: 'wrap' }}>
				<button type='button' onMouseDown={(e) => { e.preventDefault(); exec('bold'); }} title='Bold' style={{ ...toolbarBtn, fontWeight: 700 }}>B</button>
				<button type='button' onMouseDown={(e) => { e.preventDefault(); exec('italic'); }} title='Italic' style={{ ...toolbarBtn, fontStyle: 'italic' }}>I</button>
				<button type='button' onMouseDown={(e) => { e.preventDefault(); exec('underline'); }} title='Underline' style={{ ...toolbarBtn, textDecoration: 'underline' }}>U</button>
				<div style={{ width: 1, background: '#ddd', margin: '2px 4px' }} />
				<button type='button' onMouseDown={(e) => insertListItem(e, false)} title='Bullet list' style={toolbarBtn}>•</button>
				<button type='button' onMouseDown={(e) => insertListItem(e, true)} title='Numbered list' style={{ ...toolbarBtn, fontSize: 11 }}>1.</button>
			</div>
			<div
				ref={ref}
				contentEditable
				suppressContentEditableWarning
				onKeyDown={handleKeyDown}
				onPaste={handlePaste}
				onInput={() => { if (ref.current) onChange(ref.current.innerHTML); }}
				style={{ minHeight: rows * 26, padding: 8, fontSize: 14, outline: 'none', lineHeight: 1.6, resize: 'vertical', overflow: 'auto' }}
			/>
			{placeholder && (
				<style>{`[contenteditable]:empty:before { content: attr(data-ph); color: #aaa; }`}</style>
			)}
		</div>
	);
}

function downloadFile(data: string, filename: string, mimeType: string) {
	const bytes = atob(data);
	const arr = new Uint8Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
	const blob = new Blob([arr], { type: mimeType || 'application/octet-stream' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url; a.download = filename; a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function JobCard({ item, currentUserId, onEdit, onDelete }: { item: JobListing; currentUserId: string | null; onEdit: (item: JobListing) => void; onDelete: (id: string) => void }) {
	const [expanded, setExpanded] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const isJob = item.type === 'job';
	const isOwner = currentUserId === item.submittedBy;

	return (
		<Box borderRadius='x4' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light' bg='surface' p='x16'>
			<Box display='flex' justifyContent='space-between' alignItems='flex-start'>
				<Box flexGrow={1} mie='x8'>
					<Box display='flex' alignItems='center' style={{ gap: 8 }} mb='x4'>
						<Box fontSize='x18' fontWeight='700' color='default'>{item.title}</Box>
						<Tag variant={isJob ? 'primary' : 'secondary'}>{isJob ? '💼 Job' : '📄 CV'}</Tag>
					</Box>
					{isJob && (
						<Box color='hint' fontSize='x13'>
							{item.organisation && `🏢 ${item.organisation}`}
							{item.organisation && item.location && ' · '}
							{item.location && `📍 ${item.location}`}
						</Box>
					)}
					{!isJob && item.experience && (
						<Box color='hint' fontSize='x13'>⏱ {item.experience} years experience{item.availability ? ` · Available: ${item.availability}` : ''}</Box>
					)}
				</Box>
				<Box display='flex' style={{ gap: 6 }} alignItems='center'>
					{isOwner && !confirming && (
						<>
							<Button small onClick={() => onEdit(item)} title='Edit'>✏️</Button>
							<Button small danger onClick={() => setConfirming(true)} title='Delete'>🗑️</Button>
						</>
					)}
					{isOwner && confirming && (
						<Box display='flex' alignItems='center' style={{ gap: 6 }}>
							<Box fontSize='x12' color='danger'>Delete?</Box>
							<Button small danger onClick={() => onDelete(item._id)}>Yes</Button>
							<Button small onClick={() => setConfirming(false)}>No</Button>
						</Box>
					)}
					<Button small icon={expanded ? 'chevron-up' : 'chevron-down'} onClick={() => setExpanded((e) => !e)} />
				</Box>
			</Box>

			{expanded && (
				<Box mt='x16' pt='x16' borderBlockStartWidth='x2' borderBlockStartStyle='solid' borderBlockStartColor='stroke-extra-light'>
					{isJob ? (
						<>
							{item.applyContact && (
								<>
									<Box mb='x4' fontSize='x13' fontWeight='600' color='hint'>HOW TO APPLY</Box>
									<Box color='default' fontSize='x14' mb='x16'>{item.applyContact}</Box>
								</>
							)}
							{item.jobSpecFileData && (
								<Button small onClick={() => downloadFile(item.jobSpecFileData!, item.jobSpecFileName || 'job-spec.pdf', item.jobSpecFileType || 'application/pdf')}>
									📄 Download Job Spec ({item.jobSpecFileName})
								</Button>
							)}
						</>
					) : (
						<>
							<Box mb='x4' fontSize='x13' fontWeight='600' color='hint'>ABOUT ME</Box>
							<Box color='default' fontSize='x14' mb='x16' dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.description ?? '') }} />

							{item.specialisations && (
								<>
									<Box mb='x4' fontSize='x13' fontWeight='600' color='hint'>KEY SPECIALISATIONS</Box>
									<Box color='default' fontSize='x14' mb='x16' dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.specialisations) }} />
								</>
							)}

							<Box mb='x4' fontSize='x13' fontWeight='600' color='hint'>CONTACT</Box>
							<Box color='default' fontSize='x14'>{item.contactInfo}</Box>

							{item.cvFileData && (
								<Box mt='x12'>
									<Button small onClick={() => downloadFile(item.cvFileData!, item.cvFileName || 'cv.pdf', item.cvFileType || 'application/octet-stream')}>
										📄 Download CV ({item.cvFileName})
									</Button>
								</Box>
							)}
						</>
					)}
				</Box>
			)}
		</Box>
	);
}

function PostJobForm({ onDone, existing }: { onDone: () => void; existing?: JobListing }) {
	const isEdit = !!existing;
	const [type, setType] = useState<'job' | 'cv'>(existing?.type ?? 'job');
	const isJob = type === 'job';

	// Job fields
	const [jobForm, setJobForm] = useState({
		title: existing?.title ?? '',
		organisation: existing?.organisation ?? '',
		location: existing?.location ?? '',
		applyContact: existing?.applyContact ?? '',
	});
	const [jobSpecFile, setJobSpecFile] = useState<{ name: string; data: string; type: string } | null>(null);
	const [jobFileError, setJobFileError] = useState('');

	// CV fields
	const [cvForm, setCvForm] = useState({
		title: existing?.title ?? '',
		description: existing?.description ?? '',
		experience: existing?.experience ?? '',
		specialisations: existing?.specialisations ?? '',
		availability: existing?.availability ?? '',
		contactInfo: existing?.contactInfo ?? '',
	});
	const [cvFile, setCvFile] = useState<{ name: string; data: string; type: string } | null>(null);
	const [cvFileError, setCvFileError] = useState('');

	const [submitting, setSubmitting] = useState(false);
	const [done, setDone] = useState(false);
	const [error, setError] = useState('');

	const handleJobSpecFile = (e: React.ChangeEvent<HTMLInputElement>) => {
		setJobFileError('');
		const file = e.target.files?.[0];
		if (!file) { setJobSpecFile(null); return; }
		if (file.size > 10 * 1024 * 1024) { setJobFileError('File must be under 10 MB.'); return; }
		const reader = new FileReader();
		reader.onload = () => setJobSpecFile({ name: file.name, data: (reader.result as string).split(',')[1], type: file.type });
		reader.readAsDataURL(file);
	};

	const handleCvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
		setCvFileError('');
		const file = e.target.files?.[0];
		if (!file) { setCvFile(null); return; }
		if (file.size > 5 * 1024 * 1024) { setCvFileError('File must be under 5 MB.'); return; }
		const reader = new FileReader();
		reader.onload = () => setCvFile({ name: file.name, data: (reader.result as string).split(',')[1], type: file.type });
		reader.readAsDataURL(file);
	};

	const setJob = (f: string) => (e: any) => setJobForm((prev) => ({ ...prev, [f]: e.target.value }));
	const setCv = (f: string) => (e: any) => setCvForm((prev) => ({ ...prev, [f]: e.target.value }));

	const submit = async () => {
		if (isJob) {
			if (!jobForm.title.trim()) { setError('Job title is required.'); return; }
		} else {
			if (!cvForm.title.trim() || !cvForm.description.trim()) { setError('Title and description are required.'); return; }
		}
		setSubmitting(true); setError('');
		try {
			if (isEdit && existing) {
				await Meteor.callAsync('hpn/jobs/edit', existing._id, isJob
					? { ...jobForm, jobSpecFileName: jobSpecFile?.name, jobSpecFileData: jobSpecFile?.data, jobSpecFileType: jobSpecFile?.type }
					: { ...cvForm, cvFileName: cvFile?.name, cvFileData: cvFile?.data, cvFileType: cvFile?.type },
				);
			} else {
				await Meteor.callAsync('hpn/jobs/submit', isJob
					? { type: 'job', ...jobForm, jobSpecFileName: jobSpecFile?.name, jobSpecFileData: jobSpecFile?.data, jobSpecFileType: jobSpecFile?.type }
					: { type: 'cv', ...cvForm, cvFileName: cvFile?.name, cvFileData: cvFile?.data, cvFileType: cvFile?.type },
				);
			}
			setDone(true);
			setTimeout(onDone, 2000);
		} catch (err: any) {
			setError(err.reason || err.message || 'Submission failed.');
		} finally { setSubmitting(false); }
	};

	if (done) {
		return (
			<Box color='success' fontSize='x14' p='x16'>
				{isJob
					? (isEdit ? '✓ Job updated.' : '✓ Job posted successfully.')
					: (isEdit ? '✓ CV updated.' : '✓ CV posted successfully.')
				}
			</Box>
		);
	}

	return (
		<Box display='flex' flexDirection='column' style={{ gap: 14 }} p='x16' borderRadius='x4' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light' bg='surface'>
			<Box fontSize='x16' fontWeight='700' color='default'>{isEdit ? `Edit ${isJob ? 'Job' : 'CV'}` : `Post a ${isJob ? 'Job' : 'CV'}`}</Box>

			{/* Type toggle — only show when creating new */}
			{!isEdit && (
				<Box display='flex' style={{ gap: 8 }}>
					<Button small primary={isJob} onClick={() => setType('job')}>💼 Job Posting</Button>
					<Button small primary={!isJob} onClick={() => setType('cv')}>📄 Post My CV</Button>
				</Box>
			)}

			{isJob ? (
				<Box display='flex' flexDirection='column' style={{ gap: 10 }}>
					<Box>
						<Box fontSize='x13' fontWeight='600' color='hint' mb='x4'>JOB TITLE *</Box>
						<TextInput value={jobForm.title} onChange={setJob('title')} />
					</Box>
					<Box>
						<Box fontSize='x13' fontWeight='600' color='hint' mb='x4'>COMPANY</Box>
						<TextInput value={jobForm.organisation} onChange={setJob('organisation')} />
					</Box>
					<Box>
						<Box fontSize='x13' fontWeight='600' color='hint' mb='x4'>LOCATION / REMOTE</Box>
						<TextInput value={jobForm.location} onChange={setJob('location')} placeholder='e.g. Cape Town / Remote' />
					</Box>
					<Box>
						<Box fontSize='x13' fontWeight='600' color='hint' mb='x4'>HOW TO APPLY (email or link)</Box>
						<TextInput value={jobForm.applyContact} onChange={setJob('applyContact')} />
					</Box>
					<Box>
						<Box fontSize='x13' fontWeight='600' color='hint' mb='x4'>JOB SPEC (PDF — max 10 MB)</Box>
						<input type='file' accept='.pdf' onChange={handleJobSpecFile} style={{ fontSize: 14 }} />
						{jobFileError && <Box color='danger' fontSize='x13' mt='x4'>{jobFileError}</Box>}
						{jobSpecFile && <Box color='success' fontSize='x13' mt='x4'>✓ {jobSpecFile.name}</Box>}
					</Box>
				</Box>
			) : (
				<Box display='flex' flexDirection='column' style={{ gap: 10 }}>
					<Box>
						<Box fontSize='x13' fontWeight='600' color='hint' mb='x4'>CURRENT / MOST RECENT TITLE *</Box>
						<TextInput value={cvForm.title} onChange={setCv('title')} />
					</Box>
					<Box>
						<Box fontSize='x13' fontWeight='600' color='hint' mb='x4'>YEARS OF EXPERIENCE</Box>
						<TextInput value={cvForm.experience} onChange={setCv('experience')} placeholder='e.g. 5' />
					</Box>
					<Box>
						<Box fontSize='x13' fontWeight='600' color='hint' mb='x4'>AVAILABILITY</Box>
						<TextInput value={cvForm.availability} onChange={setCv('availability')} placeholder='e.g. Immediately / 1 month notice' />
					</Box>
					<Box>
						<Box fontSize='x13' fontWeight='600' color='hint' mb='x4'>ABOUT ME *</Box>
						<RichTextarea initialValue={cvForm.description} onChange={(val) => setCvForm((f) => ({ ...f, description: val }))} rows={5} />
					</Box>
					<Box>
						<Box fontSize='x13' fontWeight='600' color='hint' mb='x4'>KEY SPECIALISATIONS</Box>
						<RichTextarea initialValue={cvForm.specialisations} onChange={(val) => setCvForm((f) => ({ ...f, specialisations: val }))} rows={3} placeholder='e.g. Talent Acquisition, L&D, Compliance' />
					</Box>
					<Box>
						<Box fontSize='x13' fontWeight='600' color='hint' mb='x4'>CONTACT / LINKEDIN</Box>
						<TextInput value={cvForm.contactInfo} onChange={setCv('contactInfo')} />
					</Box>
					<Box>
						<Box fontSize='x13' fontWeight='600' color='hint' mb='x4'>ATTACH CV (PDF, Word — max 5 MB)</Box>
						<input type='file' accept='.pdf,.doc,.docx' onChange={handleCvFile} style={{ fontSize: 14 }} />
						{cvFileError && <Box color='danger' fontSize='x13' mt='x4'>{cvFileError}</Box>}
						{cvFile && <Box color='success' fontSize='x13' mt='x4'>✓ {cvFile.name}</Box>}
					</Box>
				</Box>
			)}

			{error && <Box color='danger' fontSize='x14'>{error}</Box>}
			<Box display='flex' style={{ gap: 8 }}>
				<Button primary disabled={submitting} onClick={submit}>
					{submitting ? 'Saving…' : isEdit ? 'Save Changes' : isJob ? 'Post Job' : 'Post CV'}
				</Button>
				<Button onClick={onDone}>Cancel</Button>
			</Box>
		</Box>
	);
}

export default function HpnJobBoardPage() {
	const currentUserId = useUserId();
	const [tab, setTab] = useState<'jobs' | 'cvs'>('jobs');
	const [listings, setListings] = useState<JobListing[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState('');
	const [posting, setPosting] = useState(false);
	const [editingItem, setEditingItem] = useState<JobListing | null>(null);

	const handleDelete = async (id: string) => {
		try {
			await Meteor.callAsync('hpn/jobs/delete', id);
			load(tab === 'jobs' ? 'job' : 'cv');
		} catch (err: any) { alert(err.reason || 'Delete failed'); }
	};

	const load = (t: 'job' | 'cv') => {
		setLoading(true);
		Meteor.callAsync('hpn/jobs/get', t)
			.then((res: any) => setListings(res ?? []))
			.finally(() => setLoading(false));
	};

	useEffect(() => { load(tab === 'jobs' ? 'job' : 'cv'); }, [tab]);

	const filtered = listings.filter(
		(l) => !search || l.title.toLowerCase().includes(search.toLowerCase()) ||
			(l.organisation ?? '').toLowerCase().includes(search.toLowerCase()) ||
			(l.specialisations ?? '').toLowerCase().includes(search.toLowerCase()),
	);

	return (
		<Box display='flex' flexDirection='column' height='100%' bg='surface-light'>
			{/* Header */}
			<Box p='x24' pb='x0' borderBlockEndWidth='x2' borderBlockEndStyle='solid' borderBlockEndColor='stroke-extra-light' bg='surface'>
				<Box display='flex' justifyContent='space-between' alignItems='center' mb='x16'>
					<Box fontSize='x24' fontWeight='700' color='default'>HPN Job Board</Box>
					{!posting && !editingItem && (
						<Button primary small onClick={() => setPosting(true)}>+ Post a Job / CV</Button>
					)}
				</Box>

				{/* Tabs */}
				<Box display='flex' style={{ gap: 0 }} mb='x0'>
					{(['jobs', 'cvs'] as const).map((t) => (
						<Box
							key={t}
							as='button'
							onClick={() => { setTab(t); setSearch(''); }}
							style={{
								padding: '8px 20px',
								fontWeight: tab === t ? 700 : 400,
								borderBottom: tab === t ? '3px solid #C41230' : '3px solid transparent',
								color: tab === t ? '#C41230' : 'inherit',
								background: 'transparent',
								cursor: 'pointer',
								fontSize: 14,
							}}
						>
							{t === 'jobs' ? '💼 Jobs' : '📄 CVs'}
						</Box>
					))}
				</Box>
			</Box>

			<Box flexGrow={1} overflow='auto' p='x24'>
				{(posting || editingItem) && (
					<Box mb='x20'>
						<PostJobForm
							existing={editingItem ?? undefined}
							onDone={() => { setPosting(false); setEditingItem(null); load(tab === 'jobs' ? 'job' : 'cv'); }}
						/>
					</Box>
				)}

				{/* Search */}
				{!posting && !editingItem && (
					<Box mb='x16' style={{ maxWidth: 360 }}>
						<TextInput
							placeholder={tab === 'jobs' ? 'Search jobs…' : 'Search CVs…'}
							value={search}
							onChange={(e: any) => setSearch(e.target.value)}
							addon={<Box style={{ padding: '0 4px', color: '#888' }}>🔍</Box>}
						/>
					</Box>
				)}

				{loading ? (
					<Box display='flex' flexDirection='column' style={{ gap: 12 }}>
						{[1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 80, borderRadius: 4 }} />)}
					</Box>
				) : filtered.length === 0 ? (
					<Box color='hint' textAlign='center' mt='x48' fontSize='x16'>
						{search ? 'No results match your search.' : `No ${tab === 'jobs' ? 'job postings' : 'CVs'} yet.`}
					</Box>
				) : (
					<Box display='flex' flexDirection='column' style={{ gap: 12 }}>
						{filtered.map((item) => <JobCard key={item._id} item={item} currentUserId={currentUserId} onEdit={(i) => { setEditingItem(i); setPosting(false); }} onDelete={handleDelete} />)}
					</Box>
				)}
			</Box>
		</Box>
	);
}
