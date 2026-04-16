import { randomUUID } from 'crypto';

import { Meteor } from 'meteor/meteor';
import { MongoInternals } from 'meteor/mongo';
import { Users } from '@rocket.chat/models';

const getDb = () => MongoInternals.defaultRemoteCollectionDriver().mongo.db;
export const getJobsCol = () => getDb().collection('hpn_job_listings');


Meteor.methods({
	async 'hpn/jobs/submit'(data: {
		type: 'job' | 'cv';
		title: string;
		// Job fields
		organisation?: string;
		location?: string;
		applyContact?: string;
		jobSpecFileName?: string;
		jobSpecFileData?: string;
		jobSpecFileType?: string;
		// CV fields
		description?: string;
		experience?: string;
		specialisations?: string;
		availability?: string;
		contactInfo?: string;
		cvFileName?: string;
		cvFileData?: string;
		cvFileType?: string;
	}) {
		if (!this.userId) throw new Meteor.Error('unauthorized', 'Must be logged in');
		const user = await Users.findOneById(this.userId);
		if (!user) throw new Meteor.Error('unauthorized');

		const now = new Date();

		await getJobsCol().insertOne({
			_id: randomUUID(),
			type: data.type,
			title: data.title,
			// Job-only fields
			organisation: data.organisation ?? '',
			location: data.location ?? '',
			applyContact: data.applyContact ?? '',
			jobSpecFileName: data.jobSpecFileName ?? '',
			jobSpecFileData: data.jobSpecFileData ?? '',
			jobSpecFileType: data.jobSpecFileType ?? '',
			// CV-only fields
			description: data.description ?? '',
			experience: data.experience ?? '',
			specialisations: data.specialisations ?? '',
			availability: data.availability ?? '',
			contactInfo: data.contactInfo ?? '',
			cvFileName: data.cvFileName ?? '',
			cvFileData: data.cvFileData ?? '',
			cvFileType: data.cvFileType ?? '',
			// All listings are auto-approved — no admin review required
			status: 'approved',
			submittedBy: this.userId,
			submittedByUsername: user.username ?? '',
			submittedAt: now,
			rejectionReason: '',
			_updatedAt: now,
		});

	},

	async 'hpn/jobs/approve'(id: string, approved: boolean, rejectionReason?: string) {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		const user = await Users.findOneById(this.userId);
		if (!user?.roles?.includes('admin')) throw new Meteor.Error('forbidden');

		await getJobsCol().updateOne(
			{ _id: id },
			{
				$set: {
					status: approved ? 'approved' : 'rejected',
					rejectionReason: rejectionReason ?? '',
					_updatedAt: new Date(),
				},
			},
		);
	},

	async 'hpn/jobs/get'(type?: 'job' | 'cv') {
		const query: Record<string, unknown> = { status: 'approved' };
		if (type) query.type = type;
		return getJobsCol().find(query, { sort: { submittedAt: -1 } }).toArray();
	},

	async 'hpn/jobs/admin/pending'() {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		const user = await Users.findOneById(this.userId);
		if (!user?.roles?.includes('admin')) throw new Meteor.Error('forbidden');
		return getJobsCol().find({ status: 'pending' }, { sort: { submittedAt: -1 } }).toArray();
	},

	async 'hpn/jobs/admin/all'() {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		const user = await Users.findOneById(this.userId);
		if (!user?.roles?.includes('admin')) throw new Meteor.Error('forbidden');
		return getJobsCol().find({}, { sort: { submittedAt: -1 } }).toArray();
	},

	async 'hpn/jobs/my-listings'() {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		return getJobsCol().find({ submittedBy: this.userId }, { sort: { submittedAt: -1 } }).toArray();
	},

	async 'hpn/jobs/edit'(id: string, data: {
		title: string;
		organisation?: string;
		location?: string;
		applyContact?: string;
		jobSpecFileName?: string;
		jobSpecFileData?: string;
		jobSpecFileType?: string;
		description?: string;
		experience?: string;
		specialisations?: string;
		availability?: string;
		contactInfo?: string;
		cvFileName?: string;
		cvFileData?: string;
		cvFileType?: string;
	}) {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		const job = await getJobsCol().findOne({ _id: id });
		if (!job) throw new Meteor.Error('not-found');
		const user = await Users.findOneById(this.userId);
		const isAdmin = user?.roles?.includes('admin');
		if (job.submittedBy !== this.userId && !isAdmin) throw new Meteor.Error('forbidden');

		const isJob = job.type === 'job';

		await getJobsCol().updateOne({ _id: id }, {
			$set: {
				title: data.title,
				organisation: data.organisation ?? '',
				location: data.location ?? '',
				applyContact: data.applyContact ?? '',
				jobSpecFileName: data.jobSpecFileName ?? job.jobSpecFileName ?? '',
				jobSpecFileData: data.jobSpecFileData ?? job.jobSpecFileData ?? '',
				jobSpecFileType: data.jobSpecFileType ?? job.jobSpecFileType ?? '',
				description: data.description ?? '',
				experience: data.experience ?? '',
				specialisations: data.specialisations ?? '',
				availability: data.availability ?? '',
				contactInfo: data.contactInfo ?? '',
				cvFileName: data.cvFileName ?? job.cvFileName ?? '',
				cvFileData: data.cvFileData ?? job.cvFileData ?? '',
				cvFileType: data.cvFileType ?? job.cvFileType ?? '',
					status: 'approved',
				_updatedAt: new Date(),
			},
		});
	},

	async 'hpn/jobs/delete'(id: string) {
		if (!this.userId) throw new Meteor.Error('unauthorized');
		const job = await getJobsCol().findOne({ _id: id });
		if (!job) throw new Meteor.Error('not-found');
		const user = await Users.findOneById(this.userId);
		const isAdmin = user?.roles?.includes('admin');
		if (job.submittedBy !== this.userId && !isAdmin) throw new Meteor.Error('forbidden');
		await getJobsCol().deleteOne({ _id: id });
	},
});
