const products = [
    {
        id: "after-class-spiral",
        name: "After Class Spiral Tee",
        category: "Tees",
        price: 13,
        badge: "Best seller",
        image: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80",
        alt: "Young adult wearing bright casual fashion outfit",
        description: "Classic spiral tee with high-energy color blends for everyday outfits.",
        colors: [
            { name: "Sunset Pop", value: "#ff3f9f" },
            { name: "Pool Blue", value: "#0aa6ff" },
            { name: "Lime Flash", value: "#30d876" }
        ],
        sizes: ["S", "M", "L", "XL"]
    },
    {
        id: "market-run-tee",
        name: "Market Run Cloud Tee",
        category: "Tees",
        price: 12,
        badge: "Small batch",
        image: "https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?auto=format&fit=crop&w=900&q=80",
        alt: "Casual shirt styled for a market day outfit",
        description: "Soft cloud-dye tee made for school events, weekend markets, and gifting.",
        colors: [
            { name: "Sky Wash", value: "#80d8ff" },
            { name: "Grape", value: "#8b5cf6" },
            { name: "Lemon", value: "#ffd84d" }
        ],
        sizes: ["XS", "S", "M", "L", "XL"]
    },
    {
        id: "game-day-bundle",
        name: "Game Day Team Bundle",
        category: "Bundles",
        price: 18,
        badge: "Group fave",
        image: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=900&q=80",
        alt: "Colorful clothing arranged on hangers",
        description: "A custom tee plus matching accessory option for teams, clubs, and friend groups.",
        colors: [
            { name: "School Colors", value: "#0aa6ff" },
            { name: "Blackout", value: "#111116" },
            { name: "Gold Rush", value: "#ffd84d" }
        ],
        sizes: ["S", "M", "L", "XL", "Team"]
    },
    {
        id: "mini-drip-scrunchie",
        name: "Mini Drip Scrunchie",
        category: "Accessories",
        price: 3,
        badge: "Under $5",
        image: "https://images.unsplash.com/photo-1523381294911-8d3cead13475?auto=format&fit=crop&w=900&q=80",
        alt: "Bright clothing and accessories folded together",
        description: "Colorful handmade accessory for matching your tee or gifting with an order.",
        colors: [
            { name: "Pink Mix", value: "#ff3f9f" },
            { name: "Teal Mix", value: "#26d7c4" },
            { name: "Sunny Mix", value: "#ffd84d" }
        ],
        sizes: ["One size"]
    },
    {
        id: "splash-bandana",
        name: "Splash Bandana",
        category: "Accessories",
        price: 5,
        badge: "Add-on",
        image: "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?auto=format&fit=crop&w=900&q=80",
        alt: "Colorful clothing rack in a boutique",
        description: "A bold bandana for hair, bags, pets, game days, and matching group looks.",
        colors: [
            { name: "Rainbow", value: "#8b5cf6" },
            { name: "Ocean", value: "#0aa6ff" },
            { name: "Fire", value: "#ff6b35" }
        ],
        sizes: ["One size"]
    },
    {
        id: "custom-color-slot",
        name: "Custom Color Slot",
        category: "Custom",
        price: 10,
        badge: "Made for you",
        image: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=900&q=80",
        alt: "Fashion portrait with expressive color styling",
        description: "Reserve a custom dye direction for a tee, gift, team order, or event piece.",
        colors: [
            { name: "Neon", value: "#30d876" },
            { name: "Pastel", value: "#f7a7c8" },
            { name: "Bold", value: "#ff3f9f" }
        ],
        sizes: ["Quote", "S", "M", "L", "XL"]
    }
];

