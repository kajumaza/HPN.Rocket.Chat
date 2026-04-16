import { WebApp } from 'meteor/webapp';
import { MongoInternals } from 'meteor/mongo';

const db = MongoInternals.defaultRemoteCollectionDriver().mongo.db;

// GET /api/hpn/polls/:id/results  — for n8n/webhook consumers
// GET /api/hpn/polls/survey/:id/results
WebApp.connectHandlers.use('/api/hpn/polls', async (req: any, res: any) => {
	const url: string = req.url ?? '';
	const pollMatch = url.match(/^\/([a-f0-9]{24})\/results$/);
	const surveyMatch = url.match(/^\/survey\/([a-f0-9]{24})\/results$/);

	res.setHeader('Content-Type', 'application/json');

	try {
		if (pollMatch) {
			const { ObjectId } = require('mongodb');
			const pollsCol = db.collection('hpn_polls');
			const poll = await pollsCol.findOne({ _id: new ObjectId(pollMatch[1]) });
			if (!poll) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return; }
			const totalVotes = poll.options.reduce((s: number, o: any) => s + (o.votes?.length ?? 0), 0);
			res.writeHead(200);
			res.end(JSON.stringify({
				_id: poll._id.toHexString(),
				question: poll.question,
				totalVotes,
				closed: poll.closed,
				options: poll.options.map((o: any) => ({
					text: o.text,
					votes: o.votes?.length ?? 0,
					pct: totalVotes > 0 ? Math.round(((o.votes?.length ?? 0) / totalVotes) * 100) : 0,
				})),
			}));
			return;
		}

		if (surveyMatch) {
			const { ObjectId } = require('mongodb');
			const surveysCol = db.collection('hpn_surveys');
			const responsesCol = db.collection('hpn_survey_responses');
			const survey = await surveysCol.findOne({ _id: new ObjectId(surveyMatch[1]) });
			if (!survey) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return; }
			const responses = await responsesCol.find({ surveyId: surveyMatch[1] }).toArray();
			res.writeHead(200);
			res.end(JSON.stringify({
				_id: survey._id.toHexString(),
				title: survey.title,
				responseCount: responses.length,
				responses: responses.map((r: any) => ({ userId: r.userId, answers: r.answers, submittedAt: r.submittedAt })),
			}));
			return;
		}

		res.writeHead(404);
		res.end(JSON.stringify({ error: 'Unknown endpoint. Use /api/hpn/polls/:id/results or /api/hpn/polls/survey/:id/results' }));
	} catch (e: any) {
		res.writeHead(500);
		res.end(JSON.stringify({ error: e.message }));
	}
});
