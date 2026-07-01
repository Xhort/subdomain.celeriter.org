"use strict";

/*
 * Storefront data
 * ----------------
 * Prices use integer cents rather than decimal dollars. That avoids floating-point
 * rounding mistakes and matches the format expected by Stripe and the server.
 */
const primaryColors = Object.freeze([
    { name: "Red", value: "#e11d48" },
    { name: "Blue", value: "#0aa6ff" },
    { name: "Green", value: "#22c55e" },
    { name: "Orange", value: "#ff7a1a" },
    { name: "Yellow", value: "#ffd84d" }
]);

// This is Stripe's hosted, live Payment Link for one $12 tie-dye shirt.
const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/eVq7sFf3Wc8cekk0RO18c00";

const products = Object.freeze([
    {
        id: "tie-dye-tshirt",
        name: "Tie Dye T-shirt",
        category: "Shirt",
        priceCents: 1200,
        shortName: "TEE",
        description: "A handmade cotton tee dyed in your chosen primary color family.",
        sizes: ["S", "M", "L", "XL"]
    }
]);

// Maps avoid repeatedly scanning the full product array during cart updates.
const productById = new Map(products.map((product) => [product.id, product]));
const allowedColorNames = new Set(primaryColors.map((color) => color.name));
const priceFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
});

/* Cache the page elements once instead of querying the document on every click. */
const productGrid = document.querySelector("#productGrid");
const cartDrawer = document.querySelector("#cartDrawer");
const cartItems = document.querySelector("#cartItems");
const cartSubtotal = document.querySelector("#cartSubtotal");
const checkoutForm = document.querySelector("#checkoutForm");
const checkoutButton = checkoutForm.querySelector(".checkout-button");
const cartToggle = document.querySelector(".cart-toggle");
const closeCartButton = document.querySelector(".close-cart");
const toast = document.querySelector("#toast");

let cart = loadCart();
let toastTimer;
let previouslyFocusedElement;

/* ---------- Small helpers ---------- */

function formatPrice(amountCents) {
    return priceFormatter.format(amountCents / 100);
}

function createCartKey(productId, size, color) {
    return `${productId}|${size}|${color}`;
}

/**
 * Treat localStorage as untrusted input. Old, malformed, or manually edited cart
 * data is filtered here so it cannot crash the page or reach the checkout API.
 */
function normalizeCart(value) {
    if (!Array.isArray(value)) return [];

    const normalizedItems = new Map();
    value.forEach((item) => {
        const product = productById.get(item?.productId);
        const size = typeof item?.size === "string" ? item.size : "";
        const color = typeof item?.color === "string" ? item.color : "";
        const quantity = Number(item?.quantity);

        if (
            !product ||
            !product.sizes.includes(size) ||
            !allowedColorNames.has(color) ||
            !Number.isInteger(quantity) ||
            quantity < 1
        ) {
            return;
        }

        const key = createCartKey(product.id, size, color);
        normalizedItems.set(key, {
            key,
            productId: product.id,
            size,
            color,
            // The supplied Payment Link charges for exactly one shirt.
            quantity: 1
        });
    });

    // Keep only one choice because the live Payment Link sells one shirt.
    return [...normalizedItems.values()].slice(-1);
}

function loadCart() {
    try {
        return normalizeCart(JSON.parse(localStorage.getItem("drip-dye-simple-cart")));
    } catch {
        // Browsing modes that block storage should not stop the store from working.
        return [];
    }
}

function saveCart() {
    try {
        localStorage.setItem("drip-dye-simple-cart", JSON.stringify(cart));
    } catch {
        // The in-memory cart still works when storage is full or unavailable.
    }
}

/* ---------- Rendering ---------- */

function renderProducts() {
    productGrid.innerHTML = products.map((product) => {
        const colorOptions = primaryColors
            .map((color) => `<option value="${color.name}">${color.name}</option>`)
            .join("");
        const sizeOptions = product.sizes
            .map((size) => `<option value="${size}">${size}</option>`)
            .join("");

        return `
            <article class="product-card" data-product-id="${product.id}">
                <div class="product-art" aria-hidden="true">
                    <span>${product.shortName}</span>
                </div>
                <div class="product-info">
                    <div class="product-topline">
                        <span>${product.category}</span>
                        <strong>${formatPrice(product.priceCents)}</strong>
                    </div>
                    <h3>${product.name}</h3>
                    <p>${product.description}</p>
                    <div class="options-grid">
                        <label>
                            Primary color
                            <select data-color>${colorOptions}</select>
                        </label>
                        <label>
                            Size
                            <select data-size>${sizeOptions}</select>
                        </label>
                    </div>
                    <button class="button button-primary add-cart" type="button" data-add="${product.id}">
                        Choose this shirt
                    </button>
                </div>
            </article>
        `;
    }).join("");
}

