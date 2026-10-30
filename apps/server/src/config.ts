import { z } from 'zod';
import { TopicSchema } from '@preguntica/shared';
import type { Effort } from './ai/claude-question-source.js';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

export interface AiConfig {
  /** Undefined → only the local bank is used. */
  apiKey: string | undefined;
  model: string;
  effort: Effort;
  /** WARM_TOPICS, normalized like a host:create topic. */
  warmTopics: string[];
}

const EffortSchema = z.enum(['low', 'medium', 'high']);

/** An unset or blank variable (the .env.example lines are empty). */
const optional = (value: string | undefined): string | undefined => (value?.trim() ? value.trim() : undefined);

/** SPEC §6: reads the AI settings. A bad value fails at startup; errors never echo the key. */
export function readAiConfig(env: Record<string, string | undefined>): AiConfig {
  const effort = EffortSchema.safeParse(optional(env.ANTHROPIC_EFFORT) ?? 'low');
  if (!effort.success) throw new Error(`ANTHROPIC_EFFORT must be one of ${EffortSchema.options.join(', ')}`);

  const warmTopics = (env.WARM_TOPICS ?? '')
    .split(',')
    .filter((entry) => entry.trim() !== '')
    .map((entry) => {
      const topic = TopicSchema.safeParse(entry);
      if (!topic.success) throw new Error(`WARM_TOPICS has an invalid topic: "${entry.trim()}"`);
      return topic.data;
    });

  return {
    apiKey: optional(env.ANTHROPIC_API_KEY),
    model: optional(env.ANTHROPIC_MODEL) ?? DEFAULT_MODEL,
    effort: effort.data,
    warmTopics,
  };
}
