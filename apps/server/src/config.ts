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
export interface ServerConfig {
  /** The only origin allowed to open a socket. Undefined in development: any origin. */
  publicOrigin: string | undefined;
  /** Read the client IP from X-Forwarded-For (only behind a trusted proxy). */
  trustProxy: boolean;
  /** The web build to serve on the same port; set by the Docker image. */
  staticDir: string | undefined;
}

function parseOrigin(value: string): string {
  const invalid = new Error(`PUBLIC_ORIGIN must be an origin such as https://name.onrender.com, got "${value}"`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid;
  }
  const bare = url.pathname === '/' && url.search === '' && url.hash === '';
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !bare) throw invalid;
  return url.origin;
}

/** SPEC §4 Despliegue: production must name its origin, so a deploy is never open by mistake. */
export function readServerConfig(env: Record<string, string | undefined>): ServerConfig {
  const origin = optional(env.PUBLIC_ORIGIN);
  if (origin === undefined && env.NODE_ENV === 'production') {
    throw new Error('PUBLIC_ORIGIN is required in production (the public URL of the app, e.g. https://name.onrender.com)');
  }
  return {
    publicOrigin: origin === undefined ? undefined : parseOrigin(origin),
    trustProxy: env.TRUST_PROXY === 'true',
    staticDir: optional(env.STATIC_DIR),
  };
}

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
