"use strict";

function normalizePaymentLink(value) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "buy.stripe.com") {
        throw new Error(`Unsupported Stripe Payment Link: ${value}`);
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
}

function getPaymentLinkLimits(catalog) {
    if (!catalog || !Array.isArray(catalog.products) || catalog.products.length === 0) {
        throw new Error("catalog.json must contain at least one product.");
    }
    if (!/^[a-z]{3}$/.test(catalog.currency || "")) {
        throw new Error("catalog.json must contain a three-letter lowercase currency.");
    }
    if (!catalog.campaign || typeof catalog.campaign !== "string") {
        throw new Error("catalog.json must contain a campaign name.");
    }

    const productIds = new Set();
    const paymentLinks = new Set();
    const limits = [];

    for (const product of catalog.products) {
        if (!product.id || productIds.has(product.id)) {
            throw new Error(`Product IDs must be present and unique: ${product.id || "(missing)"}`);
        }
        productIds.add(product.id);

        if (!product.name || !Number.isInteger(product.priceCents) || product.priceCents < 0) {
            throw new Error(`Product ${product.id} needs a name and a non-negative integer price.`);
        }
        if (!Array.isArray(product.colors) || product.colors.length === 0) {
            throw new Error(`Product ${product.id} needs at least one color.`);
        }
        if (!Array.isArray(product.variants) || product.variants.length === 0) {
            throw new Error(`Product ${product.id} needs at least one variant.`);
        }

        const variantValues = new Set();
        for (const variant of product.variants) {
            if (!variant.value || !variant.label || variantValues.has(variant.value)) {
                throw new Error(`Variants for ${product.id} need unique values and labels.`);
            }
            variantValues.add(variant.value);

            if (!Number.isInteger(variant.usageLimit) || variant.usageLimit < 1) {
                throw new Error(`${product.id} (${variant.value}) needs a positive integer usageLimit.`);
            }

            const url = normalizePaymentLink(variant.paymentLink);
            if (paymentLinks.has(url)) {
                throw new Error(`Payment Links must be unique: ${url}`);
            }
            paymentLinks.add(url);
            limits.push({
                label: `${product.name} — ${variant.label}`,
                url,
                mode: new URL(url).pathname.startsWith("/test_") ? "test" : "live",
                limit: variant.usageLimit
            });
        }
    }

    return limits;
}

module.exports = { getPaymentLinkLimits, normalizePaymentLink };
