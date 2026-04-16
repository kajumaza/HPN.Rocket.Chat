import { useSetting } from '@rocket.chat/ui-contexts';

export type BadgeConfig = { label: string; color: string; textColor: string };

// Returns white or black depending on background luminance
function autoTextColor(hex: string): string {
	const c = hex.replace('#', '');
	if (c.length !== 6) return '#FFFFFF';
	const r = parseInt(c.slice(0, 2), 16);
	const g = parseInt(c.slice(2, 4), 16);
	const b = parseInt(c.slice(4, 6), 16);
	// Perceived luminance formula
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.55 ? '#1A1A1A' : '#FFFFFF';
}

export const useHpnBadgeConfig = (): Record<string, BadgeConfig> => {
	const freeLabel = useSetting('HPN_Badge_free_label', 'Member') as string;
	const freeColor = useSetting('HPN_Badge_free_color', '#9EA2A8') as string;
	const studentLabel = useSetting('HPN_Badge_student_label', 'Student') as string;
	const studentColor = useSetting('HPN_Badge_student_color', '#1D74F5') as string;
	const managerLabel = useSetting('HPN_Badge_manager_label', 'HR Manager') as string;
	const managerColor = useSetting('HPN_Badge_manager_color', '#8E8E8E') as string;
	const executiveLabel = useSetting('HPN_Badge_executive_label', 'HR Executive') as string;
	const executiveColor = useSetting('HPN_Badge_executive_color', '#C9A84C') as string;
	const supplierLabel = useSetting('HPN_Badge_supplier_label', 'Supplier') as string;
	const supplierColor = useSetting('HPN_Badge_supplier_color', '#E07B39') as string;
	const adminLabel = useSetting('HPN_Badge_admin_label', 'Admin') as string;
	const adminColor = useSetting('HPN_Badge_admin_color', '#C41230') as string;
	const ownerLabel = useSetting('HPN_Badge_owner_label', 'Owner') as string;
	const ownerColor = useSetting('HPN_Badge_owner_color', '#805AD5') as string;
	const moderatorLabel = useSetting('HPN_Badge_moderator_label', 'Moderator') as string;
	const moderatorColor = useSetting('HPN_Badge_moderator_color', '#38B2AC') as string;

	return {
		'hpn-free': { label: freeLabel, color: freeColor, textColor: autoTextColor(freeColor) },
		'hpn-student': { label: studentLabel, color: studentColor, textColor: autoTextColor(studentColor) },
		'hpn-manager': { label: managerLabel, color: managerColor, textColor: autoTextColor(managerColor) },
		'hpn-executive': { label: executiveLabel, color: executiveColor, textColor: autoTextColor(executiveColor) },
		'hpn-supplier': { label: supplierLabel, color: supplierColor, textColor: autoTextColor(supplierColor) },
		admin: { label: adminLabel, color: adminColor, textColor: autoTextColor(adminColor) },
		owner: { label: ownerLabel, color: ownerColor, textColor: autoTextColor(ownerColor) },
		moderator: { label: moderatorLabel, color: moderatorColor, textColor: autoTextColor(moderatorColor) },
	};
};
