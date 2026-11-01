import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, readAiConfig, readServerConfig } from './config.js';

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

describe('SPEC §4 Despliegue: server configuration from the environment', () => {
  it('without variables (development): any origin, no proxy, no static folder', () => {
    expect(readServerConfig({})).toEqual({ publicOrigin: undefined, trustProxy: false, staticDir: undefined });
  });

  it('reads the public origin, normalized to scheme, host and port', () => {
    expect(readServerConfig({ PUBLIC_ORIGIN: 'https://preguntica.onrender.com/' }).publicOrigin).toBe('https://preguntica.onrender.com');
    expect(readServerConfig({ PUBLIC_ORIGIN: ' http://localhost:8080 ' }).publicOrigin).toBe('http://localhost:8080');
  });

  it.each(['preguntica.onrender.com', 'ftp://preguntica.example', 'https://preguntica.onrender.com/play', 'https://x.example/?a=1'])(
    'a public origin that is not just an origin fails at startup (%s)',
    (value) => {
      expect(() => readServerConfig({ PUBLIC_ORIGIN: value })).toThrow(/PUBLIC_ORIGIN/);
    },
  );

  it('in production, a missing public origin fails at startup: a deploy is never open by mistake', () => {
    expect(() => readServerConfig({ NODE_ENV: 'production' })).toThrow(/PUBLIC_ORIGIN/);
    expect(() => readServerConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: '  ' })).toThrow(/PUBLIC_ORIGIN/);
    expect(readServerConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://a.example' }).publicOrigin).toBe('https://a.example');
  });

  it('TRUST_PROXY only when exactly "true"; STATIC_DIR as given', () => {
    expect(readServerConfig({ TRUST_PROXY: 'true', STATIC_DIR: '/app/web' })).toMatchObject({ trustProxy: true, staticDir: '/app/web' });
    expect(readServerConfig({ TRUST_PROXY: '1', STATIC_DIR: '' })).toMatchObject({ trustProxy: false, staticDir: undefined });
  });
});
