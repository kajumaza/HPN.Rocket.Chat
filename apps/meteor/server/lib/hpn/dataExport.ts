import { MongoInternals } from 'meteor/mongo';

const getDb = () => MongoInternals.defaultRemoteCollectionDriver().mongo.db;
export const getDataExportsCol = () => getDb().collection('hpn_data_exports');

export interface HpnExportMessage {
	id: string;
	roomName: string;
	authorUsername: string;
	text: string;
	timestamp: string;
}

export interface HpnDataExportBatch {
	_id: string;
	batchId: string;
	createdAt: Date;
	periodDays: number;
	messageCount: number;
	messages: HpnExportMessage[];
	notifiedN8n: boolean;
	notifiedAt?: Date;
}

export async function createDataExportBatch(messages: HpnExportMessage[], periodDays = 30): Promise<string> {
	const batchId = new Date().toISOString();
	await getDataExportsCol().insertOne({
		_id: batchId,
		batchId,
		createdAt: new Date(),
		periodDays,
		messageCount: messages.length,
		messages,
		notifiedN8n: false,
	});
	return batchId;
}

export async function notifyN8n(batchId: string, messageCount: number): Promise<void> {
	const webhookUrl = process.env.N8N_WEBHOOK_URL;
	if (!webhookUrl) return;

	const rootUrl = (process.env.ROOT_URL ?? 'http://localhost:3000').replace(/\/$/, '');
	const pullUrl = `${rootUrl}/hpn/export/data.json?batch=${encodeURIComponent(batchId)}`;

	const payload = {
		event: 'hpn.data.ready',
		batchId,
		messageCount,
		createdAt: batchId,
		pullUrl,
		apiKey: process.env.HPN_EXPORT_SECRET ?? '',
	};

	try {
		const res = await fetch(webhookUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		if (res.ok) {
			await getDataExportsCol().updateOne({ _id: batchId }, { $set: { notifiedN8n: true, notifiedAt: new Date() } });
			console.log(`[HPN Export] n8n notified for batch ${batchId}`);
		} else {
			console.warn(`[HPN Export] n8n notification failed with status ${res.status}`);
		}
	} catch (err) {
		console.warn('[HPN Export] n8n notification error:', err);
	}
}

export async function cleanupOldExports(): Promise<void> {
	const retentionDays = parseInt(process.env.HPN_DATA_EXPORT_RETENTION_DAYS ?? '90', 10);
	const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
	const result = await getDataExportsCol().deleteMany({ createdAt: { $lt: cutoff } });
	console.log(`[HPN Export] Cleaned up ${result.deletedCount} export batches older than ${retentionDays} days`);
}

export async function getBatches(): Promise<Array<Pick<HpnDataExportBatch, 'batchId' | 'createdAt' | 'messageCount' | 'notifiedN8n'>>> {
	return getDataExportsCol()
		.find({}, { projection: { batchId: 1, createdAt: 1, messageCount: 1, notifiedN8n: 1 }, sort: { createdAt: -1 } } as any)
		.toArray() as any;
}

export async function getBatchById(batchId: string): Promise<HpnDataExportBatch | null> {
	return getDataExportsCol().findOne({ _id: batchId }) as any;
}
