import { Meteor } from 'meteor/meteor';
import { Box, Button, TextInput } from '@rocket.chat/fuselage';
import { Page, PageHeader, PageScrollableContentWithShadow } from '@rocket.chat/ui-client';
import { useSetting } from '@rocket.chat/ui-contexts';
import type { ChangeEvent, ReactElement } from 'react';
import { useState, useCallback } from 'react';

const PRESET_COLORS = [
	{ label: 'HPN Red', value: '#C41230' },
	{ label: 'Black', value: '#1A1A1A' },
	{ label: 'Gold', value: '#C9A84C' },
	{ label: 'Silver', value: '#8E8E8E' },
	{ label: 'Blue', value: '#1D74F5' },
	{ label: 'Grey', value: '#9EA2A8' },
	{ label: 'Orange', value: '#E07B39' },
	{ label: 'Purple', value: '#805AD5' },
	{ label: 'Teal', value: '#38B2AC' },
	{ label: 'Green', value: '#2DC26B' },
	{ label: 'White', value: '#FFFFFF' },
	{ label: 'Dark Grey', value: '#444444' },
];

const BADGE_ROLES = [
	{ key: 'admin', name: 'Admin' },
	{ key: 'owner', name: 'Owner' },
	{ key: 'moderator', name: 'Moderator' },
	{ key: 'executive', name: 'HR Executive' },
	{ key: 'manager', name: 'HR Manager' },
	{ key: 'student', name: 'Student' },
	{ key: 'supplier', name: 'Supplier' },
	{ key: 'free', name: 'Free Member' },
];

