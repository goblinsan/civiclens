import { describe, it, expect } from 'vitest';
import { createPublicKey } from 'node:crypto';
import {
  buildSignatureBase,
  createBotSigner,
  directoryDocument,
  jwkThumbprint,
  publicKeyFromJwk,
  serializeSfString,
  serializeSignatureParams,
  signDirectory,
  signRequest,
  verifyEd25519,
  DIRECTORY_TAG,
  WEB_BOT_AUTH_TAG,
} from './http-signature.js';

// RFC 9421 §B.1.4 "test-key-ed25519". Never use outside tests.
const RFC_TEST_PRIVATE_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIJ+DYvh6SEqVTm50DFtMDoQikTmiCqirVv9mWG9qfSnF
-----END PRIVATE KEY-----`;
const RFC_TEST_PUBLIC_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAJrQLj5P/89iXES9+vFgrIy29clF9CC/oPPsw3c5D0bs=
-----END PUBLIC KEY-----`;
const RFC_TEST_X = 'JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs';

describe('structured-field serialisation', () => {
  it('quotes and escapes sf-strings', () => {
    expect(serializeSfString('https://civreveal.org')).toBe('"https://civreveal.org"');
    expect(serializeSfString('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  it('serialises @signature-params with integers bare and strings quoted', () => {
    expect(
      serializeSignatureParams(['"@authority"', '"signature-agent"'], [
        { name: 'created', value: 1 },
        { name: 'keyid', value: 'k' },
        { name: 'tag', value: WEB_BOT_AUTH_TAG },
      ]),
    ).toBe('("@authority" "signature-agent");created=1;keyid="k";tag="web-bot-auth"');
  });
});

describe('RFC 9421 §B.2.6 — signing a request using ed25519', () => {
  const identifiers = ['"date"', '"@method"', '"@path"', '"@authority"', '"content-type"', '"content-length"'];
  const params = serializeSignatureParams(identifiers, [
    { name: 'created', value: 1618884473 },
    { name: 'keyid', value: 'test-key-ed25519' },
  ]);
  const base = buildSignatureBase(
    [
      { identifier: '"date"', value: 'Tue, 20 Apr 2021 02:07:55 GMT' },
      { identifier: '"@method"', value: 'POST' },
      { identifier: '"@path"', value: '/foo' },
      { identifier: '"@authority"', value: 'example.com' },
      { identifier: '"content-type"', value: 'application/json' },
      { identifier: '"content-length"', value: '18' },
    ],
    params,
  );

  it('reproduces the published signature base', () => {
    expect(base).toBe(
      '"date": Tue, 20 Apr 2021 02:07:55 GMT\n' +
        '"@method": POST\n' +
        '"@path": /foo\n' +
        '"@authority": example.com\n' +
        '"content-type": application/json\n' +
        '"content-length": 18\n' +
        '"@signature-params": ("date" "@method" "@path" "@authority" "content-type" "content-length");created=1618884473;keyid="test-key-ed25519"',
    );
  });

  it('reproduces the published signature byte-for-byte', () => {
    const signer = createBotSigner(RFC_TEST_PRIVATE_PEM);
    const signature = signer.sign(Buffer.from(base, 'utf8')).toString('base64');
    expect(signature).toBe('wqcAqbmYJ2ji2glfAMaRy4gruYYnx2nEFN2HN6jrnDnQCK1u02Gb04v9EDgwUPiu4A0w6vuQv5lIp5WPpBKRCw==');
    expect(verifyEd25519(RFC_TEST_PUBLIC_PEM, Buffer.from(base, 'utf8'), Buffer.from(signature, 'base64'))).toBe(true);
  });
});

describe('keys', () => {
  it('derives the public JWK and the RFC 7638 thumbprint used as keyid', () => {
    const signer = createBotSigner(RFC_TEST_PRIVATE_PEM);
    expect(signer.publicJwk).toEqual({ kty: 'OKP', crv: 'Ed25519', x: RFC_TEST_X });
    // Known answer: thumbprint of the RFC test key as reported by the reference validator.
    expect(signer.keyid).toBe('poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U');
    expect(jwkThumbprint(signer.publicJwk)).toBe(signer.keyid);
  });

  it('rejects non-Ed25519 keys', () => {
    const rsa = `-----BEGIN PRIVATE KEY-----
MIIBVAIBADANBgkqhkiG9w0BAQEFAASCAT4wggE6AgEAAkEAwQ+OZ6l2bX8V3gJ0
-----END PRIVATE KEY-----`;
    expect(() => createBotSigner(rsa)).toThrow();
  });

  it('round-trips the public JWK through a KeyObject', () => {
    const signer = createBotSigner(RFC_TEST_PRIVATE_PEM);
    const fromJwk = publicKeyFromJwk(signer.publicJwk);
    const fromPem = createPublicKey(RFC_TEST_PUBLIC_PEM);
    expect(fromJwk.export({ format: 'der', type: 'spki' })).toEqual(fromPem.export({ format: 'der', type: 'spki' }));
  });
});

describe('signRequest (Web Bot Auth)', () => {
  const signer = createBotSigner(RFC_TEST_PRIVATE_PEM);
  const now = new Date('2026-11-03T21:00:00Z');
  const created = Math.floor(now.getTime() / 1000);
  const nonce = Buffer.alloc(64, 7).toString('base64');
  const headers = signRequest(signer, {
    authority: 'WWW.senate.gov',
    signatureAgent: 'https://civreveal.org',
    now,
    nonce,
  });

  it('emits the three headers in the expected shape', () => {
    expect(headers['Signature-Agent']).toBe('"https://civreveal.org"');
    expect(headers['Signature-Input']).toBe(
      `sig1=("@authority" "signature-agent");created=${created};keyid="${signer.keyid}";alg="ed25519";expires=${created + 300};nonce="${nonce}";tag="web-bot-auth"`,
    );
    expect(headers.Signature).toMatch(/^sig1=:[A-Za-z0-9+/]+=*:$/);
  });

  it('signs a base a verifier can rebuild from the headers', () => {
    const params = headers['Signature-Input'].slice('sig1='.length);
    const base = buildSignatureBase(
      [
        { identifier: '"@authority"', value: 'www.senate.gov' },
        { identifier: '"signature-agent"', value: headers['Signature-Agent'] },
      ],
      params,
    );
    const sig = Buffer.from(headers.Signature.slice('sig1=:'.length, -1), 'base64');
    expect(sig).toHaveLength(64);
    expect(verifyEd25519(RFC_TEST_PUBLIC_PEM, Buffer.from(base, 'utf8'), sig)).toBe(true);
    // A different authority must not verify.
    const wrong = buildSignatureBase(
      [
        { identifier: '"@authority"', value: 'www.example.com' },
        { identifier: '"signature-agent"', value: headers['Signature-Agent'] },
      ],
      params,
    );
    expect(verifyEd25519(RFC_TEST_PUBLIC_PEM, Buffer.from(wrong, 'utf8'), sig)).toBe(false);
  });

  it('generates a 64-byte base64 nonce and a 300s window by default', () => {
    const h = signRequest(signer, { authority: 'a', signatureAgent: 'https://x.test', now });
    const nonceMatch = /nonce="([^"]+)"/.exec(h['Signature-Input']);
    expect(Buffer.from(nonceMatch![1]!, 'base64')).toHaveLength(64);
    expect(h['Signature-Input']).toContain(`created=${created};`);
    expect(h['Signature-Input']).toContain(`;expires=${created + 300};`);
  });
});