const productGrid = document.querySelector("#productGrid");
const emptyState = document.querySelector("#emptyState");
const productSearch = document.querySelector("#productSearch");
const sortProducts = document.querySelector("#sortProducts");
const cartDrawer = document.querySelector("#cartDrawer");
const cartItems = document.querySelector("#cartItems");
const cartSubtotal = document.querySelector("#cartSubtotal");
const checkoutForm = document.querySelector("#checkoutForm");
const toast = document.querySelector("#toast");
const quickView = document.querySelector("#quickView");
const quickViewContent = document.querySelector("#quickViewContent");

let activeFilter = "All";
let cart = loadFromStorage("drip-dye-cart", []);
let wishlist = loadFromStorage("drip-dye-wishlist", []);

function loadFromStorage(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch {
        return fallback;
    }
}

function saveState() {
    localStorage.setItem("drip-dye-cart", JSON.stringify(cart));
    localStorage.setItem("drip-dye-wishlist", JSON.stringify(wishlist));
}

function formatPrice(value) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
    }).format(value);
}

function refreshIcons() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function renderProducts() {
    const searchTerm = productSearch.value.trim().toLowerCase();
    const sortedProducts = [...products]
        .filter((product) => activeFilter === "All" || product.category === activeFilter)
        .filter((product) => {
            const searchable = `${product.name} ${product.category} ${product.description}`.toLowerCase();
            return searchable.includes(searchTerm);
        })
        .sort((a, b) => {
            if (sortProducts.value === "low") return a.price - b.price;
            if (sortProducts.value === "high") return b.price - a.price;
            if (sortProducts.value === "name") return a.name.localeCompare(b.name);
            return products.indexOf(a) - products.indexOf(b);
        });

    productGrid.innerHTML = sortedProducts.map((product) => productCardTemplate(product)).join("");
    emptyState.hidden = sortedProducts.length > 0;
    refreshIcons();
}

function productCardTemplate(product) {
    const colors = product.colors.map((color) => (
        `<span class="swatch" title="${color.name}" style="background:${color.value}"></span>`
    )).join("");
    const colorOptions = product.colors.map((color) => `<option>${color.name}</option>`).join("");
    const sizeOptions = product.sizes.map((size) => `<option>${size}</option>`).join("");
    const isWished = wishlist.includes(product.id);

    return `
        <article class="product-card" data-product-id="${product.id}">
            <div class="product-media">
                <img src="${product.image}" alt="${product.alt}" loading="lazy">
                <span class="product-badge">${product.badge}</span>
                <button class="wishlist-button ${isWished ? "is-active" : ""}" type="button" data-wishlist="${product.id}" aria-label="Save ${product.name}">
                    <i data-lucide="heart" aria-hidden="true"></i>
                </button>
            </div>
            <div class="product-info">
                <div class="product-topline">
                    <span class="product-category">${product.category}</span>
                    <span class="product-price">${formatPrice(product.price)}</span>
                </div>
                <h3>${product.name}</h3>
                <p>${product.description}</p>
                <div class="swatches" aria-label="Available colors">${colors}</div>
                <div class="product-options">
                    <select data-size aria-label="Choose size for ${product.name}">${sizeOptions}</select>
                    <select data-color aria-label="Choose color for ${product.name}">${colorOptions}</select>
                </div>
                <div class="product-actions">
                    <button class="button button-primary add-cart" type="button" data-add="${product.id}">
                        <i data-lucide="shopping-bag" aria-hidden="true"></i>
                        Add
                    </button>
                    <button class="button button-secondary quick-button" type="button" data-quick="${product.id}" aria-label="Preview ${product.name}">
                        <i data-lucide="eye" aria-hidden="true"></i>
                    </button>
                </div>
            </div>
        </article>
    `;
}

function addToCart(productId, size, color) {
    const product = products.find((item) => item.id === productId);
    const key = `${productId}-${size}-${color}`;
    const currentItem = cart.find((item) => item.key === key);

    if (currentItem) {
        currentItem.quantity += 1;
    } else {
        cart.push({ key, productId, size, color, quantity: 1 });
    }

    saveState();
    renderCart();
    showToast(`${product.name} added to your bag.`);
}