function autoTextColor(hex: string): string {
	const c = hex.replace('#', '');
	if (c.length !== 6) return '#FFFFFF';
	const r = parseInt(c.slice(0, 2), 16);
	const g = parseInt(c.slice(2, 4), 16);
	const b = parseInt(c.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.55 ? '#1A1A1A' : '#FFFFFF';
}

type ColorPickerProps = { value: string; onChange: (v: string) => void };

const ColorPicker = ({ value, onChange }: ColorPickerProps): ReactElement => {
	const isPreset = PRESET_COLORS.some((c) => c.value.toLowerCase() === value.toLowerCase());

	return (
		<Box display='flex' alignItems='center' style={{ gap: 8, flexWrap: 'wrap' }}>
			{/* Swatch */}
			<Box style={{ width: 32, height: 32, borderRadius: 4, backgroundColor: value, border: '2px solid #ccc', flexShrink: 0 }} />

			{/* Preset dropdown */}
			<select
				value={isPreset ? value : 'custom'}
				onChange={(e) => { if (e.target.value !== 'custom') onChange(e.target.value); }}
				style={{ height: 32, padding: '0 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13, minWidth: 150 }}
			>
				{PRESET_COLORS.map((c) => (
					<option key={c.value} value={c.value}>
						{c.label} — {c.value}
					</option>
				))}
				{!isPreset && <option value='custom'>Custom — {value}</option>}
			</select>

			{/* Native colour picker */}
			<input
				type='color'
				value={value.match(/^#[0-9a-fA-F]{6}$/) ? value : '#000000'}
				onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
				title='Pick a custom colour'
				style={{ width: 40, height: 32, padding: 2, cursor: 'pointer', borderRadius: 4, border: '1px solid #ccc', flexShrink: 0 }}
			/>

			{/* Hex input */}
			<TextInput
				value={value}
				onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
				placeholder='#RRGGBB'
				style={{ width: 110 }}
			/>
		</Box>
	);
};

type BadgeRowProps = { roleKey: string; roleName: string };

const BadgeRow = ({ roleKey, roleName }: BadgeRowProps): ReactElement => {
	const defaultLabel = useSetting(`HPN_Badge_${roleKey}_label`, roleName) as string;
	const defaultColor = useSetting(`HPN_Badge_${roleKey}_color`, '#9EA2A8') as string;

	const [label, setLabel] = useState(String(defaultLabel));
	const [color, setColor] = useState(String(defaultColor));
	const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

	const handleSave = useCallback(async () => {
		setStatus('saving');
		try {
			await Meteor.callAsync('hpn/settings/badge/save', { key: roleKey, label, color });
			setStatus('saved');
			setTimeout(() => setStatus('idle'), 2000);
		} catch {
			setStatus('idle');
		}
	}, [roleKey, label, color]);

	return (
		<Box
			display='flex'
			alignItems='center'
			pbe={16}
			mbe={16}
			style={{ borderBottom: '1px solid #eee', gap: 16, flexWrap: 'wrap' }}
		>
			{/* Role name */}
			<Box style={{ width: 110, fontWeight: 600, flexShrink: 0 }}>{roleName}</Box>

			{/* Label */}
			<Box>
				<Box style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Label</Box>
				<TextInput value={label} onChange={(e: ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)} style={{ width: 150 }} />
			</Box>

			{/* Colour */}
			<Box>
				<Box style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Colour</Box>
				<ColorPicker value={color} onChange={setColor} />
			</Box>

			{/* Preview */}
			<Box>
				<Box style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Preview</Box>
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						padding: '2px 8px',
						borderRadius: 3,
						fontSize: 11,
						fontWeight: 700,
						backgroundColor: color,
						color: autoTextColor(color),
						textTransform: 'uppercase',
						letterSpacing: '0.5px',
					}}
				>
					{label || roleName}
				</span>
			</Box>

			{/* Save */}
			<Button small primary={status === 'saved'} onClick={handleSave} disabled={status === 'saving'}>
				{status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved ✓' : 'Save'}
			</Button>
		</Box>
	);
};

const NAV_ITEMS = [
	{ path: '/hpn-directory', label: 'Business Directory', icon: '📁' },
	{ path: '/hpn-job-board', label: 'Job Board', icon: '📋' },
	{ path: '/hpn-polls', label: 'Polls & Surveys', icon: '📊' },
];

const SidebarNavSettings = (): ReactElement => {
	const defaultActiveBg = useSetting('HPN_Nav_Active_Background', 'transparent') as string;
	const defaultActiveBorder = useSetting('HPN_Nav_Active_Border_Color', '#C41230') as string;
	const defaultActiveText = useSetting('HPN_Nav_Active_Text_Color', '#C41230') as string;
	const defaultHoverBg = useSetting('HPN_Nav_Hover_Background', 'transparent') as string;

	const [activeBg, setActiveBg] = useState(String(defaultActiveBg));
	const [activeBorder, setActiveBorder] = useState(String(defaultActiveBorder));
	const [activeText, setActiveText] = useState(String(defaultActiveText));
	const [hoverBg, setHoverBg] = useState(String(defaultHoverBg));
	const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

	const handleSave = useCallback(async () => {
		setStatus('saving');
		try {
			await Meteor.callAsync('hpn/settings/nav/save', {
				activeBackground: activeBg,
				activeBorderColor: activeBorder,
				activeTextColor: activeText,
				hoverBackground: hoverBg,
			});
			setStatus('saved');
			setTimeout(() => setStatus('idle'), 2000);
		} catch {
			setStatus('idle');
		}
	}, [activeBg, activeBorder, activeText, hoverBg]);

	return (
		<Box>
			<Box fontScale='h4' mbe={8}>Sidebar Navigation</Box>
			<Box mbe={24} style={{ color: '#888', fontSize: 13 }}>
				Customise the active and hover styles for the custom sidebar nav items (Business Directory, Job Board, Polls &amp; Surveys).
			</Box>

			{/* Controls */}
			<Box display='flex' flexDirection='column' style={{ gap: 16, maxWidth: 600, marginBottom: 24 }}>
				<Box>
					<Box style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Active — Background</Box>
					<ColorPicker value={activeBg} onChange={setActiveBg} />
				</Box>
				<Box>
					<Box style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Active — Left Border Color</Box>
					<ColorPicker value={activeBorder} onChange={setActiveBorder} />
				</Box>
				<Box>
					<Box style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Active — Text / Icon Color</Box>
					<ColorPicker value={activeText} onChange={setActiveText} />
				</Box>
				<Box>
					<Box style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Hover — Background</Box>
					<ColorPicker value={hoverBg} onChange={setHoverBg} />
				</Box>
			</Box>

			{/* Live preview */}
			<Box style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#888' }}>Preview (active state)</Box>
			<Box
				style={{
					background: '#1A1A1A',
					borderRadius: 8,
					padding: '8px 0',
					width: 240,
					marginBottom: 24,
				}}
			>
				{NAV_ITEMS.map((item, i) => (
					<Box
						key={item.path}
						display='flex'
						alignItems='center'
						style={{
							gap: 10,
							padding: '10px 16px',
							cursor: 'default',
							borderLeft: i === 0 ? `3px solid ${activeBorder}` : '3px solid transparent',
							background: i === 0 ? activeBg : 'transparent',
							color: i === 0 ? activeText : '#CCCCCC',
							fontSize: 14,
							fontWeight: 600,
						}}
					>
						<span>{item.icon}</span>
						<span>{item.label}</span>
					</Box>
				))}
			</Box>

			<Button primary={status === 'saved'} onClick={handleSave} disabled={status === 'saving'}>
				{status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved ✓' : 'Save Nav Settings'}
			</Button>
		</Box>
	);
};

const HpnSettingsAdminPage = (): ReactElement => (
	<Page>
		<PageHeader title='HPN Settings' />
		<PageScrollableContentWithShadow>
			<Box p={24}>
				<SidebarNavSettings />
				<Box style={{ borderTop: '1px solid #eee', margin: '32px 0' }} />
				<Box fontScale='h4' mbe={8}>Member Badges</Box>
				<Box mbe={24} style={{ color: '#888', fontSize: 13 }}>
					Customise the label and colour for each role badge. Changes apply immediately after saving.
				</Box>
				{BADGE_ROLES.map((role) => (
					<BadgeRow key={role.key} roleKey={role.key} roleName={role.name} />
				))}
			</Box>
		</PageScrollableContentWithShadow>
	</Page>
);

export default HpnSettingsAdminPage;
