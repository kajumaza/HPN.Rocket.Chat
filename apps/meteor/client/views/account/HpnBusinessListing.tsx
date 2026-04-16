import {
	Box,
	Button,
	Field,
	FieldLabel,
	FieldRow,
	FieldError,
	FieldHint,
	TextInput,
	Skeleton,
} from '@rocket.chat/fuselage';
import { Page, PageHeader, PageScrollableContentWithShadow } from '@rocket.chat/ui-client';
import { Meteor } from 'meteor/meteor';
import { useEffect, useRef, useState } from 'react';

type PendingEdit = {
	businessName: string;
	categories: string[];
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
	category?: string; // legacy
	briefDescription: string;
	fullDescription: string;
	contactName: string;
	contactEmail: string;
	contactPhone: string;
	website: string;
	status: 'pending' | 'approved' | 'rejected';
	rejectionReason: string;
	pendingEdit?: PendingEdit;
	editStatus?: 'pending' | 'rejected' | null;
};

type Category = { _id: string; name: string; slug: string };

type FormData = {
	businessName: string;
	categories: string[];
	briefDescription: string;
	fullDescription: string;
	contactName: string;
	contactEmail: string;
	contactPhone: string;
	website: string;
};

const emptyForm: FormData = {
	businessName: '',
	categories: [],
	briefDescription: '',
	fullDescription: '',
	contactName: '',
	contactEmail: '',
	contactPhone: '',
	website: '',
};

function listingToForm(l: Listing): FormData {
	return {
		businessName: l.businessName,
		categories: l.categories?.length ? l.categories : (l.category ? [l.category] : []),
		briefDescription: l.briefDescription,
		fullDescription: l.fullDescription,
		contactName: l.contactName,
		contactEmail: l.contactEmail,
		contactPhone: l.contactPhone ?? '',
		website: l.website ?? '',
	};
}

function StatusBadge({ status, color }: { status: string; color: string }) {
	return (
		<Box
			display='inline-flex'
			alignItems='center'
			borderRadius='x2'
			px='x8'
			py='x4'
			fontSize='x12'
			fontWeight='700'
			style={{ background: color, color: '#fff', textTransform: 'uppercase', letterSpacing: 1 }}
		>
			{status}
		</Box>
	);
}

function CategoryPicker({
	categories,
	selected,
	maxCategories,
	onChange,
}: {
	categories: Category[];
	selected: string[];
	maxCategories: number;
	onChange: (slugs: string[]) => void;
}) {
	const toggle = (slug: string) => {
		if (selected.includes(slug)) {
			onChange(selected.filter((s) => s !== slug));
		} else if (selected.length < maxCategories) {
			onChange([...selected, slug]);
		}
	};

	return (
		<Box display='flex' flexWrap='wrap' style={{ gap: 6 }}>
			{categories.map((c) => {
				const active = selected.includes(c.slug);
				const atMax = !active && selected.length >= maxCategories;
				return (
					<Box
						key={c._id}
						as='button'
						type='button'
						onClick={() => !atMax && toggle(c.slug)}
						style={{
							padding: '4px 14px',
							borderRadius: 16,
							border: active ? '2px solid #C41230' : '2px solid #ddd',
							background: active ? '#C41230' : 'transparent',
							color: active ? '#fff' : atMax ? '#bbb' : 'inherit',
							cursor: atMax ? 'not-allowed' : 'pointer',
							fontSize: 13,
							fontWeight: active ? 600 : 400,
							transition: 'all 0.15s',
						}}
					>
						{c.name}
					</Box>
				);
			})}
		</Box>
	);
}

