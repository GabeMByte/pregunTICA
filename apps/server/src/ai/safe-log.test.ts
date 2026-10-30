import { describe, expect, it } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { TopicRejectedError } from '../rooms/question-source.js';
import { describeError } from './safe-log.js';

const SECRET = 'sk-ant-api03-SECRETO';

function authError(): Error {
  return new Anthropic.AuthenticationError(
    401,
    { type: 'authentication_error', message: 'invalid authentication credentials' },
    undefined,
    new Headers({ 'x-api-key': SECRET, 'request-id': 'req_123' }),
    'authentication_error',
  );
}

describe('SPEC §6 never log the API key: SDK errors', () => {
  it('describes an SDK error with class name, status and message', () => {
    const text = describeError(authError());
    expect(text).toContain('AuthenticationError');
    expect(text).toContain('401');
    expect(text).toContain('invalid authentication credentials');
  });

  it('never includes the headers (neither the key nor the header name)', () => {
    const text = describeError(authError());
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('SECRETO');
    expect(text).not.toContain('x-api-key');
  });

  it('redacts a key that shows up inside an SDK error message', () => {
    const error = new Anthropic.BadRequestError(400, { type: 'invalid_request_error', message: `bad key ${SECRET}` }, undefined, new Headers());
    const text = describeError(error);
    expect(text).toContain('BadRequestError');
    expect(text).not.toContain('SECRETO');
  });

  it('an SDK error without status does not print "undefined" or "null"', () => {
    const text = describeError(new Anthropic.APIConnectionError({ message: 'Connection error.' }));
    expect(text).toContain('APIConnectionError');
    expect(text).toContain('Connection error.');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');
  });
});

describe('SPEC §6 never log the API key: other errors', () => {
  it('an Error is "<name>: <message>"', () => {
    expect(describeError(new Error('boom'))).toBe('Error: boom');
    expect(describeError(new TypeError('bad thing'))).toBe('TypeError: bad thing');
    expect(describeError(new TopicRejectedError())).toBe('TopicRejectedError: Topic rejected');
  });

  it('redacts an Anthropic key inside a plain error message and keeps the rest', () => {
    const text = describeError(new Error(`key ${SECRET} was rejected`));
    expect(text).not.toContain('SECRETO');
    expect(text).not.toContain(SECRET);
    expect(text).toContain('was rejected');
    expect(text.startsWith('Error: key ')).toBe(true);
  });

  it.each([
    ['a string', `oops ${SECRET}`],
    ['an object', { apiKey: SECRET, headers: { 'x-api-key': SECRET } }],
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
  ])('%s → "Unknown error" (never serialized)', (_label, value) => {
    expect(describeError(value)).toBe('Unknown error');
  });
});
