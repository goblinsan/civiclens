# CivRevealBot

The automated client that collects public legislative records for
[CivReveal](https://civreveal.org), an open-source, non-partisan project that
shows how members of Congress vote, using official government records only.
Source: <https://github.com/goblinsan/civiclens>.

This page is the one the bot's User-Agent links to. It is mirrored at
<https://civreveal.org/bot>.

## Identity

| | |
| --- | --- |
| **User-Agent** | `CivRevealBot/1.0 (+https://civreveal.org/bot)` |
| **Operator** | CivReveal (open-source project), maintained by its GitHub repository owner |
| **Contact** | <https://github.com/goblinsan/civiclens/issues> |
| **Source code** | <https://github.com/goblinsan/civiclens> (`jobs/ingest-congress`) |

## What it fetches

| Host | Paths | What for |
| --- | --- | --- |
| `api.congress.gov` | `/v3/member`, `/v3/bill/…`, `/v3/house-vote/…` | members, bills, official bill classification, House roll-call votes — with an API key, under the Library of Congress's published terms |
| `www.senate.gov` | `/legislative/LIS/roll_call_lists/vote_menu_*.xml`, `/legislative/LIS/roll_call_votes/vote*/vote_*.xml` | Senate roll-call votes with each senator's position |

It fetches only those documented paths. It does not crawl, follow links,
submit forms, or request anything other than the records above.

## How much and how often

- Scheduled every 6 hours. One run fetches at most a few hundred documents.
- Requests are sequential with a pause of at least 200–300 ms between them;
  the job never opens parallel connections to the same host.
- Unchanged documents are detected by checksum and not re-processed.
- Fetched records are stored verbatim so every published figure can be traced
  back to its source document.

## Verification (Web Bot Auth)

Requests to senate.gov are signed with HTTP Message Signatures (RFC 9421,
Ed25519) following the Web Bot Auth profile, so they can be verified without
relying on source IP addresses:

- `Signature-Agent: "https://civreveal.org"`
- The signature covers `@authority` and `signature-agent`, with
  `tag="web-bot-auth"`, a 5-minute validity window and a 64-byte nonce.
- `keyid` is the JWK thumbprint of the public key.
- The public key is published at
  <https://civreveal.org/.well-known/http-message-signatures-directory>, served
  with a `Signature` binding it to that origin.

Where the bot runs from is deliberately not part of its identity: the signature
is. It runs on GitHub Actions hosted runners and, for sources that refuse
cloud-provider addresses, on a machine on a residential network.

## Robots and courtesy

The bot requests specific document URLs rather than crawling, so `robots.txt`
crawl rules are not the natural fit; it follows the spirit of them by staying
within the documented paths and the rate above. If you operate one of the
hosts above and want it to behave differently — slower, at particular times,
or not at all — open an issue at the contact link and it will be changed.
