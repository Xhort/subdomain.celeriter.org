"use strict";

require("dotenv").config();

const Stripe = require("stripe");
const catalog = require("../catalog.json");
const { getPaymentLinkLimits, normalizePaymentLink } = require("./catalog");

const inactiveMessage = "This item has reached its drop limit. Please return to Drip Dye for another option.";

async function syncPaymentLinkLimits(stripe, { log = console.log, mode } = {}) {
    const desiredLinks = getPaymentLinkLimits(catalog)
        .filter((paymentLink) => !mode || paymentLink.mode === mode);
    const stripeLinksByUrl = new Map();

    for await (const paymentLink of stripe.paymentLinks.list({ limit: 100 })) {
        stripeLinksByUrl.set(normalizePaymentLink(paymentLink.url), paymentLink);
    }

    const missing = desiredLinks.filter(({ url }) => !stripeLinksByUrl.has(url));
    if (missing.length) {
        throw new Error([
            "These catalog links were not found in the Stripe account for STRIPE_SECRET_KEY:",
            ...missing.map(({ label, url }) => `- ${label}: ${url}`),
            "Use the test key for test_ links and the live key for live links."
        ].join("\n"));
    }

    let updated = 0;
    for (const desired of desiredLinks) {
        const paymentLink = stripeLinksByUrl.get(desired.url);
        const currentLimit = paymentLink.restrictions?.completed_sessions?.limit;
        const alreadyConfigured = currentLimit === desired.limit
            && paymentLink.inactive_message === inactiveMessage;

        if (alreadyConfigured) {
            log(`Unchanged: ${desired.label} (limit ${desired.limit})`);
            continue;
        }

        await stripe.paymentLinks.update(paymentLink.id, {
            restrictions: { completed_sessions: { limit: desired.limit } },
            inactive_message: inactiveMessage
        });
        updated += 1;
        log(`Updated: ${desired.label} (limit ${desired.limit})`);
    }

    return { total: desiredLinks.length, updated };
}

async function main() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
        throw new Error("Set STRIPE_SECRET_KEY in .env before configuring Payment Link limits.");
    }

    const mode = secretKey.startsWith("sk_live_") ? "live"
        : secretKey.startsWith("sk_test_") ? "test" : null;
    if (!mode) {
        throw new Error("STRIPE_SECRET_KEY must be a Stripe test or live secret key.");
    }

    const result = await syncPaymentLinkLimits(new Stripe(secretKey), { mode });
    console.log(`Stripe ${mode}-mode limits are synchronized (${result.updated} updated, ${result.total} checked).`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { inactiveMessage, syncPaymentLinkLimits };
