"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const catalog = require("../catalog.json");
const { getPaymentLinkLimits } = require("../scripts/catalog");
const { inactiveMessage, syncPaymentLinkLimits } = require("../scripts/configure-stripe-limits");

function asyncList(values) {
    return {
        async *[Symbol.asyncIterator]() {
            yield* values;
        }
    };
}

test("Stripe synchronization updates only mismatched limits", async () => {
    const desired = getPaymentLinkLimits(catalog);
    const updates = [];
    const links = desired.map((entry, index) => ({
        id: `plink_${index}`,
        url: entry.url,
        inactive_message: index === 0 ? inactiveMessage : null,
        restrictions: { completed_sessions: { limit: index === 0 ? entry.limit : null } }
    }));
    const stripe = {
        paymentLinks: {
            list: () => asyncList(links),
            update: async (id, payload) => updates.push({ id, payload })
        }
    };

    const result = await syncPaymentLinkLimits(stripe, { log: () => {} });

    assert.equal(result.total, desired.length);
    assert.equal(result.updated, desired.length - 1);
    assert.equal(updates.length, desired.length - 1);
    assert.deepEqual(updates[0].payload.restrictions.completed_sessions, {
        limit: desired[1].limit
    });
});
