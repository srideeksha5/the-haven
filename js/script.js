
$(document).ready(function () {

    // ------------------------------------
    // STATE
    // ------------------------------------

    let products = [];
    let selectedCategory = "All";
    let searchTerm = "";
    let wishlist = new Set();

    let cart = JSON.parse(localStorage.getItem("havenCart") || "{}");

    const categoryNames = {
        "FuSOdbkaFT4pBSqMwN9Z": "Electronics",
        "t4t0vuswyxJzCQ5USW6V": "Fashion",
        "dUplxrmFCkseKylDFLEi": "Beauty",
        "Dw3CoxBe6cHYKkn8lUNk": "Home",
        "hHlPtk5sZ7raCsTs6PxO": "Sports",
        "rZeEv29cTveetVJTDP8y": "Books"
    };

    const currency = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
    });

    // ------------------------------------
    // HELPERS
    // ------------------------------------

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, function (char) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            }[char];
        });
    }

    function showToast(message) {
        $("#toast").text(message).addClass("show");

        clearTimeout(window.toastTimer);

        window.toastTimer = setTimeout(function () {
            $("#toast").removeClass("show");
        }, 2200);
    }

    // Supports both Firestore REST documents and
    // already-converted product objects.
    function getFieldValue(fields, fieldName) {
    const field = fields?.[fieldName];

    if (field === undefined || field === null) {
        return "";
    }

    // Firestore REST API values
    if (typeof field === "object") {
        if (field.stringValue !== undefined) return field.stringValue;
        if (field.integerValue !== undefined) return Number(field.integerValue);
        if (field.doubleValue !== undefined) return Number(field.doubleValue);
        if (field.booleanValue !== undefined) return field.booleanValue;
        if (field.nullValue !== undefined) return null;
    }

    // Already-converted JavaScript values
    return field;
}

    function normalizeProduct(item) {
    const fields = item.fields || item;

    const id = item.name
        ? item.name.split("/").pop()
        : (item.id || item.productId || "");

    const categoryId =
        getFieldValue(fields, "categoryId") || item.categoryId || "";

    const title =
        getFieldValue(fields, "title") || item.title || item.name || "";

    const description =
        getFieldValue(fields, "description") || item.description || "";

    const rawPrice = getFieldValue(fields, "price");
    const rawQty = getFieldValue(fields, "qty");

    const price = Number(rawPrice);
    const qty = Number(rawQty);

    const imageUrl =
        getFieldValue(fields, "imageUrl") ||
        item.imageUrl ||
        item.image ||
        "";

    const activeValue = getFieldValue(fields, "active");

    return {
        id: String(id),
        name: title,
        title: title,
        description: description,
        categoryId: categoryId,
        category: categoryNames[categoryId] || "Other",
        price: Number.isFinite(price) ? price : 0,
        qty: Number.isFinite(qty) ? qty : 0,
        image: imageUrl,
        imageUrl: imageUrl,
        active: activeValue !== false
    };
}
    // ------------------------------------
    // LOAD PRODUCTS FROM FIRESTORE
    // ------------------------------------

    async function loadProducts() {

        $("#productGrid").html(
            '<p class="loading-message">Loading our collection...</p>'
        );

        try {

            const response = await getProducts(100);
            console.log("PRODUCT API RESPONSE:", response);

const book = (response.documents || response.data?.documents || response)
    .find(item => {
        const fields = item.fields || item.document?.fields || item;
        const title = fields.title?.stringValue || fields.title;
        return title === "The Psychology of Success";
    });

console.log("BOOK RAW DATA:", book);
console.log("BOOK PRICE FIELD:", book?.fields?.price || book?.document?.fields?.price || book?.price);

            let documents = [];

            if (Array.isArray(response)) {
                documents = response;
            } else if (Array.isArray(response?.documents)) {
                documents = response.documents;
            } else if (Array.isArray(response?.data?.documents)) {
                documents = response.data.documents;
            } else if (Array.isArray(response?.data)) {
                documents = response.data;
            }

            products = documents
                .map(normalizeProduct)
                .filter(function (product) {
                    return product.id &&
                        product.name &&
                        product.active &&
                        product.qty > 0;
                });

            renderProducts();

            if (products.length === 0) {
                $("#emptyMessage")
                    .text("No active products are available right now.")
                    .prop("hidden", false);
            }

        } catch (error) {

            console.error("Product loading error:", error);

            $("#productGrid").empty();

            $("#emptyMessage")
                .text("Unable to load products. Please refresh the page.")
                .prop("hidden", false);

            showToast("Unable to connect to the product collection.");
        }
    }

    // ------------------------------------
    // RENDER PRODUCTS
    // ------------------------------------

    function renderProducts() {

        let filteredProducts = products.filter(function (product) {

            const matchesCategory =
                selectedCategory === "All" ||
                product.category === selectedCategory;

            const matchesSearch =
                product.name.toLowerCase().includes(searchTerm) ||
                product.category.toLowerCase().includes(searchTerm) ||
                product.description.toLowerCase().includes(searchTerm);

            return matchesCategory && matchesSearch;
        });

        const sortValue = $("#sortSelect").val();

        if (sortValue === "low") {
            filteredProducts.sort((a, b) => a.price - b.price);
        } else if (sortValue === "high") {
            filteredProducts.sort((a, b) => b.price - a.price);
        }

        $("#productGrid").empty();

        if (filteredProducts.length === 0) {
            $("#emptyMessage")
                .text("No products found. Try another search.")
                .prop("hidden", false);
            return;
        }

        $("#emptyMessage").prop("hidden", true);

        filteredProducts.forEach(function (product) {

            const isWishlisted = wishlist.has(product.id);

            const card = `
                <article class="product-card">

                    <div class="product-image-wrap">

                        <img
                            class="product-image"
                            src="${escapeHtml(product.image)}"
                            alt="${escapeHtml(product.name)}"
                            loading="lazy"
                        >

                        <button
                            class="wishlist-toggle ${isWishlisted ? "selected" : ""}"
                            data-id="${escapeHtml(product.id)}"
                            aria-label="Toggle wishlist"
                        >${isWishlisted ? "♥" : "♡"}</button>

                    </div>

                    <div class="product-info">

                        <span class="product-category">
                            ${escapeHtml(product.category)}
                        </span>

                        <h3 class="product-name">
                            ${escapeHtml(product.name)}
                        </h3>

                        <div class="product-price">
                            ${currency.format(product.price)}
                        </div>

                        <button
                            class="add-to-cart"
                            data-id="${escapeHtml(product.id)}"
                            ${product.qty <= 0 ? "disabled" : ""}
                        >
                            ADD TO BAG +
                        </button>

                    </div>

                </article>
            `;

            $("#productGrid").append(card);
        });
    }

    // ------------------------------------
    // CATEGORY FILTER
    // ------------------------------------

    function setCategory(category) {

        selectedCategory = category;

        $(".filter-button").removeClass("active");

        $('.filter-button[data-category="' + category + '"]')
            .addClass("active");

        renderProducts();

        document.getElementById("products").scrollIntoView({
            behavior: "smooth"
        });
    }

    $(document).on("click", ".filter-button", function () {
        setCategory($(this).data("category"));
    });

    $(".category-card").on("click", function () {
        setCategory($(this).data("category"));
    });

    // ------------------------------------
    // SEARCH
    // ------------------------------------

    function performSearch() {

        searchTerm = $("#searchInput").val().trim().toLowerCase();

        selectedCategory = "All";

        $(".filter-button").removeClass("active");

        $('.filter-button[data-category="All"]').addClass("active");

        renderProducts();

        document.getElementById("products").scrollIntoView({
            behavior: "smooth"
        });
    }

    $(".search-toggle").on("click", function () {

        $("#searchSection").toggleClass("open");

        if ($("#searchSection").hasClass("open")) {
            $("#searchInput").trigger("focus");
        }
    });

    $("#searchButton").on("click", performSearch);

    $("#searchInput").on("keydown", function (event) {
        if (event.key === "Enter") {
            performSearch();
        }
    });

    // ------------------------------------
    // SORTING
    // ------------------------------------

    $("#sortSelect").on("change", renderProducts);

    // ------------------------------------
    // WISHLIST
    // ------------------------------------

    function updateWishlistCount() {
        $("#wishlistCount").text(wishlist.size);
    }

    $(document).on("click", ".wishlist-toggle", function () {

        const productId = String($(this).data("id"));

        if (wishlist.has(productId)) {
            wishlist.delete(productId);
            showToast("Removed from your wishlist.");
        } else {
            wishlist.add(productId);
            showToast("Added to your wishlist ♡");
        }

        updateWishlistCount();
        renderProducts();
    });

    $("#wishlistButton").on("click", function () {

        if (wishlist.size === 0) {
            showToast("Your wishlist is empty.");
            return;
        }

        selectedCategory = "All";
        searchTerm = "";

        $("#searchInput").val("");
        $("#sortSelect").val("default");

        $(".filter-button").removeClass("active");

        $('.filter-button[data-category="All"]').addClass("active");

        const savedProducts = products.filter(function (product) {
            return wishlist.has(product.id);
        });

        $("#productGrid").empty();

        savedProducts.forEach(function (product) {

            const card = `
                <article class="product-card">

                    <div class="product-image-wrap">

                        <img
                            class="product-image"
                            src="${escapeHtml(product.image)}"
                            alt="${escapeHtml(product.name)}"
                        >

                        <button
                            class="wishlist-toggle selected"
                            data-id="${escapeHtml(product.id)}"
                        >♥</button>

                    </div>

                    <div class="product-info">

                        <span class="product-category">
                            ${escapeHtml(product.category)}
                        </span>

                        <h3 class="product-name">
                            ${escapeHtml(product.name)}
                        </h3>

                        <div class="product-price">
                            ${currency.format(product.price)}
                        </div>

                        <button
                            class="add-to-cart"
                            data-id="${escapeHtml(product.id)}"
                        >
                            ADD TO BAG +
                        </button>

                    </div>

                </article>
            `;

            $("#productGrid").append(card);
        });

        $("#emptyMessage").prop("hidden", true);

        $("#products .section-heading h2").text("Your wishlist");

        document.getElementById("products").scrollIntoView({
            behavior: "smooth"
        });
    });
    // ------------------------------------