describe('key directory', () => {
  const signer = createBotSigner(RFC_TEST_PRIVATE_PEM);

  it('publishes only public material, with kid = thumbprint', () => {
    const doc = JSON.parse(directoryDocument(signer));
    expect(doc).toEqual({ keys: [{ kty: 'OKP', crv: 'Ed25519', x: RFC_TEST_X, kid: signer.keyid }] });
    expect(directoryDocument(signer)).not.toContain('"d"');
  });

  it('signs the directory binding over @authority with the directory tag', () => {
    const created = new Date('2026-11-03T21:00:00Z');
    const expires = new Date('2027-11-03T21:00:00Z');
    const h = signDirectory(signer, { authority: 'civreveal.org', created, expires });
    expect(h['Signature-Input']).toBe(
      `binding0=("@authority");created=${Math.floor(created.getTime() / 1000)};keyid="${signer.keyid}";alg="ed25519";expires=${Math.floor(expires.getTime() / 1000)};tag="${DIRECTORY_TAG}"`,
    );
    const base = buildSignatureBase(
      [{ identifier: '"@authority"', value: 'civreveal.org' }],
      h['Signature-Input'].slice('binding0='.length),
    );
    const sig = Buffer.from(h.Signature.slice('binding0=:'.length, -1), 'base64');
    expect(verifyEd25519(publicKeyFromJwk(signer.publicJwk), Buffer.from(base, 'utf8'), sig)).toBe(true);
  });
});
