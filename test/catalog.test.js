"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const catalog = require("../catalog.json");
const { products } = require("../backend/catalog");
const { getPaymentLinkLimits } = require("../scripts/catalog");

test("catalog contains one unique Payment Link and positive limit per variant", () => {
    const limits = getPaymentLinkLimits(catalog);
    const variantCount = catalog.products.reduce((total, product) => total + product.variants.length, 0);

    assert.equal(limits.length, variantCount);
    assert.equal(new Set(limits.map(({ url }) => url)).size, limits.length);
    assert.ok(limits.every(({ limit }) => Number.isInteger(limit) && limit > 0));
});

test("backend inventory is derived from the shared catalog limits", () => {
    for (const product of products) {
        const source = catalog.products.find(({ id }) => id === product.id);
        assert.deepEqual(product.sizes, source.variants.map(({ value }) => value));
        assert.deepEqual(product.inventory, Object.fromEntries(
            source.variants.map(({ value, usageLimit }) => [value, usageLimit])
        ));
    }
});
