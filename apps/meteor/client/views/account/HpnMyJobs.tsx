import { Box, Button, Skeleton, Tag } from '@rocket.chat/fuselage';
import { Page, PageHeader, PageScrollableContentWithShadow } from '@rocket.chat/ui-client';
import { Meteor } from 'meteor/meteor';
import { useEffect, useState } from 'react';

type JobListing = {
	_id: string;
	type: 'job' | 'cv';
	title: string;
	status: 'pending' | 'approved' | 'rejected';
	rejectionReason?: string;
	submittedAt: string;
	organisation?: string;
	location?: string;
	experience?: string;
};

export default function HpnMyJobs() {
	const [listings, setListings] = useState<JobListing[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);

	const load = () => {
		setLoading(true);
		Meteor.callAsync('hpn/jobs/my-listings')
			.then((res: any) => setListings(res ?? []))
			.finally(() => setLoading(false));
	};
	useEffect(load, []);

	const remove = async (id: string) => {
		if (!window.confirm('Delete this listing?')) return;
		setBusy(true);
		try { await Meteor.callAsync('hpn/jobs/delete', id); load(); }
		finally { setBusy(false); }
	};

	const statusColor = (s: string) => s === 'approved' ? '#12a150' : s === 'rejected' ? '#C41230' : '#f59f00';

	return (
		<Page>
			<PageHeader title='My Job Board Posts' />
			<PageScrollableContentWithShadow>
				<Box p='x24' maxWidth='x800'>
					<Box mb='x20'>
						<Button primary small onClick={() => window.location.assign('/hpn-job-board')}>
							+ Post a New Job / CV
						</Button>
					</Box>

					{loading ? (
						<Skeleton style={{ height: 200 }} />
					) : listings.length === 0 ? (
						<Box color='hint' fontSize='x14'>You haven't posted any jobs or CVs yet.</Box>
					) : (
						<Box display='flex' flexDirection='column' style={{ gap: 12 }}>
							{listings.map((item) => (
								<Box key={item._id} borderRadius='x4' borderWidth='x2' borderStyle='solid' borderColor='stroke-extra-light' bg='surface' p='x16'>
									<Box display='flex' justifyContent='space-between' alignItems='flex-start'>
										<Box>
											<Box display='flex' alignItems='center' style={{ gap: 8 }} mb='x4'>
												<Box fontSize='x16' fontWeight='700' color='default'>{item.title}</Box>
												<Tag>{item.type === 'job' ? '💼 Job' : '📄 CV'}</Tag>
											</Box>
											{item.type === 'job' && item.organisation && (
												<Box color='hint' fontSize='x13'>🏢 {item.organisation}{item.location ? ` · 📍 ${item.location}` : ''}</Box>
											)}
											{item.type === 'cv' && item.experience && (
												<Box color='hint' fontSize='x13'>⏱ {item.experience} years experience</Box>
											)}
										</Box>
										<Box display='flex' alignItems='center' style={{ gap: 8 }}>
											<Box
												display='inline-flex' alignItems='center' borderRadius='x2' px='x8' py='x4'
												fontSize='x12' fontWeight='700'
												style={{ background: statusColor(item.status), color: '#fff', textTransform: 'uppercase' }}
											>
												{item.status}
											</Box>
											<Button small danger disabled={busy} onClick={() => remove(item._id)}>Delete</Button>
										</Box>
									</Box>
									{item.status === 'rejected' && item.rejectionReason && (
										<Box mt='x12' p='x8' borderRadius='x4' style={{ background: '#fff0f0' }} fontSize='x13' color='danger'>
											Rejected: {item.rejectionReason}
										</Box>
									)}
								</Box>
							))}
						</Box>
					)}
				</Box>
			</PageScrollableContentWithShadow>
		</Page>
	);
}
