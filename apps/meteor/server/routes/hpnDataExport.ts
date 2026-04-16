import type { IncomingMessage, ServerResponse } from 'node:http';

import { WebApp } from 'meteor/webapp';

import { getBatches, getBatchById } from '../lib/hpn/dataExport';
import { getDirectoryStats, getBotStats, saveInsights } from '../lib/hpn/insights';

function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
	const secret = process.env.HPN_EXPORT_SECRET;
	if (!secret || secret === 'REPLACE_ME') {
		res.writeHead(503);
		res.end(JSON.stringify({ error: 'Export not configured — set HPN_EXPORT_SECRET in .env' }));
		return false;
	}
	// Accept secret via header (for n8n/API clients) or query param (for browser download links)
	const url = new URL(req.url ?? '', 'http://localhost');
	const queryKey = url.searchParams.get('key');
	if (req.headers['x-hpn-export-key'] !== secret && queryKey !== secret) {
		res.writeHead(401);
		res.end(JSON.stringify({ error: 'Unauthorized — provide x-hpn-export-key header or ?key= parameter' }));
		return false;
	}
	return true;
}

/**
 * GET /hpn/export/batches
 * Returns a list of all stored export batches (id, date, count, notified).
 * Requires header: x-hpn-export-key: <HPN_EXPORT_SECRET>
 */
WebApp.rawHandlers.use('/hpn/export/batches', async (req: IncomingMessage, res: ServerResponse) => {
	if (req.method !== 'GET') {
		res.writeHead(405);
		res.end();
		return;
	}
	if (!checkAuth(req, res)) return;

	const batches = await getBatches();
	res.writeHead(200, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(batches, null, 2));
});

/**
 * GET /hpn/export/data.json?batch=<batchId>
 * Downloads the full raw message batch as JSON.
 * Requires header: x-hpn-export-key: <HPN_EXPORT_SECRET>
 */
WebApp.rawHandlers.use('/hpn/export/data.json', async (req: IncomingMessage, res: ServerResponse) => {
	if (req.method !== 'GET') {
		res.writeHead(405);
		res.end();
		return;
	}
	if (!checkAuth(req, res)) return;

	const url = new URL(req.url ?? '', 'http://localhost');
	const batchId = url.searchParams.get('batch');
	if (!batchId) {
		res.writeHead(400);
		res.end(JSON.stringify({ error: 'Missing ?batch= parameter' }));
		return;
	}

	const batch = await getBatchById(batchId);
	if (!batch) {
		res.writeHead(404);
		res.end(JSON.stringify({ error: 'Batch not found' }));
		return;
	}

	const filename = `hpn-export-${batchId.replace(/[:.]/g, '-')}.json`;
	res.writeHead(200, {
		'Content-Type': 'application/json',
		'Content-Disposition': `attachment; filename="${filename}"`,
	});
	res.end(JSON.stringify(batch, null, 2));
});

/**
 * GET /hpn/export/data.txt?batch=<batchId>
 * Downloads the batch as a human-readable text file, grouped by room.
 * Requires header: x-hpn-export-key: <HPN_EXPORT_SECRET>
 */
WebApp.rawHandlers.use('/hpn/export/data.txt', async (req: IncomingMessage, res: ServerResponse) => {
	if (req.method !== 'GET') {
		res.writeHead(405);
		res.end();
		return;
	}
	if (!checkAuth(req, res)) return;

	const url = new URL(req.url ?? '', 'http://localhost');
	const batchId = url.searchParams.get('batch');
	if (!batchId) {
		res.writeHead(400);
		res.end('Missing ?batch= parameter');
		return;
	}

	const batch = await getBatchById(batchId);
	if (!batch) {
		res.writeHead(404);
		res.end('Batch not found');
		return;
	}

	// Group messages by room
	const byRoom: Record<string, typeof batch.messages> = {};
	for (const msg of batch.messages) {
		if (!byRoom[msg.roomName]) byRoom[msg.roomName] = [];
		byRoom[msg.roomName].push(msg);
	}

	const sep = '='.repeat(60);
	let txt = `HPN Community Raw Data Export\n`;
	txt += `Generated : ${batch.createdAt.toISOString()}\n`;
	txt += `Batch ID  : ${batch.batchId}\n`;
	txt += `Period    : Last ${batch.periodDays} days\n`;
	txt += `Messages  : ${batch.messageCount}\n`;
	txt += `${sep}\n\n`;

	for (const [room, messages] of Object.entries(byRoom)) {
		txt += `=== #${room} (${messages.length} messages) ===\n\n`;
		for (const msg of messages) {
			const ts = new Date(msg.timestamp).toISOString().replace('T', ' ').substring(0, 19);
			txt += `[${ts}] @${msg.authorUsername}: ${msg.text}\n`;
		}
		txt += '\n';
	}

	const filename = `hpn-export-${batchId.replace(/[:.]/g, '-')}.txt`;
	res.writeHead(200, {
		'Content-Type': 'text/plain; charset=utf-8',
		'Content-Disposition': `attachment; filename="${filename}"`,
	});
	res.end(txt);
});

/**
 * GET /hpn/export/directory-stats
 * Returns all approved listings with at least 1 view, with view counts.
 * Requires x-hpn-export-key header or ?key= param.
 */
WebApp.rawHandlers.use('/hpn/export/directory-stats', async (req: IncomingMessage, res: ServerResponse) => {
	if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
	if (!checkAuth(req, res)) return;

	const stats = await getDirectoryStats();
	res.writeHead(200, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify({ generatedAt: new Date().toISOString(), listings: stats }, null, 2));
});

/**
 * GET /hpn/export/bot-stats?days=30
 * Returns bot recommendation counts per business + recent queries.
 * Requires x-hpn-export-key header or ?key= param.
 */
WebApp.rawHandlers.use('/hpn/export/bot-stats', async (req: IncomingMessage, res: ServerResponse) => {
	if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
	if (!checkAuth(req, res)) return;

	const url = new URL(req.url ?? '', 'http://localhost');
	const days = parseInt(url.searchParams.get('days') ?? '30', 10);
	const stats = await getBotStats(days);
	res.writeHead(200, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify({ generatedAt: new Date().toISOString(), periodDays: days, ...stats }, null, 2));
});

/**
 * POST /hpn/insights
 * Receives analysis results from n8n and stores them for the dashboard.
 * Requires x-hpn-export-key header.
 */
WebApp.rawHandlers.use('/hpn/insights', async (req: IncomingMessage, res: ServerResponse) => {
	if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
	if (!checkAuth(req, res)) return;

	const chunks: Buffer[] = [];
	req.on('data', (chunk: Buffer) => chunks.push(chunk));
	req.on('end', async () => {
		try {
			const body = JSON.parse(Buffer.concat(chunks).toString());
			await saveInsights(body);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ ok: true }));
		} catch (err) {
			console.error('[HPN Insights] Error saving insights:', err);
			res.writeHead(400);
			res.end(JSON.stringify({ error: 'Invalid JSON body' }));
		}
	});
});