function cleanPastedHtml(html: string): string {
	const doc = new DOMParser().parseFromString(html, 'text/html');
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
		if (tag.includes(':')) return '';
		return inner;
	};
	const lines: string[] = [];
	const processBlock = (el: Element) => {
		const tag = el.tagName.toLowerCase();
		if (['style', 'script', 'head', 'meta', 'link'].includes(tag)) return;
		if (tag.includes(':')) return;
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
			const style = el.getAttribute('style') ?? '';
			if (style.includes('mso-list')) {
				Array.from(el.querySelectorAll('[style*="mso-list:Ignore"]')).forEach((s) => s.remove());
				const content = inlineToHtml(el);
				if (content.trim()) lines.push(`<div>• ${content}</div>`);
				return;
			}
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
			const content = inlineToHtml(el);
			lines.push(`<div>${content || '<br>'}</div>`);
			return;
		}
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
	const exec = (cmd: string) => { ref.current?.focus(); document.execCommand(cmd, false, undefined); };
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
					node.textContent = text; counter++;
				} else if (node.nodeType === Node.ELEMENT_NODE) {
					const nodeEl = node as HTMLElement;
					let html = strip(nodeEl.innerHTML);
					if (!removing) html = (ordered ? `${counter}. ` : '• ') + html;
					nodeEl.innerHTML = html; counter++;
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
		const afterPrefix = trimmed.replace(/^[•][\s\u00A0]?/, '').replace(/^\d+\.[\s\u00A0]?/, '').trim();
		if (afterPrefix === '') {
			if (blockEl && blockEl.nodeType === Node.ELEMENT_NODE) {
				(blockEl as HTMLElement).innerHTML = '';
				const r = document.createRange();
				r.setStart(blockEl, 0); r.collapse(true);
				sel.removeAllRanges(); sel.addRange(r);
			} else {
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

function ListingForm({
	form,
	errors,
	categories,
	maxCategories,
	submitting,
	submitError,
	submitted,
	onChange,
	onCategoriesChange,
	onSubmit,
	onCancel,
	isEdit,
}: {
	form: FormData;
	errors: Partial<Record<keyof FormData, string>>;
	categories: Category[];
	maxCategories: number;
	submitting: boolean;
	submitError: string;
	submitted: boolean;
	onChange: (field: keyof FormData) => (e: any) => void;
	onCategoriesChange: (slugs: string[]) => void;
	onSubmit: () => void;
	onCancel?: () => void;
	isEdit: boolean;
}) {
	return (
		<Box display='flex' flexDirection='column' style={{ gap: 16 }}>
			{submitted && (
				<Box color='success' fontSize='x14'>
					&#10003; {isEdit ? 'Your updated listing has been submitted and is pending review. The current approved version remains live.' : 'Your listing has been submitted and is pending review.'}
				</Box>
			)}

			<Field>
				<FieldLabel>Business Name *</FieldLabel>
				<FieldRow><TextInput value={form.businessName} onChange={onChange('businessName')} /></FieldRow>
				{errors.businessName && <FieldError>{errors.businessName}</FieldError>}
			</Field>

			<Field>
				<FieldLabel>
					{maxCategories === 1 ? 'Category *' : `Categories * (select up to ${maxCategories})`}
				</FieldLabel>
				<FieldRow>
					<CategoryPicker
						categories={categories}
						selected={form.categories}
						maxCategories={maxCategories}
						onChange={onCategoriesChange}
					/>
				</FieldRow>
				{maxCategories > 1 && (
					<FieldHint>{form.categories.length} / {maxCategories} selected</FieldHint>
				)}
				{errors.categories && <FieldError>{errors.categories}</FieldError>}
			</Field>

			<Field>
				<FieldLabel>Brief Description * (shown in listing card)</FieldLabel>
				<FieldRow>
					<TextInput value={form.briefDescription} onChange={onChange('briefDescription')} placeholder='One or two sentences summarising your business' />
				</FieldRow>
				{errors.briefDescription && <FieldError>{errors.briefDescription}</FieldError>}
			</Field>

			<Field>
				<FieldLabel>Full Description * (shown when card is expanded)</FieldLabel>
				<FieldRow>
					<RichTextarea
						initialValue={form.fullDescription}
						onChange={(val) => { onChange('fullDescription')(val); }}
						rows={5}
					/>
				</FieldRow>
				{errors.fullDescription && <FieldError>{errors.fullDescription}</FieldError>}
			</Field>

			<Field>
				<FieldLabel>Contact Name *</FieldLabel>
				<FieldRow><TextInput value={form.contactName} onChange={onChange('contactName')} /></FieldRow>
				{errors.contactName && <FieldError>{errors.contactName}</FieldError>}
			</Field>

			<Field>
				<FieldLabel>Contact Email *</FieldLabel>
				<FieldRow><TextInput type='email' value={form.contactEmail} onChange={onChange('contactEmail')} /></FieldRow>
				{errors.contactEmail && <FieldError>{errors.contactEmail}</FieldError>}
			</Field>

			<Field>
				<FieldLabel>Contact Phone</FieldLabel>
				<FieldRow><TextInput type='tel' value={form.contactPhone} onChange={onChange('contactPhone')} /></FieldRow>
			</Field>

			<Field>
				<FieldLabel>Website</FieldLabel>
				<FieldRow><TextInput type='url' value={form.website} onChange={onChange('website')} placeholder='https://' /></FieldRow>
			</Field>

			{submitError && <Box color='danger' fontSize='x14'>{submitError}</Box>}

			<Box display='flex' style={{ gap: 8 }}>
				<Button primary disabled={submitting} onClick={onSubmit}>
					{submitting ? 'Submitting\u2026' : isEdit ? 'Submit Edit for Review' : 'Submit for Review'}
				</Button>
				{onCancel && <Button onClick={onCancel}>Cancel</Button>}
			</Box>
		</Box>
	);
}

export default function HpnBusinessListing() {
	const [listing, setListing] = useState<Listing | null | undefined>(undefined);
	const [categories, setCategories] = useState<Category[]>([]);
	const [maxCategories, setMaxCategories] = useState(1);
	const [form, setForm] = useState<FormData>(emptyForm);
	const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState('');
	const [submitted, setSubmitted] = useState(false);
	const [editing, setEditing] = useState(false);

	const reload = async () => {
		const res: any = await Meteor.callAsync('hpn/directory/my-listing');
		setListing(res ?? null);
	};

	useEffect(() => {
		reload();
		Meteor.callAsync('hpn/directory/categories/get').then((res: any) => setCategories(res ?? []));
		Meteor.callAsync('hpn/directory/settings/get').then((res: any) => setMaxCategories(res?.maxCategories ?? 1));
	}, []);

	const set = (field: keyof FormData) => (e: any) => {
		setForm((f) => ({ ...f, [field]: e.target?.value ?? e }));
		setErrors((e2) => ({ ...e2, [field]: undefined }));
	};

	const setCategories_ = (slugs: string[]) => {
		setForm((f) => ({ ...f, categories: slugs }));
		setErrors((e) => ({ ...e, categories: undefined }));
	};

	const validate = (): boolean => {
		const e: Partial<Record<keyof FormData, string>> = {};
		if (!form.businessName.trim()) e.businessName = 'Required';
		if (!form.categories.length) e.categories = 'Select at least one category';
		if (!form.briefDescription.trim()) e.briefDescription = 'Required';
		if (!form.fullDescription.replace(/<[^>]*>/g, '').trim()) e.fullDescription = 'Required';
		if (!form.contactName.trim()) e.contactName = 'Required';
		if (!form.contactEmail.trim()) e.contactEmail = 'Required';
		setErrors(e);
		return Object.keys(e).length === 0;
	};

	const handleSubmit = async (isEdit: boolean) => {
		if (!validate()) return;
		setSubmitting(true);
		setSubmitError('');
		try {
			await Meteor.callAsync(isEdit ? 'hpn/directory/submit-edit' : 'hpn/directory/submit', form);
			setSubmitted(true);
			setEditing(false);
			await reload();
		} catch (err: any) {
			setSubmitError(err.reason || err.message || 'Submission failed.');
		} finally {
			setSubmitting(false);
		}
	};

	const startEdit = (prefill: FormData) => {
		setForm(prefill);
		setErrors({});
		setSubmitError('');
		setSubmitted(false);
		setEditing(true);
	};

	const renderContent = () => {
		if (listing === undefined) {
			return <Box p='x24'><Skeleton style={{ height: 24, width: 200, marginBottom: 12 }} /><Skeleton style={{ height: 100 }} /></Box>;
		}

		const isRejected = listing?.status === 'rejected';
		if (!listing || isRejected) {
			return (
				<Box p='x24' maxWidth='x640'>
					<Box fontSize='x20' fontWeight='700' color='default' mb='x4'>
						{isRejected ? 'Resubmit Business Listing' : 'Submit Your Business Listing'}
					</Box>
					<Box color='hint' fontSize='x14' mb='x20'>
						{isRejected
							? 'Your previous submission was not approved. Please review the reason below and resubmit.'
							: 'Fill in your business details. An admin will review your submission before it goes live.'}
					</Box>
					{isRejected && listing?.rejectionReason && (
						<Box bg='surface' borderRadius='x4' p='x12' mb='x16' fontSize='x14' color='default' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light'>
							<Box fontWeight='700' mb='x4'>Rejection reason:</Box>
							{listing.rejectionReason}
						</Box>
					)}
					<ListingForm
						form={form}
						errors={errors}
						categories={categories}
						maxCategories={maxCategories}
						submitting={submitting}
						submitError={submitError}
						submitted={submitted}
						onChange={set}
						onCategoriesChange={setCategories_}
						onSubmit={() => handleSubmit(false)}
						isEdit={false}
					/>
				</Box>
			);
		}

		if (listing.status === 'pending') {
			return (
				<Box p='x24' maxWidth='x640'>
					<Box display='flex' alignItems='center' style={{ gap: 12 }} mb='x16'>
						<Box fontSize='x20' fontWeight='700' color='default'>My Business Listing</Box>
						<StatusBadge status='pending review' color='#f59f00' />
					</Box>
					<Box color='hint' fontSize='x14'>
						Your listing for <strong>{listing.businessName}</strong> is awaiting admin review.
					</Box>
				</Box>
			);
		}

		if (listing.status === 'approved') {
			if (editing) {
				return (
					<Box p='x24' maxWidth='x640'>
						<Box fontSize='x20' fontWeight='700' color='default' mb='x4'>Edit Your Business Listing</Box>
						<Box color='hint' fontSize='x14' mb='x20'>
							Changes will be reviewed before going live. Your current approved listing stays visible until the edit is approved.
						</Box>
						<ListingForm
							form={form}
							errors={errors}
							categories={categories}
							maxCategories={maxCategories}
							submitting={submitting}
							submitError={submitError}
							submitted={submitted}
							onChange={set}
							onCategoriesChange={setCategories_}
							onSubmit={() => handleSubmit(true)}
							onCancel={() => setEditing(false)}
							isEdit={true}
						/>
					</Box>
				);
			}

			if (listing.editStatus === 'pending') {
				return (
					<Box p='x24' maxWidth='x640'>
						<Box display='flex' alignItems='center' style={{ gap: 12 }} mb='x16'>
							<Box fontSize='x20' fontWeight='700' color='default'>My Business Listing</Box>
							<StatusBadge status='approved' color='#12a150' />
						</Box>
						<Box borderRadius='x4' p='x12' mb='x16' fontSize='x14' color='default' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light' bg='surface'>
							<Box fontWeight='700' mb='x4' style={{ color: '#f59f00' }}>&#9999;&#65039; Edit pending review</Box>
							Your updated listing is awaiting admin approval. The current approved version is still live.
						</Box>
						<Box borderRadius='x4' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light' bg='surface' p='x16'>
							<Box fontSize='x16' fontWeight='700' mb='x4'>{listing.businessName}</Box>
							<Box color='hint' fontSize='x14' mb='x4'>{(listing.categories ?? (listing.category ? [listing.category] : [])).join(', ')}</Box>
							<Box color='default' fontSize='x14'>{listing.briefDescription}</Box>
						</Box>
					</Box>
				);
			}

			if (listing.editStatus === 'rejected') {
				return (
					<Box p='x24' maxWidth='x640'>
						<Box display='flex' alignItems='center' style={{ gap: 12 }} mb='x16'>
							<Box fontSize='x20' fontWeight='700' color='default'>My Business Listing</Box>
							<StatusBadge status='approved' color='#12a150' />
						</Box>
						<Box borderRadius='x4' p='x12' mb='x16' fontSize='x14' color='default' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light' bg='surface'>
							<Box fontWeight='700' mb='x4' style={{ color: '#C41230' }}>&#10006; Your recent edit was not approved</Box>
							{listing.pendingEdit?.editRejectionReason && (
								<Box color='hint'>{listing.pendingEdit.editRejectionReason}</Box>
							)}
						</Box>
						<Box borderRadius='x4' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light' bg='surface' p='x16' mb='x16'>
							<Box fontSize='x16' fontWeight='700' mb='x4'>{listing.businessName}</Box>
							<Box color='hint' fontSize='x14' mb='x4'>{(listing.categories ?? (listing.category ? [listing.category] : [])).join(', ')}</Box>
							<Box color='default' fontSize='x14'>{listing.briefDescription}</Box>
						</Box>
						<Button primary onClick={() => startEdit(listingToForm(listing))}>Edit Listing</Button>
					</Box>
				);
			}

			// Approved, no pending edit
			return (
				<Box p='x24' maxWidth='x640'>
					<Box display='flex' alignItems='center' style={{ gap: 12 }} mb='x16'>
						<Box fontSize='x20' fontWeight='700' color='default'>My Business Listing</Box>
						<StatusBadge status='approved' color='#12a150' />
					</Box>
					<Box borderRadius='x4' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light' bg='surface' p='x16' mb='x16'>
						<Box fontSize='x16' fontWeight='700' mb='x4'>{listing.businessName}</Box>
						<Box color='hint' fontSize='x14' mb='x4'>{(listing.categories ?? (listing.category ? [listing.category] : [])).join(', ')}</Box>
						<Box color='default' fontSize='x14' mb='x8'>{listing.briefDescription}</Box>
						{listing.contactName && <Box color='hint' fontSize='x13'>&#128100; {listing.contactName} &middot; &#9993;&#65039; {listing.contactEmail}</Box>}
						{listing.website && <Box color='hint' fontSize='x13' mt='x4'>&#127760; {listing.website}</Box>}
						<Box color='hint' fontSize='x12' mt='x8'>
							Your listing is live and visible to all members in the HPN Business Directory.
						</Box>
					</Box>
					<Button primary onClick={() => startEdit(listingToForm(listing))}>Edit Listing</Button>
				</Box>
			);
		}

		return null;
	};

	return (
		<Page>
			<PageHeader title='My Business Listing' />
			<PageScrollableContentWithShadow>
				{renderContent()}
			</PageScrollableContentWithShadow>
		</Page>
	);
}
