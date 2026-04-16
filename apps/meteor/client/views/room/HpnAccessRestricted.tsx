import { Box, States, StatesIcon, StatesSubtitle, StatesTitle } from '@rocket.chat/fuselage';
import type { ReactElement } from 'react';

import RoomLayout from './layout/RoomLayout';

type HpnAccessRestrictedProps = {
	roomName: string;
	requiredRoleLabel: string;
};

const HpnAccessRestricted = ({ roomName, requiredRoleLabel }: HpnAccessRestrictedProps): ReactElement => (
	<RoomLayout
		body={
			<Box display='flex' justifyContent='center' alignItems='center' height='full'>
				<States>
					<StatesIcon name='lock' />
					<StatesTitle>Access Restricted</StatesTitle>
					<StatesSubtitle>
						<Box display='block' textAlign='center'>
							<Box mb='x4'>
								<strong>{roomName}</strong> requires <strong>{requiredRoleLabel}</strong> membership or higher.
							</Box>
							<Box color='hint' fontSize='x13'>
								Upgrade your membership to access this room.
							</Box>
						</Box>
					</StatesSubtitle>
				</States>
			</Box>
		}
	/>
);

export default HpnAccessRestricted;
