const primaryColors = [
    { name: "Red", value: "#e11d48" },
    { name: "Blue", value: "#0aa6ff" },
    { name: "Green", value: "#22c55e" },
    { name: "Orange", value: "#ff7a1a" },
    { name: "Yellow", value: "#ffd84d" }
];

const products = [
    {
        id: "tie-dye-tshirt",
        name: "Tie Dye T-shirt",
        category: "Shirt",
        price: 20,
        shortName: "TEE",
        description: "A handmade cotton tee dyed in your chosen primary color family.",
        sizes: ["S", "M", "L", "XL"]
    },
    {
        id: "tie-dye-tote-bag",
        name: "Tie Dye Tote Bag",
        category: "Bag",
        price: 16,
        shortName: "TOTE",
        description: "A reusable tote bag with a one-of-one tie-dye pattern.",
        sizes: ["One size"]
    },
    {
        id: "tie-dye-drawstring-bag",
        name: "Tie Dye Drawstring Bag",
        category: "Bag",
        price: 14,
        shortName: "DRAW",
        description: "A lightweight drawstring bag for school, practice, or day trips.",
        sizes: ["One size"]
    }
];

const productGrid = document.querySelector("#productGrid");
const cartDrawer = document.querySelector("#cartDrawer");
const cartItems = document.querySelector("#cartItems");
const cartSubtotal = document.querySelector("#cartSubtotal");
const checkoutForm = document.querySelector("#checkoutForm");
const toast = document.querySelector("#toast");

let cart = loadCart();

function loadCart() {
    try {
        return JSON.parse(localStorage.getItem("drip-dye-simple-cart")) || [];
    } catch {
        return [];
    }
}

function saveCart() {
    localStorage.setItem("drip-dye-simple-cart", JSON.stringify(cart));
}

function formatPrice(amount) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
    }).format(amount);
}

function refreshIcons() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function renderProducts() {
    productGrid.innerHTML = products.map((product) => {
        const colorOptions = primaryColors.map((color) => `<option value="${color.name}">${color.name}</option>`).join("");
        const sizeOptions = product.sizes.map((size) => `<option value="${size}">${size}</option>`).join("");

        return `
            <article class="product-card" data-product-id="${product.id}">
                <div class="product-art" aria-hidden="true">
                    <span>${product.shortName}</span>
                </div>
                <div class="product-info">
                    <div class="product-topline">
                        <span>${product.category}</span>
                        <strong>${formatPrice(product.price)}</strong>
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
                        <i data-lucide="shopping-bag" aria-hidden="true"></i>
                        Add to bag
                    </button>
                </div>
            </article>
        `;
    }).join("");
    refreshIcons();
}

function addToCart(productId, size, color) {
    const key = `${productId}-${size}-${color}`;
    const currentItem = cart.find((item) => item.key === key);

    if (currentItem) {
        currentItem.quantity += 1;
    } else {
        cart.push({ key, productId, size, color, quantity: 1 });
    }

    saveCart();
    renderCart();
    openCart();
    showToast("Added to your bag.");
}

function renderCart() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.querySelectorAll("[data-cart-count]").forEach((count) => {
        count.textContent = totalItems;
    });

    if (cart.length === 0) {
        cartItems.innerHTML = `<p class="empty-state">Your bag is empty.</p>`;
        cartSubtotal.textContent = "$0";
        return;
    }

    cartItems.innerHTML = cart.map((item) => {
        const product = products.find((entry) => entry.id === item.productId);
        return `
            <article class="cart-item">
                <div>
                    <h3>${product.name}</h3>
                    <p>${item.size} / ${item.color}</p>
                    <div class="quantity-row">
                        <button type="button" data-decrease="${item.key}" aria-label="Decrease quantity">-</button>
                        <strong>${item.quantity}</strong>
                        <button type="button" data-increase="${item.key}" aria-label="Increase quantity">+</button>
                        <button class="remove-item" type="button" data-remove="${item.key}">Remove</button>
                    </div>
                </div>
                <strong>${formatPrice(product.price * item.quantity)}</strong>
            </article>
        `;
    }).join("");

    const subtotal = cart.reduce((sum, item) => {
        const product = products.find((entry) => entry.id === item.productId);
        return sum + product.price * item.quantity;
    }, 0);
    cartSubtotal.textContent = formatPrice(subtotal);
}

function updateCartQuantity(key, change) {
    const item = cart.find((entry) => entry.key === key);
    if (!item) return;

    item.quantity += change;
    if (item.quantity < 1) {
        cart = cart.filter((entry) => entry.key !== key);
    }

    saveCart();
    renderCart();
}

function openCart() {
    document.body.classList.add("cart-open");
    cartDrawer.setAttribute("aria-hidden", "false");
}

function closeCart() {
    document.body.classList.remove("cart-open");
    cartDrawer.setAttribute("aria-hidden", "true");
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2600);
}

function buildCheckoutPayload(form) {
    const formData = new FormData(form);
    return {
        customer: {
            name: formData.get("name"),
            email: formData.get("email"),
            notes: formData.get("notes")
        },
        items: cart.map((item) => ({
            productId: item.productId,
            size: item.size,
            color: item.color,
            quantity: item.quantity
        }))
    };
}

async function submitCheckout(event) {
    event.preventDefault();

    if (cart.length === 0) {
        showToast("Add at least one item before checkout.");
        return;
    }

    const button = checkoutForm.querySelector(".checkout-button");
    button.disabled = true;
    button.textContent = "Opening Stripe...";

    try {
        const response = await fetch("/api/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildCheckoutPayload(checkoutForm))
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || "Checkout could not be started.");
        }

        window.location.href = data.url;
    } catch (error) {
        showToast(error.message);
        button.disabled = false;
        button.innerHTML = `<i data-lucide="credit-card" aria-hidden="true"></i>Continue to secure checkout`;
        refreshIcons();
    }
}

function handleReturnMessage() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
        cart = [];
        saveCart();
        renderCart();
        showToast("Payment received. Thank you for ordering from Drip Dye.");
    }
    if (params.get("checkout") === "canceled") {
        showToast("Checkout was canceled. Your bag is still saved.");
    }
}

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

document.querySelector(".cart-toggle").addEventListener("click", openCart);
document.querySelector(".close-cart").addEventListener("click", closeCart);

cartDrawer.addEventListener("click", (event) => {
    if (event.target === cartDrawer) {
        closeCart();
    }
});

cartItems.addEventListener("click", (event) => {
    const increaseButton = event.target.closest("[data-increase]");
    const decreaseButton = event.target.closest("[data-decrease]");
    const removeButton = event.target.closest("[data-remove]");

    if (increaseButton) updateCartQuantity(increaseButton.dataset.increase, 1);
    if (decreaseButton) updateCartQuantity(decreaseButton.dataset.decrease, -1);
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
refreshIcons();