function renderCart() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.querySelectorAll("[data-cart-count]").forEach((count) => {
        count.textContent = totalItems;
    });

    if (cart.length === 0) {
        cartItems.innerHTML = `<p class="empty-state">Your bag is ready for color.</p>`;
        cartSubtotal.textContent = "$0";
        refreshIcons();
        return;
    }

    cartItems.innerHTML = cart.map((item) => {
        const product = products.find((entry) => entry.id === item.productId);
        return `
            <article class="cart-item">
                <img src="${product.image}" alt="${product.alt}">
                <div>
                    <h3>${product.name}</h3>
                    <p>${item.size} / ${item.color}</p>
                    <div class="cart-item-actions">
                        <div class="quantity-stepper" aria-label="Quantity for ${product.name}">
                            <button type="button" data-decrease="${item.key}" aria-label="Decrease quantity">-</button>
                            <span>${item.quantity}</span>
                            <button type="button" data-increase="${item.key}" aria-label="Increase quantity">+</button>
                        </div>
                        <strong>${formatPrice(product.price * item.quantity)}</strong>
                    </div>
                    <button class="remove-item" type="button" data-remove="${item.key}">Remove</button>
                </div>
            </article>
        `;
    }).join("");

    const subtotal = cart.reduce((sum, item) => {
        const product = products.find((entry) => entry.id === item.productId);
        return sum + product.price * item.quantity;
    }, 0);
    cartSubtotal.textContent = formatPrice(subtotal);
    refreshIcons();
}

function updateCartQuantity(key, direction) {
    const item = cart.find((entry) => entry.key === key);
    if (!item) return;

    item.quantity += direction;
    if (item.quantity <= 0) {
        cart = cart.filter((entry) => entry.key !== key);
    }

    saveState();
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

function openQuickView(productId) {
    const product = products.find((item) => item.id === productId);
    const colorOptions = product.colors.map((color) => `<option>${color.name}</option>`).join("");
    const sizeOptions = product.sizes.map((size) => `<option>${size}</option>`).join("");

    quickViewContent.innerHTML = `
        <article class="quick-product">
            <img src="${product.image}" alt="${product.alt}">
            <div class="quick-copy">
                <span class="product-category">${product.category}</span>
                <h2 id="quickViewTitle">${product.name}</h2>
                <strong>${formatPrice(product.price)}</strong>
                <p>${product.description}</p>
                <div class="quick-options">
                    <label>
                        Size
                        <select data-quick-size>${sizeOptions}</select>
                    </label>
                    <label>
                        Color
                        <select data-quick-color>${colorOptions}</select>
                    </label>
                </div>
                <button class="button button-primary" type="button" data-quick-add="${product.id}">
                    <i data-lucide="shopping-bag" aria-hidden="true"></i>
                    Add to bag
                </button>
            </div>
        </article>
    `;
    document.body.classList.add("quick-open");
    quickView.setAttribute("aria-hidden", "false");
    refreshIcons();
}

function closeQuickView() {
    document.body.classList.remove("quick-open");
    quickView.setAttribute("aria-hidden", "true");
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2600);
}

function buildOrderPayload(form) {
    const formData = new FormData(form);
    return {
        customer: {
            name: formData.get("name"),
            contact: formData.get("contact"),
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

async function submitOrder(event) {
    event.preventDefault();

    if (cart.length === 0) {
        showToast("Add at least one item before placing an order.");
        return;
    }

    const button = checkoutForm.querySelector(".checkout-button");
    button.disabled = true;
    button.textContent = "Saving order...";

    try {
        const response = await fetch("/api/orders", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(buildOrderPayload(checkoutForm))
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || "The order could not be saved.");
        }

        cart = [];
        saveState();
        renderCart();
        checkoutForm.reset();
        showToast(`Order #${data.order.id} saved. Drip Dye will follow up soon.`);
    } catch (error) {
        showToast(error.message);
    } finally {
        button.disabled = false;
        button.innerHTML = `<i data-lucide="credit-card" aria-hidden="true"></i>Place order request`;
        refreshIcons();
    }
}

document.querySelector(".theme-toggle").addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("drip-dye-theme", nextTheme);
});

