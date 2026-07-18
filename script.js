"use strict";

const priceFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
});
const productGrid = document.querySelector("#productGrid");
const toast = document.querySelector("#toast");

let catalog;
let products = [];
let toastTimer;

function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;"
    })[character]);
}

function formatPrice(cents) {
    return priceFormatter.format(cents / 100);
}

function getDropLimit(product) {
    return product.variants.reduce((total, variant) => total + variant.usageLimit, 0);
}

function renderVariantChoices(product) {
    if (product.variants.length === 1) return "";

    return `
        <fieldset class="variant-group">
            <legend>Choose your size</legend>
            <div class="size-choices">
                ${product.variants.map((variant, index) => `
                    <label class="size-choice">
                        <input type="radio" name="variant" value="${escapeHtml(variant.value)}" ${index === 0 ? "checked" : ""}>
                        <span>
                            <strong>${escapeHtml(variant.value)}</strong>
                            <small>Limit ${variant.usageLimit}</small>
                        </span>
                    </label>
                `).join("")}
            </div>
        </fieldset>`;
}

function renderColorChoice(product) {
    if (product.colors.length < 2) return "";

    return `
        <label class="color-choice">Primary color
            <select name="color">
                ${product.colors.map((color) => `
                    <option value="${escapeHtml(color)}">${escapeHtml(color)}</option>
                `).join("")}
            </select>
        </label>`;
}

function renderProducts() {
    productGrid.innerHTML = products.map((product) => {
        const firstVariant = product.variants[0];
        const limit = getDropLimit(product);
        const limitText = product.variants.length === 1
            ? `Limited to ${limit} in this drop`
            : `Limited to ${limit} across all sizes`;
        const categoryClass = product.category.toLowerCase().replace(/[^a-z0-9-]/g, "");

        return `
            <article class="product-card" data-product-id="${escapeHtml(product.id)}">
                <div class="product-art product-art-${categoryClass}" aria-hidden="true">
                    <span>${escapeHtml(product.shortName)}</span>
                </div>
                <form class="product-info variant-form" data-product-form>
                    <div class="product-topline">
                        <span>${escapeHtml(product.category)}</span>
                        <strong>${formatPrice(product.priceCents)}</strong>
                    </div>
                    <h3>${escapeHtml(product.name)}</h3>
                    <p>${escapeHtml(product.description)}</p>
                    <p class="stock-callout">${limitText}</p>
                    ${renderVariantChoices(product)}
                    ${renderColorChoice(product)}
                    <div class="selection-summary" aria-live="polite">
                        <span>Selection</span>
                        <strong data-selection>${escapeHtml(firstVariant.label)}</strong>
                    </div>
                    <button class="button button-primary buy-now" type="submit">Buy now with Stripe</button>
                    <p class="payment-note">Secure checkout on Stripe. Each link closes at its drop limit.</p>
                </form>
            </article>`;
    }).join("");
    productGrid.removeAttribute("aria-busy");
}

function findProduct(form) {
    const productId = form.closest("[data-product-id]")?.dataset.productId;
    return products.find((product) => product.id === productId) || null;
}

function getVariant(form, product) {
    const selected = new FormData(form).get("variant") || product.variants[0].value;
    return product.variants.find((variant) => variant.value === selected) || null;
}

function getSafePaymentLink(rawLink) {
    try {
        const url = new URL(rawLink);
        return url.protocol === "https:" && url.hostname === "buy.stripe.com" ? url : null;
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
    url.searchParams.set("utm_campaign", catalog.campaign);
    url.searchParams.set("utm_content", selection);
    return url.toString();
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function showCatalogError() {
    productGrid.removeAttribute("aria-busy");
    productGrid.innerHTML = `
        <p class="shop-error" role="alert">
            The shop could not load. Please refresh the page or contact Drip Dye.
        </p>`;
}

async function loadCatalog() {
    const response = await fetch("./catalog.json", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Catalog request failed with ${response.status}.`);

    catalog = await response.json();
    if (!Array.isArray(catalog.products) || catalog.products.length === 0) {
        throw new Error("The product catalog is empty.");
    }
    products = catalog.products;
    renderProducts();
}

productGrid.addEventListener("change", (event) => {
    if (event.target.name !== "variant") return;
    const form = event.target.closest("form");
    const product = findProduct(form);
    const variant = product && getVariant(form, product);
    if (variant) form.querySelector("[data-selection]").textContent = variant.label;
});

productGrid.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    const product = findProduct(form);
    const variant = product && getVariant(form, product);
    const color = new FormData(form).get("color") || product?.colors[0] || "";
    const checkoutUrl = variant && buildCheckoutUrl(product, variant, color);

    if (!checkoutUrl) {
        showToast("This checkout link is unavailable right now.");
        return;
    }

    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Opening Stripe…";
    window.location.assign(checkoutUrl);
});

loadCatalog().catch((error) => {
    console.error(error);
    showCatalogError();
});
