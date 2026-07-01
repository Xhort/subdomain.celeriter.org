"use strict";

const products = Object.freeze([
    Object.freeze({
        id: "tie-dye-tshirt",
        name: "Tie Dye T-shirt",
        category: "Shirt",
        priceCents: 1200,
        shortName: "TEE",
        description: "A handmade cotton tie-dye tee. Every pattern is one of a kind.",
        colors: Object.freeze(["Red", "Blue", "Green", "Orange", "Yellow"]),
        variants: Object.freeze([
            Object.freeze({ value: "S", label: "Small", stock: 3, paymentLink: "https://buy.stripe.com/test_cNi4gsgXwbMm37P7pyfEk05" }),
            Object.freeze({ value: "M", label: "Medium", stock: 5, paymentLink: "https://buy.stripe.com/test_eVq9AM4aKcQq7o5fW4fEk04" }),
            Object.freeze({ value: "L", label: "Large", stock: 10, paymentLink: "https://buy.stripe.com/test_00w28k6iScQqbEl11afEk03" }),
            Object.freeze({ value: "XL", label: "Extra Large", stock: 6, paymentLink: "https://buy.stripe.com/test_5kQ00c4aK2bM4bTdNWfEk02" })
        ])
    }),
    Object.freeze({
        id: "tie-dye-tote-bag",
        name: "Tie Dye Tote Bag",
        category: "Bag",
        priceCents: 2000,
        shortName: "TOTE",
        description: "A hand-dyed tote for groceries, beach trips, school, and everyday errands.",
        variants: Object.freeze([
            Object.freeze({ value: "One size", label: "One size", stock: 4, paymentLink: "https://buy.stripe.com/test_8x2bIUcHg3fQaAh39ifEk06" })
        ])
    }),
    Object.freeze({
        id: "tie-dye-drawstring-bag",
        name: "Tie Dye Drawstring Bag",
        category: "Bag",
        priceCents: 1800,
        shortName: "DRAW",
        description: "A lightweight, hand-dyed drawstring bag for the gym, school, or day trips.",
        variants: Object.freeze([
            Object.freeze({ value: "One size", label: "One size", stock: 4, paymentLink: "https://buy.stripe.com/test_6oU9AM0YyeYycIp39ifEk07" })
        ])
    }),
    Object.freeze({
        id: "tie-dye-makeup-bag",
        name: "Tie Dye Makeup Bag",
        category: "Bag",
        priceCents: 1500,
        shortName: "POUCH",
        description: "A one-of-a-kind travel pouch that keeps cosmetics organized on the go.",
        variants: Object.freeze([
            Object.freeze({ value: "One size", label: "One size", stock: 4, paymentLink: "https://buy.stripe.com/test_00wbIU7mW5nYcIpfW4fEk08" })
        ])
    })
]);

const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const productGrid = document.querySelector("#productGrid");
const toast = document.querySelector("#toast");
let toastTimer;

function formatPrice(cents) {
    return priceFormatter.format(cents / 100);
}

function renderVariantChoices(product) {
    if (product.variants.length === 1) return "";
    return `
        <fieldset class="variant-group">
            <legend>Choose your size</legend>
            <div class="size-choices">
                ${product.variants.map((variant, index) => `
                    <label class="size-choice">
                        <input type="radio" name="variant" value="${variant.value}" ${index === 0 ? "checked" : ""}>
                        <span><strong>${variant.value}</strong><small>${variant.stock} available</small></span>
                    </label>
                `).join("")}
            </div>
        </fieldset>`;
}

function renderColorChoice(product) {
    if (!product.colors) return "";
    return `
        <label class="color-choice">Primary color
            <select name="color">
                ${product.colors.map((color) => `<option value="${color}">${color}</option>`).join("")}
            </select>
        </label>`;
}

function renderProducts() {
    productGrid.innerHTML = products.map((product) => {
        const onlyVariant = product.variants[0];
        const stockText = product.variants.length === 1
            ? `${onlyVariant.stock} available`
            : `${product.variants.reduce((sum, variant) => sum + variant.stock, 0)} across all sizes`;
        return `
            <article class="product-card" data-product-id="${product.id}">
                <div class="product-art product-art-${product.category.toLowerCase()}" aria-hidden="true">
                    <span>${product.shortName}</span>
                </div>
                <form class="product-info variant-form" data-product-form>
                    <div class="product-topline"><span>${product.category}</span><strong>${formatPrice(product.priceCents)}</strong></div>
                    <h3>${product.name}</h3>
                    <p>${product.description}</p>
                    <p class="stock-callout">${stockText}</p>
                    ${renderVariantChoices(product)}
                    ${renderColorChoice(product)}
                    <div class="selection-summary" aria-live="polite">
                        <span>Selection</span>
                        <strong data-selection>${onlyVariant.label}</strong>
                    </div>
                    <button class="button button-primary buy-now" type="submit">Buy now with Stripe</button>
                    <p class="payment-note">This product checks out as a separate order on Stripe.</p>
                </form>
            </article>`;
    }).join("");
}

function findProduct(form) {
    const productId = form.closest("[data-product-id]").dataset.productId;
    return products.find((product) => product.id === productId);
}

function getVariant(form, product) {
    const selected = new FormData(form).get("variant") || product.variants[0].value;
    return product.variants.find((variant) => variant.value === selected) || null;
}

function getSafePaymentLink(rawLink) {
    try {
        const url = new URL(rawLink);
        const stripeHost = url.hostname === "buy.stripe.com" || url.hostname.endsWith(".stripe.com");
        return url.protocol === "https:" && stripeHost ? url : null;
    } catch {
        return null;
    }
}

function buildCheckoutUrl(product, variant, color) {
    const url = getSafePaymentLink(variant.paymentLink);
    if (!url) return null;
    const selection = [product.id, variant.value, color].filter(Boolean).join("-")
        .toLowerCase().replace(/[^a-z0-9-]/g, "-");
    url.searchParams.set("client_reference_id", `${selection}-${Date.now()}`.slice(0, 200));
    url.searchParams.set("utm_source", "drip_dye_website");
    url.searchParams.set("utm_medium", "product_payment_link");
    url.searchParams.set("utm_campaign", "first_drop");
    url.searchParams.set("utm_content", selection);
    return url.toString();
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

renderProducts();

productGrid.addEventListener("change", (event) => {
    if (event.target.name !== "variant") return;
    const form = event.target.closest("form");
    const product = findProduct(form);
    const variant = getVariant(form, product);
    form.querySelector("[data-selection]").textContent = `${variant.label} (${variant.value})`;
});

productGrid.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    const product = findProduct(form);
    const variant = getVariant(form, product);
    const color = new FormData(form).get("color") || "";
    const checkoutUrl = variant && buildCheckoutUrl(product, variant, color);
    if (!checkoutUrl) {
        showToast("This checkout link is unavailable right now.");
        return;
    }
    window.location.assign(checkoutUrl);
});
