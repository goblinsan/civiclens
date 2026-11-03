#!/usr/bin/env node
/**
 * bot-keys.mjs — generate and publish CivRevealBot's Web Bot Auth key.
 *
 * Self-contained: needs only Node 20+. Safe to run anywhere; it writes the
 * private key to a file and never prints it.
 *
 *   node bot-keys.mjs selftest
 *       Checks this script against the RFC 9421 Ed25519 test vector and the
 *       reference thumbprint. Run this first.
 *
 *   node bot-keys.mjs generate [--authority civreveal.org] [--out ./bot-keys] [--years 1]
 *       Creates:
 *         <out>/civreveal-bot.private.pem                     ← paste into the
 *                                                               BOT_SIGNING_KEY repository secret
 *         <out>/public/.well-known/http-message-signatures-directory
 *         <out>/public/_headers                               ← copy both into site/ (Cloudflare Pages)
 *       and prints the keyid (JWK thumbprint) for the Akamai registration form.
 *
 * The signing logic mirrors jobs/ingest-congress/src/http-signature.ts; both
 * are verified against the same published test vectors.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIRECTORY_PATH = '/.well-known/http-message-signatures-directory';
const DIRECTORY_CONTENT_TYPE = 'application/http-message-signatures-directory+json';
const DIRECTORY_TAG = 'http-message-signatures-directory';

const sfString = (v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const base64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function signatureParams(identifiers, params) {
  return (
    `(${identifiers.join(' ')})` +
    params.map(([k, v]) => (typeof v === 'number' ? `;${k}=${v}` : `;${k}=${sfString(v)}`)).join('')
  );
}
function signatureBase(components, params) {
  return [...components.map(([id, v]) => `${id}: ${v}`), `"@signature-params": ${params}`].join('\n');
}
function thumbprint(x) {
  return base64url(createHash('sha256').update(`{"crv":"Ed25519","kty":"OKP","x":"${x}"}`, 'utf8').digest());
}
function publicX(privateKey) {
  return createPublicKey(privateKey).export({ format: 'jwk' }).x;
}

function selftest() {
  const pem = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIJ+DYvh6SEqVTm50DFtMDoQikTmiCqirVv9mWG9qfSnF
-----END PRIVATE KEY-----`;
  const key = createPrivateKey(pem);
  const params = signatureParams(
    ['"date"', '"@method"', '"@path"', '"@authority"', '"content-type"', '"content-length"'],
    [['created', 1618884473], ['keyid', 'test-key-ed25519']],
  );
  const base = signatureBase(
    [
      ['"date"', 'Tue, 20 Apr 2021 02:07:55 GMT'],
      ['"@method"', 'POST'],
      ['"@path"', '/foo'],
      ['"@authority"', 'example.com'],
      ['"content-type"', 'application/json'],
      ['"content-length"', '18'],
    ],
    params,
  );
  const sig = cryptoSign(null, Buffer.from(base, 'utf8'), key).toString('base64');
  const expected = 'wqcAqbmYJ2ji2glfAMaRy4gruYYnx2nEFN2HN6jrnDnQCK1u02Gb04v9EDgwUPiu4A0w6vuQv5lIp5WPpBKRCw==';
  const tp = thumbprint(publicX(key));
  const ok = sig === expected && tp === 'poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U';
  console.log(ok ? 'selftest OK: RFC 9421 vector and thumbprint match' : `selftest FAILED\n sig=${sig}\n tp=${tp}`);
  process.exit(ok ? 0 : 1);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function generate() {
  const authority = arg('--authority', 'civreveal.org').toLowerCase();
  const out = arg('--out', './bot-keys');
  const years = Number(arg('--years', '1'));
  const privPath = join(out, 'civreveal-bot.private.pem');
  if (existsSync(privPath)) {
    console.error(`refusing to overwrite existing key: ${privPath}`);
    process.exit(1);
  }

  const { privateKey } = generateKeyPairSync('ed25519');
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const x = publicX(privateKey);
  const keyid = thumbprint(x);

  const created = new Date();
  const expires = new Date(created.getTime() + years * 365 * 24 * 3600 * 1000);
  const params = signatureParams(['"@authority"'], [
    ['created', Math.floor(created.getTime() / 1000)],
    ['keyid', keyid],
    ['alg', 'ed25519'],
    ['expires', Math.floor(expires.getTime() / 1000)],
    ['tag', DIRECTORY_TAG],
  ]);
  const base = signatureBase([['"@authority"', authority]], params);
  const signature = cryptoSign(null, Buffer.from(base, 'utf8'), privateKey).toString('base64');
  if (!cryptoVerify(null, Buffer.from(base, 'utf8'), createPublicKey(privateKey), Buffer.from(signature, 'base64'))) {
    throw new Error('self-verification of directory signature failed');
  }

  const directory = JSON.stringify({ keys: [{ kty: 'OKP', crv: 'Ed25519', x, kid: keyid }] }, null, 2) + '\n';
  const headers =
    `${DIRECTORY_PATH}\n` +
    `  Content-Type: ${DIRECTORY_CONTENT_TYPE}\n` +
    `  Cache-Control: public, max-age=86400\n` +
    `  Signature-Input: binding0=${params}\n` +
    `  Signature: binding0=:${signature}:\n`;

  mkdirSync(join(out, 'public', '.well-known'), { recursive: true });
  writeFileSync(privPath, pem, { mode: 0o600 });
  writeFileSync(join(out, 'public', '.well-known', 'http-message-signatures-directory'), directory);
  writeFileSync(join(out, 'public', '_headers'), headers);

  console.log(`
Key generated for ${authority}.

  keyid (JWK thumbprint): ${keyid}
  public key (x):         ${x}
  directory signature valid until ${expires.toISOString()} — re-run before then

Files:
  ${privPath}
      → GitHub repo → Settings → Secrets and variables → Actions → New secret
        name: BOT_SIGNING_KEY   value: the whole file, including BEGIN/END lines
        Then delete this file, or keep it somewhere safe; it is the only copy.
  ${join(out, 'public', '.well-known', 'http-message-signatures-directory')}
  ${join(out, 'public', '_headers')}
      → copy into site/.well-known/ and site/_headers in the repo (public data; fine to commit)

After the site deploys, this must return the JSON above with the Signature headers:
  curl -i https://${authority}${DIRECTORY_PATH}
`);
}

const cmd = process.argv[2];
if (cmd === 'selftest') selftest();
else if (cmd === 'generate') generate();
else {
  console.error('usage: node bot-keys.mjs selftest | generate [--authority host] [--out dir] [--years n]');
  process.exit(2);
}
