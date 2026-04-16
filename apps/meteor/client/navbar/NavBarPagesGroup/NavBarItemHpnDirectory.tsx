import { NavBarItem } from '@rocket.chat/fuselage';
import { useEffectEvent } from '@rocket.chat/fuselage-hooks';
import { useRouter, useCurrentRoutePath } from '@rocket.chat/ui-contexts';
import type { HTMLAttributes } from 'react';

type NavBarItemHpnDirectoryProps = Omit<HTMLAttributes<HTMLElement>, 'is'>;

const NavBarItemHpnDirectory = (props: NavBarItemHpnDirectoryProps) => {
	const router = useRouter();
	const handleClick = useEffectEvent(() => {
		router.navigate('/hpn-directory');
	});
	const currentRoute = useCurrentRoutePath();

	return <NavBarItem {...props} icon='business' onClick={handleClick} pressed={currentRoute?.includes('/hpn-directory')} />;
};

export default NavBarItemHpnDirectory;
