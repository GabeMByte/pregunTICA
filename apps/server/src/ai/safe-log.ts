import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_KEY = /sk-ant-[\w-]+/g;

const redact = (text: string): string => text.replace(ANTHROPIC_KEY, 'sk-ant-[redacted]');

/**
 * Describes an error for the logs without secrets (SPEC §6: never log the API key).
 * Anthropic SDK errors → "<name> <status>: <message>"; other Errors → "<name>: <message>";
 * anything else → "Unknown error". Never includes headers, request options or the raw object, and
 * redacts anything that looks like an Anthropic key (sk-ant-…) from the message.
 */
export function describeError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    // SDK errors keep name "Error"; the class name is what tells them apart.
    const label = [error.constructor.name, error.status === undefined ? '' : String(error.status)].filter(Boolean).join(' ');
    return `${label}: ${redact(error.message)}`;
  }
  if (error instanceof Error) return `${error.name}: ${redact(error.message)}`;
  return 'Unknown error';
}
