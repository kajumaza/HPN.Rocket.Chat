import { Box, Button, ButtonGroup, Field, FieldLabel, FieldRow, TextAreaInput } from '@rocket.chat/fuselage';
import { Meteor } from 'meteor/meteor';
import { useState } from 'react';

type Listing = { _id: string; businessName: string };

type Props = {
	listing: Listing;
	onClose: () => void;
	onSubmitted: () => void;
};

export default function ReviewModal({ listing, onClose, onSubmitted }: Props) {
	const [rating, setRating] = useState(0);
	const [hover, setHover] = useState(0);
	const [comment, setComment] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	const handleSubmit = async () => {
		if (rating === 0) {
			setError('Please select a star rating.');
			return;
		}
		setSubmitting(true);
		setError('');
		try {
			await Meteor.callAsync('hpn/directory/review', listing._id, rating, comment);
			onSubmitted();
		} catch (err: any) {
			setError(err.reason || err.message || 'Failed to submit review.');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Box
			position='fixed'
			style={{ inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
		>
			<Box
				bg='surface'
				borderRadius='x4'
				p='x24'
				style={{ width: '100%', maxWidth: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.24)' }}
			>
				<Box fontSize='x20' fontWeight='700' color='default' mb='x16'>
					Review: {listing.businessName}
				</Box>

				<Field mb='x16'>
					<FieldLabel>Rating *</FieldLabel>
					<FieldRow>
						<Box display='flex' style={{ gap: 8 }}>
							{[1, 2, 3, 4, 5].map((s) => (
								<Box
									key={s}
									fontSize='x32'
									style={{
										cursor: 'pointer',
										color: s <= (hover || rating) ? '#f59f00' : '#adb5bd',
										lineHeight: 1,
										userSelect: 'none',
									}}
									onClick={() => setRating(s)}
									onMouseEnter={() => setHover(s)}
									onMouseLeave={() => setHover(0)}
								>
									★
								</Box>
							))}
						</Box>
					</FieldRow>
				</Field>

				<Field mb='x16'>
					<FieldLabel>Comment (optional)</FieldLabel>
					<FieldRow>
						<TextAreaInput
							value={comment}
							onChange={(e: any) => setComment(e.target.value)}
							placeholder='Share your experience...'
							rows={4}
						/>
					</FieldRow>
				</Field>

				{error && (
					<Box color='danger' fontSize='x14' mb='x12'>
						{error}
					</Box>
				)}

				<ButtonGroup>
					<Button onClick={onClose}>Cancel</Button>
					<Button primary disabled={submitting} onClick={handleSubmit}>
						{submitting ? 'Submitting…' : 'Submit Review'}
					</Button>
				</ButtonGroup>
			</Box>
		</Box>
	);
}
