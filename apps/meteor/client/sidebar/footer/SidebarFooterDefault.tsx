import { css } from '@rocket.chat/css-in-js';
import { Box, SidebarDivider, Palette, SidebarFooter as Footer, Icon } from '@rocket.chat/fuselage';
import { useSetting, useRouter, useCurrentRoutePath, useLayout } from '@rocket.chat/ui-contexts';
import { useThemeMode } from '@rocket.chat/ui-theming';
import DOMPurify from 'dompurify';
import type { ReactElement } from 'react';
import { useState } from 'react';

const SidebarFooterDefault = (): ReactElement => {
	const [, , theme] = useThemeMode();
	const logo = useSetting(theme === 'dark' ? 'Layout_Sidenav_Footer_Dark' : 'Layout_Sidenav_Footer', '').trim();
	const router = useRouter();
	const currentRoute = useCurrentRoutePath();
	const isActive = currentRoute?.includes('/hpn-directory');
	const isJobsActive = currentRoute?.includes('/hpn-job-board');
	const isPollsActive = currentRoute?.includes('/hpn-polls');

	const { sidebar } = useLayout();

	const navActiveBg = useSetting('HPN_Nav_Active_Background', 'transparent') as string;
	const navActiveBorder = useSetting('HPN_Nav_Active_Border_Color', '#C41230') as string;
	const navActiveText = useSetting('HPN_Nav_Active_Text_Color', '#C41230') as string;
	const navHoverBg = useSetting('HPN_Nav_Hover_Background', 'transparent') as string;
	const [hoveredItem, setHoveredItem] = useState<string | null>(null);

	const sidebarFooterStyle = css`
		& img {
			width: 100%;
			height: 100%;
			object-fit: contain;
		}

		& a:any-link {
			color: ${Palette.text['font-info']};
		}
	`;

	return (
		<Footer>
			<SidebarDivider />
			<Box
				display='flex'
				alignItems='center'
				pi={16}
				height='x44'
				style={{
					cursor: 'pointer',
					gap: 10,
					borderLeft: isActive ? `3px solid ${navActiveBorder}` : '3px solid transparent',
					background: isActive ? navActiveBg : hoveredItem === 'directory' ? navHoverBg : undefined,
					color: isActive ? navActiveText : undefined,
				}}
				onClick={() => { router.navigate('/hpn-directory'); if (sidebar.shouldToggle) sidebar.collapse(); }}
				onMouseEnter={() => setHoveredItem('directory')}
				onMouseLeave={() => setHoveredItem(null)}
			>
				<Icon name='business' size='x20' />
				<Box fontSize='x14' fontWeight='600' color={isActive ? 'undefined' : 'default'} style={{ color: isActive ? navActiveText : undefined }}>
					Business Directory
				</Box>
			</Box>
			<SidebarDivider />
			<Box
				display='flex'
				alignItems='center'
				pi={16}
				height='x44'
				style={{
					cursor: 'pointer',
					gap: 10,
					borderLeft: isJobsActive ? `3px solid ${navActiveBorder}` : '3px solid transparent',
					background: isJobsActive ? navActiveBg : hoveredItem === 'jobs' ? navHoverBg : undefined,
					color: isJobsActive ? navActiveText : undefined,
				}}
				onClick={() => { router.navigate('/hpn-job-board'); if (sidebar.shouldToggle) sidebar.collapse(); }}
				onMouseEnter={() => setHoveredItem('jobs')}
				onMouseLeave={() => setHoveredItem(null)}
			>
				<Icon name='clipboard' size='x20' />
				<Box fontSize='x14' fontWeight='600' color={isJobsActive ? 'undefined' : 'default'} style={{ color: isJobsActive ? navActiveText : undefined }}>
					Job Board
				</Box>
			</Box>
			<SidebarDivider />
			<Box
				display='flex'
				alignItems='center'
				pi={16}
				height='x44'
				style={{
					cursor: 'pointer',
					gap: 10,
					borderLeft: isPollsActive ? `3px solid ${navActiveBorder}` : '3px solid transparent',
					background: isPollsActive ? navActiveBg : hoveredItem === 'polls' ? navHoverBg : undefined,
					color: isPollsActive ? navActiveText : undefined,
				}}
				onClick={() => { router.navigate('/hpn-polls'); if (sidebar.shouldToggle) sidebar.collapse(); }}
				onMouseEnter={() => setHoveredItem('polls')}
				onMouseLeave={() => setHoveredItem(null)}
			>
				<Icon name='emoji' size='x20' />
				<Box fontSize='x14' fontWeight='600' color={isPollsActive ? 'undefined' : 'default'} style={{ color: isPollsActive ? navActiveText : undefined }}>
					Polls &amp; Surveys
				</Box>
			</Box>
			<SidebarDivider />
			<Box
				is='footer'
				pb={12}
				pi={16}
				height='x48'
				width='auto'
				className={sidebarFooterStyle}
				dangerouslySetInnerHTML={{
					__html: DOMPurify.sanitize(logo),
				}}
			/>
			</Footer>
	);
};

export default SidebarFooterDefault;
