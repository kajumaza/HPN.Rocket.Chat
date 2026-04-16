import { Box } from '@rocket.chat/fuselage';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import RoomLayout from './layout/RoomLayout';
import NotFoundState from '../../components/NotFoundState';

const RoomNotFound = (): ReactElement => {
	const { t } = useTranslation();

	return (
		<RoomLayout
			body={
				<Box display='flex' justifyContent='center' height='full'>
					<NotFoundState title='Restricted Access' subtitle='You do not have access to this room' />
				</Box>
			}
		/>
	);
};

export default RoomNotFound;
