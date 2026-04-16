import { Box, Button, TextInput, Skeleton } from '@rocket.chat/fuselage';
import { Meteor } from 'meteor/meteor';
import { useEffect, useState } from 'react';

import ListingCard, { type DirectoryListing } from './ListingCard';
import ReviewModal from './ReviewModal';

type Category = { _id: string; name: string; slug: string };

export default function HpnDirectoryPage() {
	const [categories, setCategories] = useState<Category[]>([]);
	const [listings, setListings] = useState<DirectoryListing[]>([]);
	const [selectedCategory, setSelectedCategory] = useState('');
	const [search, setSearch] = useState('');
	const [loading, setLoading] = useState(true);
	const [reviewTarget, setReviewTarget] = useState<DirectoryListing | null>(null);

	const expandListingId = new URLSearchParams(window.location.search).get('listing') ?? '';

	useEffect(() => {
		Meteor.callAsync('hpn/directory/categories/get').then((res: any) => setCategories(res ?? []));
	}, []);

	useEffect(() => {
		setLoading(true);
		Meteor.callAsync('hpn/directory/listings/get', selectedCategory || undefined)
			.then((res: any) => setListings(res ?? []))
			.finally(() => setLoading(false));
	}, [selectedCategory]);

	const filtered = listings.filter(
		(l) =>
			!search ||
			l.businessName.toLowerCase().includes(search.toLowerCase()) ||
			l.briefDescription.toLowerCase().includes(search.toLowerCase()),
	);

	const refreshListings = () => {
		Meteor.callAsync('hpn/directory/listings/get', selectedCategory || undefined).then((res: any) => setListings(res ?? []));
	};

	return (
		<Box display='flex' flexDirection='column' height='100%' bg='surface-light'>
			{/* Header */}
			<Box
				p='x24'
				pb='x0'
				borderBlockEndWidth='x2'
				borderBlockEndStyle='solid'
				borderBlockEndColor='stroke-extra-light'
				bg='surface'
			>
				<Box fontSize='x24' fontWeight='700' color='default' mb='x16'>
					HPN Business Directory
				</Box>

				{/* Category filters */}
				<Box display='flex' flexDirection='row' flexWrap='wrap' style={{ gap: 8 }} mb='x12'>
					<Button
						small
						primary={!selectedCategory}
						onClick={() => setSelectedCategory('')}
					>
						All
					</Button>
					{categories.map((c) => (
						<Button
							key={c._id}
							small
							primary={selectedCategory === c.slug}
							onClick={() => setSelectedCategory(c.slug)}
						>
							{c.name}
						</Button>
					))}
				</Box>

				{/* Search */}
				<Box mb='x16' style={{ maxWidth: 360 }}>
					<TextInput
						placeholder='Search businesses…'
						value={search}
						onChange={(e: any) => setSearch(e.target.value)}
						addon={<Box style={{ padding: '0 4px', color: '#888' }}>🔍</Box>}
					/>
				</Box>
			</Box>

			{/* Listings */}
			<Box flexGrow={1} overflow='auto' p='x24'>
				{loading ? (
					<Box display='flex' flexDirection='column' style={{ gap: 12 }}>
						{[1, 2, 3].map((i) => (
							<Skeleton key={i} style={{ height: 100, borderRadius: 4 }} />
						))}
					</Box>
				) : filtered.length === 0 ? (
					<Box color='hint' textAlign='center' mt='x48' fontSize='x16'>
						{search ? 'No businesses match your search.' : 'No approved listings yet.'}
					</Box>
				) : (
					<Box display='flex' flexDirection='column' style={{ gap: 12 }}>
						{filtered.map((listing) => (
							<ListingCard
								key={listing._id}
								listing={listing}
								onReview={() => setReviewTarget(listing)}
								defaultExpanded={listing._id === expandListingId}
							/>
						))}
					</Box>
				)}
			</Box>

			{reviewTarget && (
				<ReviewModal
					listing={reviewTarget}
					onClose={() => setReviewTarget(null)}
					onSubmitted={() => {
						setReviewTarget(null);
						refreshListings();
					}}
				/>
			)}
		</Box>
	);
}