document.querySelector(".menu-toggle").addEventListener("click", (event) => {
    const isOpen = document.body.classList.toggle("nav-open");
    event.currentTarget.setAttribute("aria-expanded", String(isOpen));
});

document.querySelectorAll(".site-nav a, .hero-actions a, .footer-links a").forEach((link) => {
    link.addEventListener("click", () => {
        document.body.classList.remove("nav-open");
        document.querySelector(".menu-toggle").setAttribute("aria-expanded", "false");
    });
});

document.querySelector(".search-jump").addEventListener("click", () => {
    document.querySelector("#shop").scrollIntoView({ behavior: "smooth" });
    window.setTimeout(() => productSearch.focus(), 500);
});

document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
        document.querySelector(".filter-chip.is-active").classList.remove("is-active");
        chip.classList.add("is-active");
        activeFilter = chip.dataset.filter;
        renderProducts();
    });
});

document.querySelectorAll("[data-collection-filter]").forEach((tile) => {
    tile.addEventListener("click", () => {
        const matchingChip = document.querySelector(`[data-filter="${tile.dataset.collectionFilter}"]`);
        if (!matchingChip) return;
        matchingChip.click();
    });
});

productSearch.addEventListener("input", renderProducts);
sortProducts.addEventListener("change", renderProducts);

productGrid.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add]");
    const quickButton = event.target.closest("[data-quick]");
    const wishlistButton = event.target.closest("[data-wishlist]");

    if (addButton) {
        const card = addButton.closest("[data-product-id]");
        const size = card.querySelector("[data-size]").value;
        const color = card.querySelector("[data-color]").value;
        addToCart(addButton.dataset.add, size, color);
        openCart();
    }

    if (quickButton) {
        openQuickView(quickButton.dataset.quick);
    }

    if (wishlistButton) {
        const productId = wishlistButton.dataset.wishlist;
        wishlist = wishlist.includes(productId)
            ? wishlist.filter((id) => id !== productId)
            : [...wishlist, productId];
        saveState();
        wishlistButton.classList.toggle("is-active");
        showToast(wishlist.includes(productId) ? "Saved to wishlist." : "Removed from wishlist.");
    }
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
        saveState();
        renderCart();
    }
});

checkoutForm.addEventListener("submit", submitOrder);

document.querySelector(".quick-close").addEventListener("click", closeQuickView);
quickView.addEventListener("click", (event) => {
    if (event.target === quickView) {
        closeQuickView();
    }
});

quickViewContent.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-quick-add]");
    if (!addButton) return;

    const size = quickViewContent.querySelector("[data-quick-size]").value;
    const color = quickViewContent.querySelector("[data-quick-color]").value;
    addToCart(addButton.dataset.quickAdd, size, color);
    closeQuickView();
    openCart();
});

document.querySelectorAll(".faq-question").forEach((question) => {
    question.addEventListener("click", () => {
        const item = question.closest(".faq-item");
        const isOpen = item.classList.toggle("is-open");
        question.setAttribute("aria-expanded", String(isOpen));
    });
});

document.querySelector("#customForm").addEventListener("submit", (event) => {
    event.preventDefault();
    event.currentTarget.reset();
    showToast("Custom quote request saved for the mockup.");
});

document.querySelector("#newsletterForm").addEventListener("submit", (event) => {
    event.preventDefault();
    event.currentTarget.reset();
    showToast("You are on the Drip Dye drop list.");
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeCart();
        closeQuickView();
        document.body.classList.remove("nav-open");
    }
});

renderProducts();
renderCart();
refreshIcons();
