/**
 * A server for screenshots that must look like a game with AI questions (no "backup questions"
 * notice on the host). CLAUDE.md rule 7: it never builds an Anthropic client and never loads a .env;
 * the questions are the local bank's, labelled as `ai`.
 *
 * Started by e2e/readme.config.ts: PORT=3300 tsx scripts/screenshot-server.ts
 */
import { createApp, secureRandom } from '../src/app.js';
import { LocalQuestionSource, loadFallbackBanks } from '../src/ai/local-question-source.js';
import type { QuestionSource } from '../src/rooms/question-source.js';

const local = new LocalQuestionSource(loadFallbackBanks(), secureRandom);
const labelledAsAi: QuestionSource = {
  getQuestions: async (request) => ({ ...(await local.getQuestions(request)), origin: 'ai' }),
};

const port = Number(process.env.PORT ?? 3300);
const { httpServer } = createApp({ questionSource: labelledAsAi });
httpServer.listen(port, () => {
  console.log(`Screenshot server (fake AI source) on http://localhost:${String(port)}`);
});
