import { describe, expect, it } from 'vitest';
import { describeRefusal } from './vote-client.js';

describe('describeRefusal', () => {
  it('extracts the Akamai reference from a block page', async () => {
    const html =
      '<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD><BODY><H1>Access Denied</H1>' +
      'You don\'t have permission to access "http&#58;&#47;&#47;www&#46;senate&#46;gov&#47;" on this server.<P>' +
      'Reference&#32;#18&#46;5c7d3e17&#46;1700000000&#46;1a2b3c4d</BODY></HTML>';
    const r = await describeRefusal(new Response(html.replace(/&#46;/g, '.'), { status: 403 }));
    expect(r).toBe(' (Akamai reference #18.5c7d3e17.1700000000.1a2b3c4d)');
  });

  it('falls back to a short text excerpt', async () => {
    const r = await describeRefusal(new Response('<p>Senate.gov - Unauthorized</p>', { status: 403 }));
    expect(r).toBe(' (Senate.gov - Unauthorized)');
  });

  it('drops comments, styles and scripts from the excerpt', async () => {
    const html =
      '<!DOCTYPE html><!-- served by x --><html><head><title>Senate.gov - Unauthorized</title>' +
      '<style>body {margin: 0; background-image: url("/apology_objects/senatelogo.jpg");}</style>' +
      '<script>var a = 1;</script></head><body><p>Sorry, a potential security risk was detected in your request.</p></body></html>';
    const r = await describeRefusal(new Response(html, { status: 403 }));
    expect(r).toBe(' (Senate.gov - Unauthorized Sorry, a potential security risk was detected in your request.)');
  });

  it('is empty for an empty body', async () => {
    expect(await describeRefusal(new Response('', { status: 403 }))).toBe('');
  });
});
