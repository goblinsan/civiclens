/**
 * http-signature.ts
 *
 * HTTP Message Signatures (RFC 9421) with Ed25519, profiled for Web Bot Auth
 * (draft-meunier-webbotauth-httpsig-protocol): lets a bot-management vendor
 * verify that a request really comes from CivRevealBot by checking a
 * signature against the public key published at
 *   https://civreveal.org/.well-known/http-message-signatures-directory
 * rather than by trusting the request's source IP.
 *
 * Only Node's built-in crypto is used. The signature-base construction is
 * tested byte-for-byte against the RFC 9421 Ed25519 test vector.
 *
 * Conventions follow the reference implementation
 * (github.com/cloudflareresearch/web-bot-auth):
 *   - request signature covers ("@authority" "signature-agent"), parameters
 *     in the order created, keyid, alg, expires, nonce, tag="web-bot-auth"
 *   - keyid is the RFC 7638 JWK thumbprint of the public key
 *   - the key directory is itself signed over ("@authority") with
 *     tag="http-message-signatures-directory"
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from 'node:crypto';

export const WEB_BOT_AUTH_TAG = 'web-bot-auth';
export const DIRECTORY_TAG = 'http-message-signatures-directory';
export const DIRECTORY_PATH = '/.well-known/http-message-signatures-directory';
export const DIRECTORY_CONTENT_TYPE = 'application/http-message-signatures-directory+json';

// ─────────────────────────────────────────────────────────────────────────────
// Structured-field serialisation (the subset RFC 9421 needs)
// ─────────────────────────────────────────────────────────────────────────────

/** Serialise an sf-string: quoted, with `\` and `"` escaped. */
export function serializeSfString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export interface SignatureParam {
  name: string;
  value: string | number;
}

/**
 * Serialise the `@signature-params` value: the covered component identifiers
 * as an inner list, followed by the parameters in the order given.
 */
export function serializeSignatureParams(
  componentIdentifiers: readonly string[],
  params: readonly SignatureParam[],
): string {
  const list = `(${componentIdentifiers.join(' ')})`;
  const serialized = params
    .map((p) =>
      typeof p.value === 'number'
        ? `;${p.name}=${p.value}`
        : `;${p.name}=${serializeSfString(p.value)}`,
    )
    .join('');
  return list + serialized;
}

export interface CoveredComponent {
  /** Already-serialised identifier, e.g. `"@authority"` or `"signature-agent"`. */
  identifier: string;
  value: string;
}

