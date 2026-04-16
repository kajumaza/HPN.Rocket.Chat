import { Box, Button, Tag } from '@rocket.chat/fuselage';
import DOMPurify from 'dompurify';
import { Meteor } from 'meteor/meteor';
import { useEffect, useRef, useState } from 'react';

export type DirectoryListing = {
	_id: string;
	businessName: string;
	categories?: string[];
	category?: string;
	briefDescription: string;
	fullDescription: string;
	contactName: string;
	contactEmail: string;
	contactPhone: string;
	website: string;
	reviewCount: number;
	reviewAvg: number;
	score: number;
};

function StarRating({ avg, count }: { avg: number; count: number }) {
	const rounded = Math.round(avg);
	return (
		<Box display='flex' alignItems='center' rcx-box--animated style={{ gap: 2 }}>
			{[1, 2, 3, 4, 5].map((s) => (
				<Box key={s} fontSize='x16' style={{ color: s <= rounded ? '#f59f00' : '#adb5bd', lineHeight: 1 }}>
					★
				</Box>
			))}
			<Box color='hint' fontSize='x12' mis='x4'>
				{avg > 0 ? `${avg.toFixed(1)} (${count} review${count !== 1 ? 's' : ''})` : 'No reviews yet'}
			</Box>
		</Box>
	);
}

type Props = {
	listing: DirectoryListing;
	onReview: () => void;
	defaultExpanded?: boolean;
};

export default function ListingCard({ listing, onReview, defaultExpanded = false }: Props) {
	const [expanded, setExpanded] = useState(defaultExpanded);
	const cardRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (defaultExpanded && cardRef.current) {
			setTimeout(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
		}
	}, [defaultExpanded]);

	return (
		<Box
			ref={cardRef as any}
			borderRadius='x4'
			borderWidth='x2'
			borderStyle='solid'
			borderColor='stroke-extra-light'
			bg='surface'
			p='x16'
		>
			<Box display='flex' justifyContent='space-between' alignItems='flex-start'>
				<Box flexGrow={1} mie='x8'>
					<Box fontSize='x18' fontWeight='700' color='default'>
						{listing.businessName}
					</Box>
					<Box mt='x4'>
						<Box display='flex' flexWrap='wrap' style={{ gap: 4 }}>{(listing.categories?.length ? listing.categories : (listing.category ? [listing.category] : [])).map((cat) => (<Tag key={cat}>{cat}</Tag>))}</Box>
					</Box>
				</Box>
				<Button
					small
					icon={expanded ? 'chevron-up' : 'chevron-down'}
					onClick={() => {
						const opening = !expanded;
						setExpanded((e) => !e);
						if (opening) {
							Meteor.callAsync('hpn/directory/track-view', listing._id).catch(() => undefined);
						}
					}}
					aria-label={expanded ? 'Collapse' : 'Expand'}
				/>
			</Box>

			<Box mt='x8' color='hint' fontSize='x14'>
				{listing.briefDescription}
			</Box>

			<Box mt='x8'>
				<StarRating avg={listing.reviewAvg} count={listing.reviewCount} />
			</Box>

			{expanded && (
				<Box mt='x16' pt='x16' borderBlockStartWidth='x2' borderBlockStartStyle='solid' borderBlockStartColor='stroke-extra-light'>
					<Box color='default' fontSize='x14' dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(listing.fullDescription) }} />

					<Box display='flex' flexDirection='column' mt='x12' style={{ gap: 8 }}>
						{listing.contactName && (
							<Box display='flex' alignItems='center' style={{ gap: 8 }} fontSize='x14'>
								<Box style={{ minWidth: 20, color: '#888' }}>👤</Box>
								<Box color='default'>{listing.contactName}</Box>
							</Box>
						)}
						{listing.contactEmail && (
							<Box display='flex' alignItems='center' style={{ gap: 8 }} fontSize='x14'>
								<Box style={{ minWidth: 20, color: '#888' }}>✉️</Box>
								<Box color='default'>{listing.contactEmail}</Box>
							</Box>
						)}
						{listing.contactPhone && (
							<Box display='flex' alignItems='center' style={{ gap: 8 }} fontSize='x14'>
								<Box style={{ minWidth: 20, color: '#888' }}>📞</Box>
								<Box color='default'>{listing.contactPhone}</Box>
							</Box>
						)}
						{listing.website && (
							<Box display='flex' alignItems='center' style={{ gap: 8 }} fontSize='x14'>
								<Box style={{ minWidth: 20, color: '#888' }}>🌐</Box>
								<a href={listing.website} target='_blank' rel='noopener noreferrer' style={{ color: '#C41230' }}>
									{listing.website}
								</a>
							</Box>
						)}
					</Box>

					<Box mt='x16'>
						<Button small onClick={onReview}>
							Leave a review
						</Button>
					</Box>
				</Box>
			)}
		</Box>
	);
}
