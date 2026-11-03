# site/ — civreveal.org (static, Cloudflare Pages)

A minimal static site served at <https://civreveal.org> until the React app
has a host. It exists for two things the bot registration needs:

- `/bot` — the page CivRevealBot's User-Agent links to (`docs/bot.md`, rendered)
- `/.well-known/http-message-signatures-directory` + `_headers` — the bot's
  public signing key and the signature binding it to this origin

## Deploying on Cloudflare Pages

Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git →
this repository:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Build command | *(leave empty)* |
| Build output directory | `site` |

Then add the custom domain `civreveal.org` (and `www`) to the Pages project.
Pages serves `.well-known/` paths and applies `_headers` automatically.

## Publishing the bot key

The key material is **not** in this folder until you generate it:

```bash
curl -O https://raw.githubusercontent.com/goblinsan/civiclens/main/scripts/bot-keys.mjs
node bot-keys.mjs selftest
node bot-keys.mjs generate --authority civreveal.org
```

Then:

1. Put the contents of `bot-keys/civreveal-bot.private.pem` in the repository
   secret `BOT_SIGNING_KEY`. Nothing else ever needs the private key.
2. Copy `bot-keys/public/.well-known/http-message-signatures-directory` to
   `site/.well-known/` and `bot-keys/public/_headers` to `site/_headers`, and
   commit them (public data).
3. After the deploy, confirm:

```bash
curl -i https://civreveal.org/.well-known/http-message-signatures-directory
```

should return the JSON key set with `Signature-Input` and `Signature` headers.

The directory signature carries an expiry (one year by default); re-run
`generate` before it lapses, or rotate sooner if the key is ever exposed.
