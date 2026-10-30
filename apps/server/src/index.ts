import Anthropic from '@anthropic-ai/sdk';
import { CachedQuestionSource } from './ai/cached-question-source.js';
import { ClaudeQuestionSource } from './ai/claude-question-source.js';
import { AI_TIMEOUT_MS, FallbackQuestionSource } from './ai/fallback-question-source.js';
import { LimitedQuestionSource } from './ai/limited-question-source.js';
import { LocalQuestionSource, loadFallbackBanks } from './ai/local-question-source.js';
import { describeError } from './ai/safe-log.js';
import { ShuffledQuestionSource } from './ai/shuffled-question-source.js';
import { createApp, realScheduler, secureRandom } from './app.js';
import { readAiConfig } from './config.js';
import type { QuestionSource } from './rooms/question-source.js';
import { evictRooms } from './socket/handlers.js';

const SWEEP_INTERVAL_MS = 60_000;

const port = Number(process.env.PORT ?? 3000);
const ai = readAiConfig(process.env);
const local = new LocalQuestionSource(loadFallbackBanks(), secureRandom);

// SPEC §6: Shuffled(Cached(Limited(Fallback(Claude, Local)))). Without a key, only the local bank.
// Shuffled on top so every room gets its own order, even from the cache (security review M1);
// Limited under the cache so hits never spend the AI budget (M3).
let questionSource: QuestionSource = local;
let cache: CachedQuestionSource | undefined;
if (ai.apiKey === undefined) {
  console.warn('ANTHROPIC_API_KEY is not set: questions come from the local bank');
} else {
  // The key goes only to the SDK client; logs use describeError, never the client or its options.
  const client = new Anthropic({ apiKey: ai.apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 1 });
  const claude = new ClaudeQuestionSource({
    createMessage: (params, options) => client.messages.create(params, options),
    model: ai.model,
    effort: ai.effort,
    random: secureRandom,
    clock: Date.now,
  });
  const fallback = new FallbackQuestionSource({
    primary: claude,
    fallback: local,
    scheduler: realScheduler,
    onFallback: (reason) => {
      console.warn(`Using the local question bank: ${reason}`);
    },
  });
  const limited = new LimitedQuestionSource({
    primary: fallback,
    fallback: local,
    clock: Date.now,
    onLimited: (reason) => {
      console.warn(`Using the local question bank: ${reason}`);
    },
  });
  cache = new CachedQuestionSource(limited);
  questionSource = new ShuffledQuestionSource(cache, secureRandom);
  console.log(`Questions from ${ai.model} (effort ${ai.effort})`);
}

const { httpServer, io, registry } = createApp({ trustProxy: process.env.TRUST_PROXY === 'true', questionSource });

// Removes rooms idle for longer than ROOM_IDLE_TTL_MS and disconnects their sockets.
setInterval(() => {
  evictRooms(io, registry.sweep());
}, SWEEP_INTERVAL_MS).unref();

httpServer.listen(port, () => {
  console.log(`PregunTICA server listening on http://localhost:${String(port)}`);
  // WARM_TOPICS: in the background, so the server answers while the cache fills.
  if (cache !== undefined && ai.warmTopics.length > 0) {
    const warming = cache;
    void warming
      .warm(ai.warmTopics, (topic, error) => {
        console.warn(`Could not warm "${topic}": ${describeError(error)}`);
      })
      .then(() => {
        console.log(`Warm topics ready: ${String(warming.size)}/${String(ai.warmTopics.length)} cached`);
      });
  }
});
