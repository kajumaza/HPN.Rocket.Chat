import type { IncomingMessage, ServerResponse } from 'node:http';

import { WebApp } from 'meteor/webapp';

import { handlePayfastItn, verifyPayfastSignature } from '../lib/hpn/payments';

/**
 * PayFast ITN (Instant Transfer Notification) endpoint for HPN payment events.
 * Route: POST /hpn/webhooks/payfast
 *
 * Set this URL as the notify_url in your PayFast payment form:
 *   https://your-domain/hpn/webhooks/payfast
 *
 * Payment form must include:
 *   custom_str1 = userId
 *   custom_str2 = plan name (hpn-student / hpn-manager / hpn-executive)
 */
WebApp.rawHandlers.use('/hpn/webhooks/payfast', async (req: IncomingMessage, res: ServerResponse) => {
	if (req.method !== 'POST') {
		res.writeHead(405);
		res.end('');
		return;
	}

	// Read raw body — PayFast sends application/x-www-form-urlencoded
	const chunks: Buffer[] = [];
	await new Promise<void>((resolve, reject) => {
		req.on('data', (chunk: Buffer) => chunks.push(chunk));
		req.on('end', resolve);
		req.on('error', reject);
	});

	const rawBody = Buffer.concat(chunks).toString('utf8');

	// Parse form-encoded body into key/value map
	const data: Record<string, string> = {};
	for (const [k, v] of new URLSearchParams(rawBody)) {
		data[k] = v;
	}

	if (!verifyPayfastSignature(data)) {
		console.warn('[HPN Payments] PayFast ITN signature verification failed');
		res.writeHead(400);
		res.end('');
		return;
	}

	try {
		await handlePayfastItn(data);
		// PayFast requires a 200 response to consider the ITN delivered
		res.writeHead(200);
		res.end('');
	} catch (err) {
		console.error('[HPN Payments] Error handling PayFast ITN:', err);
		res.writeHead(500);
		res.end('');
	}
});