// HEADER CART COUNT
// ------------------------------------

async function updateHeaderCartCount() {

    const isLoggedIn =
        sessionStorage.getItem("havenCustomerLoggedIn") === "true";

    if (!isLoggedIn) {
        const guestCart = JSON.parse(
            localStorage.getItem("havenCart") || "{}"
        );

        const count = Object.values(guestCart).reduce(
            (total, item) => total + Number(item.quantity || 0),
            0
        );

        $("#cartCount").text(count);
        return;
    }

    try {
        const documents = await getAllCartItems();

        const count = documents.reduce(function (total, document) {
            return total + Number(
                document.fields?.quantity?.integerValue || 0
            );
        }, 0);

        $("#cartCount").text(count);

    } catch (error) {
        console.error("Header cart count error:", error);
    }
}

    // ------------------------------------
    // CART
    // ------------------------------------

    function updateCart() {

        localStorage.setItem("havenCart", JSON.stringify(cart));

        const cartProducts = Object.values(cart);

        const totalQuantity = cartProducts.reduce(function (total, item) {
            return total + item.quantity;
        }, 0);

        const subtotal = cartProducts.reduce(function (total, item) {
            return total + item.price * item.quantity;
        }, 0);

        updateHeaderCartCount();
        $("#cartSubtotal").text(currency.format(subtotal));

        if (cartProducts.length === 0) {

            $("#cartItems").html(
                '<p class="cart-empty">Your bag is waiting for something lovely.</p>'
            );

            return;
        }

        $("#cartItems").empty();

        cartProducts.forEach(function (item) {

            const cartItem = `
                <div class="cart-item">

                    <img
                        src="${escapeHtml(item.image)}"
                        alt="${escapeHtml(item.name)}"
                    >

                    <div>

                        <h4>${escapeHtml(item.name)}</h4>

                        <p>${currency.format(item.price)}</p>

                        <div class="quantity-controls">

                            <button
                                class="decrease-quantity"
                                data-id="${escapeHtml(item.id)}"
                            >−</button>

                            <span>${item.quantity}</span>

                            <button
                                class="increase-quantity"
                                data-id="${escapeHtml(item.id)}"
                            >+</button>

                        </div>

                    </div>

                    <button
                        class="remove-item"
                        data-id="${escapeHtml(item.id)}"
                    >Remove</button>

                </div>
            `;

            $("#cartItems").append(cartItem);
        });
    }

    $(document).on("click", ".add-to-cart", async function () {

    const productId = String($(this).data("id"));

    const product = products.find(function (item) {
        return item.id === productId;
    });

    if (!product) {
        showToast("Product could not be found.");
        return;
    }

    if (product.qty <= 0) {
        showToast("This product is out of stock.");
        return;
    }

    const isLoggedIn =
        sessionStorage.getItem("havenCustomerLoggedIn") === "true";

    try {

        if (isLoggedIn) {

            await addToCart(productId, 1);

            await updateHeaderCartCount();

        } else {

            if (cart[productId]) {

                if (cart[productId].quantity >= product.qty) {
                    showToast("Available stock limit reached.");
                    return;
                }

                cart[productId].quantity++;

            } else {

                cart[productId] = {
                    ...product,
                    quantity: 1
                };
            }

            updateCart();
        }

        showToast(product.name + " added to your bag.");

    } catch (error) {

        console.error("Add to cart error:", error);

        showToast("Unable to add product. Please try again.");
    }
});
    $(document).on("click", ".increase-quantity", function () {

        const id = String($(this).data("id"));

        if (cart[id]) {

            const product = products.find(item => item.id === id);

            if (product && cart[id].quantity >= product.qty) {
                showToast("Available stock limit reached.");
                return;
            }

            cart[id].quantity++;
            updateCart();
        }
    });

    $(document).on("click", ".decrease-quantity", function () {

        const id = String($(this).data("id"));

        if (cart[id]) {

            cart[id].quantity--;

            if (cart[id].quantity <= 0) {
                delete cart[id];
            }

            updateCart();
        }
    });

    $(document).on("click", ".remove-item", function () {

        const id = String($(this).data("id"));

        delete cart[id];

        updateCart();

        showToast("Item removed from your bag.");
    });

    // ------------------------------------
    // CART DRAWER
    // ------------------------------------

    function openCart() {
        $("#cartDrawer").addClass("open");
        $("#drawerOverlay").addClass("open");
        $("body").css("overflow", "hidden");
    }

    function closeCart() {
        $("#cartDrawer").removeClass("open");
        $("#drawerOverlay").removeClass("open");
        $("body").css("overflow", "");
    }

    $("#cartButton").on("click", openCart);

    $("#closeCart, #drawerOverlay").on("click", closeCart);

    // ------------------------------------
    // MOBILE MENU
    // ------------------------------------

    $("#mobileMenuButton").on("click", function () {
        $("#mobileNav").toggleClass("open");
    });

    $("#mobileNav a").on("click", function () {
        $("#mobileNav").removeClass("open");
    });

    // ------------------------------------
    // VIEW ALL PRODUCTS
    // ------------------------------------

    $("#viewAllProducts").on("click", function () {

        selectedCategory = "All";
        searchTerm = "";

        $("#searchInput").val("");
        $("#sortSelect").val("default");

        $("#products .section-heading h2").text("Our best picks");

        $(".filter-button").removeClass("active");

        $('.filter-button[data-category="All"]').addClass("active");

        renderProducts();
    });

    // ------------------------------------
    // PRODUCT DETAILS
    // ------------------------------------

    $(document).on("click", ".product-image, .product-name", function () {

        const productCard = $(this).closest(".product-card");

        const productId = String(
            productCard.find(".add-to-cart").data("id")
        );

        const product = products.find(item => item.id === productId);

        if (!product) {
            showToast("Product details are unavailable.");
            return;
        }

        sessionStorage.setItem(
            "selectedProduct",
            JSON.stringify(product)
        );

        window.location.href = "product.html";
    });

    // ------------------------------------
    // CHECKOUT
    // ------------------------------------

    $("#checkoutButton").on("click", function () {

        if (Object.keys(cart).length === 0) {
            showToast("Your shopping bag is empty.");
            return;
        }

        window.location.href = "cart.html";
    });

    // ------------------------------------
    // NEWSLETTER
    // ------------------------------------

    $("#newsletterForm").on("submit", function (event) {

        event.preventDefault();

        const email = $("#newsletterEmail").val().trim();

        if (!email) {
            showToast("Please enter your email address.");
            return;
        }

        $("#newsletterMessage").text(
            "Thank you for subscribing! ♡"
        );

        $("#newsletterEmail").val("");
    });

    // ------------------------------------
    // INITIALIZE
    // ------------------------------------

    updateCart();
    updateHeaderCartCount();
    updateWishlistCount();
    loadProducts();

});
