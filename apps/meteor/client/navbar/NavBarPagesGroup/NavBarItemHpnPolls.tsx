import { NavBarItem } from '@rocket.chat/fuselage';
import { useEffectEvent } from '@rocket.chat/fuselage-hooks';
import { useRouter, useCurrentRoutePath } from '@rocket.chat/ui-contexts';
import type { HTMLAttributes } from 'react';

type Props = Omit<HTMLAttributes<HTMLElement>, 'is'>;

const NavBarItemHpnPolls = (props: Props) => {
	const router = useRouter();
	const handleClick = useEffectEvent(() => { router.navigate('/hpn-polls'); });
	const currentRoute = useCurrentRoutePath();
	return <NavBarItem {...props} icon='emoji' onClick={handleClick} pressed={currentRoute?.includes('/hpn-polls')} />;
};

export default NavBarItemHpnPolls;
