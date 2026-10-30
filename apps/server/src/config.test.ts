import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, readAiConfig } from './config.js';

describe('SPEC §6 AI configuration from the environment', () => {
  it('without variables: no key, default model, low effort, no warm topics', () => {
    expect(readAiConfig({})).toEqual({ apiKey: undefined, model: DEFAULT_MODEL, effort: 'low', warmTopics: [] });
    expect(DEFAULT_MODEL).toBe('claude-sonnet-5-5');
  });

  it('an empty key counts as no key (the .env.example line is empty)', () => {
    expect(readAiConfig({ ANTHROPIC_API_KEY: '  ' }).apiKey).toBeUndefined();
  });

  it('reads the key, model and effort', () => {
    expect(readAiConfig({ ANTHROPIC_API_KEY: 'sk-ant-x', ANTHROPIC_MODEL: 'claude-haiku-5-5', ANTHROPIC_EFFORT: 'high' })).toMatchObject({
      apiKey: 'sk-ant-x',
      model: 'claude-haiku-5-5',
      effort: 'high',
    });
  });

  it('an empty model falls back to the default', () => {
    expect(readAiConfig({ ANTHROPIC_MODEL: '' }).model).toBe(DEFAULT_MODEL);
  });

  it('an unknown effort fails at startup', () => {
    expect(() => readAiConfig({ ANTHROPIC_EFFORT: 'max' })).toThrow(/ANTHROPIC_EFFORT/);
  });

  it('WARM_TOPICS: comma separated, normalized, empty entries ignored', () => {
    expect(readAiConfig({ WARM_TOPICS: ' Volcanes de Costa Rica ,, Cine   de los 80 ,' }).warmTopics).toEqual([
      'Volcanes de Costa Rica',
      'Cine de los 80',
    ]);
  });

  it('WARM_TOPICS with an invalid topic fails at startup and names it', () => {
    expect(() => readAiConfig({ WARM_TOPICS: 'Volcanes, x' })).toThrow(/WARM_TOPICS.*"x"/);
  });

  it('the error for a bad config never contains the key', () => {
    const error: unknown = (() => {
      try {
        readAiConfig({ ANTHROPIC_API_KEY: 'sk-ant-SECRET', ANTHROPIC_EFFORT: 'max', WARM_TOPICS: 'x' });
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('SECRET');
  });
});
