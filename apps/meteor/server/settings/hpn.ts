import { settingsRegistry } from '../../app/settings/server';

export const createHpnSettings = () =>
	settingsRegistry.addGroup('HPN', async function () {
		await this.section('Polls_and_Surveys', async function () {
			await this.add('HPN_Poll_Create_Permission', 'admin', {
				type: 'select',
				public: true,
				values: [
					{ key: 'everyone', i18nLabel: 'Everyone' },
					{ key: 'paid', i18nLabel: 'Paid_Members' },
					{ key: 'admin', i18nLabel: 'Admins_Only' },
				],
			});
			await this.add('HPN_Survey_Create_Permission', 'admin', {
				type: 'select',
				public: true,
				values: [
					{ key: 'everyone', i18nLabel: 'Everyone' },
					{ key: 'paid', i18nLabel: 'Paid_Members' },
					{ key: 'admin', i18nLabel: 'Admins_Only' },
				],
			});
		});
		await this.section('Sidebar_Navigation', async function () {
			await this.add('HPN_Nav_Active_Background', 'transparent', { type: 'string', public: true });
			await this.add('HPN_Nav_Active_Border_Color', '#C41230', { type: 'string', public: true });
			await this.add('HPN_Nav_Active_Text_Color', '#C41230', { type: 'string', public: true });
			await this.add('HPN_Nav_Hover_Background', 'transparent', { type: 'string', public: true });
		});
		await this.section('Member_Badges', async function () {
			// Free member
			await this.add('HPN_Badge_free_label', 'Member', { type: 'string', public: true });
			await this.add('HPN_Badge_free_color', '#9EA2A8', { type: 'string', public: true });
			// Student
			await this.add('HPN_Badge_student_label', 'Student', { type: 'string', public: true });
			await this.add('HPN_Badge_student_color', '#1D74F5', { type: 'string', public: true });
			// HR Manager
			await this.add('HPN_Badge_manager_label', 'HR Manager', { type: 'string', public: true });
			await this.add('HPN_Badge_manager_color', '#8E8E8E', { type: 'string', public: true });
			// HR Executive
			await this.add('HPN_Badge_executive_label', 'HR Executive', { type: 'string', public: true });
			await this.add('HPN_Badge_executive_color', '#C9A84C', { type: 'string', public: true });
			// Supplier
			await this.add('HPN_Badge_supplier_label', 'Supplier', { type: 'string', public: true });
			await this.add('HPN_Badge_supplier_color', '#E07B39', { type: 'string', public: true });
			// Admin
			await this.add('HPN_Badge_admin_label', 'Admin', { type: 'string', public: true });
			await this.add('HPN_Badge_admin_color', '#C41230', { type: 'string', public: true });
			// Owner
			await this.add('HPN_Badge_owner_label', 'Owner', { type: 'string', public: true });
			await this.add('HPN_Badge_owner_color', '#805AD5', { type: 'string', public: true });
			// Moderator
			await this.add('HPN_Badge_moderator_label', 'Moderator', { type: 'string', public: true });
			await this.add('HPN_Badge_moderator_color', '#38B2AC', { type: 'string', public: true });
		});
	});
