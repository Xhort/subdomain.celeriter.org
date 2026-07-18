# Drip Dye storefront

Static-friendly storefront for Drip Dye products with Stripe-hosted Payment Links.

## Project structure

- `catalog.json` is the single source of truth for products, prices, variants, Stripe links, and drop limits.
- `script.js` renders the catalog and safely redirects each selection to Stripe.
- `index.html`, `about.html`, `policies.html`, and `styles.css` contain the public site.
- `scripts/configure-stripe-limits.js` applies every `usageLimit` to its Stripe Payment Link.
- `server.js` and `backend/` provide the optional Node order/admin API and derive their inventory from the same catalog.
- `test/` checks the catalog, backend inventory mapping, and Stripe synchronization behavior.

## Payment Link limits

Each variant in `catalog.json` has its own `usageLimit`. The value is both the displayed drop limit and Stripe's lifetime limit for completed Checkout Sessions on that Payment Link.

Stripe does not read limits from website code automatically. Apply catalog changes to Stripe with:

```sh
cp .env.example .env
# Put the matching Stripe secret key in .env, then:
pnpm stripe:limits
```

The command detects whether `STRIPE_SECRET_KEY` is a test or live key and synchronizes only matching links. The current catalog contains live links, so applying its limits requires the corresponding live secret key. Never commit `.env` or a secret key.

The synchronization command is safe to rerun. It updates mismatched links, leaves correct links unchanged, and stops before making updates if any catalog link is missing from the selected Stripe account. When a link reaches its completed-session limit, Stripe closes it and displays the configured sold-out message.

## Local development

Requires Node.js 18 or newer and pnpm.

```sh
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Without `DATABASE_URL`, optional API orders are saved in the ignored `.data` directory.

Run all syntax and behavior checks with:

```sh
pnpm check
```

## Environment variables

- `STRIPE_SECRET_KEY`: only needed to synchronize Payment Link limits.
- `DATABASE_URL`: optional PostgreSQL connection for the order/admin API.
- `DATA_DIR`: optional local order-store directory.
- `ADMIN_TOKEN`: protects admin order endpoints.
- `PUBLIC_URL` and `ALLOWED_ORIGINS`: trusted browser origins for the optional API.
- `NODE_ENV`, `TRUST_PROXY`, and `PORT`: server deployment settings.