/** Build the RFC 9421 signature base: one line per component, then @signature-params. */
export function buildSignatureBase(
  components: readonly CoveredComponent[],
  signatureParams: string,
): string {
  const lines = components.map((c) => `${c.identifier}: ${c.value}`);
  lines.push(`"@signature-params": ${signatureParams}`);
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Keys
// ─────────────────────────────────────────────────────────────────────────────

export interface Ed25519PublicJwk {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** RFC 7638 thumbprint of an Ed25519 JWK (members in lexicographic order). */
export function jwkThumbprint(jwk: Ed25519PublicJwk): string {
  const canonical = `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}"}`;
  return base64url(createHash('sha256').update(canonical, 'utf8').digest());
}

export interface BotSigner {
  /** JWK thumbprint of the public key; the `keyid` parameter on every signature. */
  keyid: string;
  publicJwk: Ed25519PublicJwk;
  sign(data: Buffer): Buffer;
}

/** Build a signer from an Ed25519 private key in PKCS#8 PEM form. */
export function createBotSigner(privateKeyPem: string): BotSigner {
  const privateKey = createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error(`bot signing key must be Ed25519, got ${privateKey.asymmetricKeyType}`);
  }
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' }) as { x?: string };
  if (!jwk.x) throw new Error('could not derive public key from bot signing key');
  const publicJwk: Ed25519PublicJwk = { kty: 'OKP', crv: 'Ed25519', x: jwk.x };
  return {
    keyid: jwkThumbprint(publicJwk),
    publicJwk,
    sign: (data) => cryptoSign(null, data, privateKey),
  };
}

/** Verify an Ed25519 signature (used in tests and by the key tool's self-check). */
export function verifyEd25519(
  publicKey: KeyObject | string,
  data: Buffer,
  signature: Buffer,
): boolean {
  const key = typeof publicKey === 'string' ? createPublicKey(publicKey) : publicKey;
  return cryptoVerify(null, data, key, signature);
}

export function publicKeyFromJwk(jwk: Ed25519PublicJwk): KeyObject {
  return createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x }, format: 'jwk' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Web Bot Auth request signing
// ─────────────────────────────────────────────────────────────────────────────

export interface SignRequestOptions {
  /** Host (plus port if non-default) of the request target, e.g. `www.senate.gov`. */
  authority: string;
  /** Origin that serves the key directory, e.g. `https://civreveal.org`. */
  signatureAgent: string;
  now?: Date | undefined;
  /** Validity window in seconds (default 300). */
  ttlSeconds?: number | undefined;
  /** 64 random bytes, base64; generated when omitted. */
  nonce?: string | undefined;
  label?: string | undefined;
}

export interface SignedHeaders {
  'Signature-Agent': string;
  'Signature-Input': string;
  Signature: string;
}

/**
 * Produce the three Web Bot Auth headers for one request. The Signature-Agent
 * header is the legacy bare sf-string form, which every published verifier
 * accepts.
 */
export function signRequest(signer: BotSigner, options: SignRequestOptions): SignedHeaders {
  const label = options.label ?? 'sig1';
  const created = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const expires = created + (options.ttlSeconds ?? 300);
  const nonce = options.nonce ?? randomBytes(64).toString('base64');
  const signatureAgentValue = serializeSfString(options.signatureAgent);

  const identifiers = ['"@authority"', '"signature-agent"'];
  const params = serializeSignatureParams(identifiers, [
    { name: 'created', value: created },
    { name: 'keyid', value: signer.keyid },
    { name: 'alg', value: 'ed25519' },
    { name: 'expires', value: expires },
    { name: 'nonce', value: nonce },
    { name: 'tag', value: WEB_BOT_AUTH_TAG },
  ]);
  const base = buildSignatureBase(
    [
      { identifier: '"@authority"', value: options.authority.toLowerCase() },
      { identifier: '"signature-agent"', value: signatureAgentValue },
    ],
    params,
  );
  const signature = signer.sign(Buffer.from(base, 'utf8')).toString('base64');

  return {
    'Signature-Agent': signatureAgentValue,
    'Signature-Input': `${label}=${params}`,
    Signature: `${label}=:${signature}:`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Key directory signing
// ─────────────────────────────────────────────────────────────────────────────

export interface SignDirectoryOptions {
  /** Host that serves the directory, e.g. `civreveal.org`. */
  authority: string;
  created: Date;
  expires: Date;
  label?: string | undefined;
}

/** Headers that bind the published key directory to its origin. */
export function signDirectory(
  signer: BotSigner,
  options: SignDirectoryOptions,
): { 'Signature-Input': string; Signature: string } {
  const label = options.label ?? 'binding0';
  const params = serializeSignatureParams(['"@authority"'], [
    { name: 'created', value: Math.floor(options.created.getTime() / 1000) },
    { name: 'keyid', value: signer.keyid },
    { name: 'alg', value: 'ed25519' },
    { name: 'expires', value: Math.floor(options.expires.getTime() / 1000) },
    { name: 'tag', value: DIRECTORY_TAG },
  ]);
  const base = buildSignatureBase(
    [{ identifier: '"@authority"', value: options.authority.toLowerCase() }],
    params,
  );
  const signature = signer.sign(Buffer.from(base, 'utf8')).toString('base64');
  return { 'Signature-Input': `${label}=${params}`, Signature: `${label}=:${signature}:` };
}

/** The JWKS document to publish at DIRECTORY_PATH. */
export function directoryDocument(signer: BotSigner): string {
  return JSON.stringify({ keys: [{ ...signer.publicJwk, kid: signer.keyid }] }, null, 2) + '\n';
}