function renderCart() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.querySelectorAll("[data-cart-count]").forEach((count) => {
        count.textContent = String(totalItems);
    });
    cartToggle.setAttribute(
        "aria-label",
        totalItems === 0 ? "Review shirt order" : "Review selected shirt"
    );

    checkoutButton.disabled = cart.length === 0;

    if (cart.length === 0) {
        cartItems.innerHTML = `<p class="empty-state">Choose a shirt size and color to continue.</p>`;
        cartSubtotal.textContent = formatPrice(0);
        return;
    }

    cartItems.innerHTML = cart.map((item) => {
        const product = productById.get(item.productId);
        return `
            <article class="cart-item">
                <div>
                    <h3>${product.name}</h3>
                    <p>${item.size} / ${item.color}</p>
                    <div class="quantity-row">
                        <span>Quantity: 1</span>
                        <button class="remove-item" type="button" data-remove="${item.key}">Change selection</button>
                    </div>
                </div>
                <strong>${formatPrice(product.priceCents * item.quantity)}</strong>
            </article>
        `;
    }).join("");

    const subtotalCents = cart.reduce((sum, item) => {
        return sum + productById.get(item.productId).priceCents * item.quantity;
    }, 0);
    cartSubtotal.textContent = formatPrice(subtotalCents);
}

/* ---------- Cart behavior ---------- */

function addToCart(productId, size, color) {
    const key = createCartKey(productId, size, color);

    // A Payment Link represents one fixed line item, so a new selection replaces
    // the previous one instead of creating a multi-item cart Stripe cannot match.
    cart = [{ key, productId, size, color, quantity: 1 }];

    saveCart();
    renderCart();
    openCart();
    showToast("Shirt selected. Review your order, then continue to Stripe.");
}

function openCart() {
    previouslyFocusedElement = document.activeElement;
    cartDrawer.removeAttribute("inert");
    cartDrawer.setAttribute("aria-hidden", "false");
    cartToggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("cart-open");

    // Move focus into the modal after the browser has painted its open state.
    window.requestAnimationFrame(() => closeCartButton.focus());
}

function closeCart() {
    document.body.classList.remove("cart-open");
    cartDrawer.setAttribute("aria-hidden", "true");
    cartDrawer.setAttribute("inert", "");
    cartToggle.setAttribute("aria-expanded", "false");

    if (previouslyFocusedElement instanceof HTMLElement) {
        previouslyFocusedElement.focus();
    }
}

/** Keep Tab focus inside the open modal and let Escape close it. */
function handleCartKeyboard(event) {
    if (event.key === "Escape") {
        closeCart();
        return;
    }
    if (event.key !== "Tab") return;

    const focusableElements = [...cartDrawer.querySelectorAll(
        "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]"
    )];
    const firstElement = focusableElements[0];
    const lastElement = focusableElements.at(-1);

    if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
    }
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2600);
}

/* ---------- Stripe Payment Link checkout ---------- */

function buildStripePaymentUrl(item) {
    const paymentUrl = new URL(STRIPE_PAYMENT_LINK);
    const safeSize = item.size.replace(/[^a-z0-9]/gi, "_");
    const safeColor = item.color.replace(/[^a-z0-9]/gi, "_");
    const selectionReference = `shirt_${safeSize}_${safeColor}`;

    /*
     * Stripe supports client_reference_id and UTM values on Payment Links. They
     * let the Stripe session/webhook identify the shirt choice without putting
     * customer or payment details in this website's code.
     */
    paymentUrl.searchParams.set("client_reference_id", `${selectionReference}_${Date.now()}`);
    paymentUrl.searchParams.set("utm_source", "drip_dye_website");
    paymentUrl.searchParams.set("utm_medium", "storefront");
    paymentUrl.searchParams.set("utm_campaign", "first_drop");
    paymentUrl.searchParams.set("utm_content", selectionReference);

    return paymentUrl.toString();
}

function submitCheckout(event) {
    event.preventDefault();

    if (cart.length === 0) {
        showToast("Choose your shirt size and color before checkout.");
        return;
    }

    window.location.assign(buildStripePaymentUrl(cart[0]));
}

function handleReturnMessage() {
    const url = new URL(window.location.href);
    const checkoutStatus = url.searchParams.get("checkout");

    if (checkoutStatus === "success") {
        cart = [];
        saveCart();
        renderCart();
        showToast("Payment received. Thank you for ordering from Drip Dye.");
    } else if (checkoutStatus === "canceled") {
        showToast("Checkout was canceled. Your bag is still saved.");
    }

    // Remove one-time status values so refreshing does not repeat the message.
    if (checkoutStatus) {
        url.searchParams.delete("checkout");
        url.searchParams.delete("order");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
}

/* ---------- Event wiring and initial page render ---------- */

productGrid.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add]");
    if (!addButton) return;

    const card = addButton.closest("[data-product-id]");
    addToCart(
        addButton.dataset.add,
        card.querySelector("[data-size]").value,
        card.querySelector("[data-color]").value
    );
});

cartToggle.addEventListener("click", openCart);
closeCartButton.addEventListener("click", closeCart);
cartDrawer.addEventListener("keydown", handleCartKeyboard);
cartDrawer.addEventListener("click", (event) => {
    if (event.target === cartDrawer) closeCart();
});

cartItems.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove]");

    if (removeButton) {
        cart = cart.filter((item) => item.key !== removeButton.dataset.remove);
        saveCart();
        renderCart();
    }
});

checkoutForm.addEventListener("submit", submitCheckout);

renderProducts();
renderCart();
handleReturnMessage();
