
$(document).ready(function () {

    // ------------------------------------
    // CONFIGURATION
    // ------------------------------------

    const FREE_DELIVERY_LIMIT = 999;
    const DELIVERY_CHARGE = 60;

    const currency = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
    });

    const categoryNames = {
        "FuSOdbkaFT4pBSqMwN9Z": "Electronics",
        "t4t0vuswyxJzCQ5USW6V": "Fashion",
        "dUplxrmFCkseKylDFLEi": "Beauty",
        "Dw3CoxBe6cHYKkn8lUNk": "Home",
        "hHlPtk5sZ7raCsTs6PxO": "Sports",
        "rZeEv29cTveetVJTDP8y": "Books"
    };

    let cart = {};
    let isLoggedIn =
        sessionStorage.getItem("havenCustomerLoggedIn") === "true";

    let isLoading = false;

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

    function getField(fields, name) {

        const field = fields?.[name];

        if (!field) return "";

        if (field.stringValue !== undefined) return field.stringValue;
        if (field.integerValue !== undefined) return Number(field.integerValue);
        if (field.doubleValue !== undefined) return Number(field.doubleValue);
        if (field.booleanValue !== undefined) return field.booleanValue;

        return "";
    }

    function unwrapDocument(response) {
        return response?.data || response;
    }

    function showToast(message) {

        $("#toast").text(message).addClass("show");

        clearTimeout(window.cartToastTimer);

        window.cartToastTimer = setTimeout(function () {
            $("#toast").removeClass("show");
        }, 2200);
    }

    function getLocalCart() {

        try {
            return JSON.parse(localStorage.getItem("havenCart") || "{}");
        } catch (error) {
            return {};
        }
    }

    function saveLocalCart() {
        localStorage.setItem("havenCart", JSON.stringify(cart));
    }

    // ------------------------------------
    // PRODUCT DETAILS FROM FIRESTORE
    // ------------------------------------

    function normalizeProduct(document, productId) {

        const data = unwrapDocument(document);
        const fields = data.fields || data;

        const title =
            getField(fields, "title") || data.title || data.name || "Product";

        const image =
            getField(fields, "imageUrl") ||
            data.imageUrl ||
            data.image ||
            "";

        const categoryId =
            getField(fields, "categoryId") || data.categoryId || "";

        return {
            id: String(productId),
            name: title,
            category: categoryNames[categoryId] || "THE HAVEN COLLECTION",
            price: Number(
                getField(fields, "price") || data.price || 0
            ),
            image: image,
            qty: Number(
                getField(fields, "qty") || data.qty || 0
            ),
            active: fields.active?.booleanValue !== undefined
                ? fields.active.booleanValue
                : data.active !== false
        };
    }

    // ------------------------------------
    // LOAD FIRESTORE CART
    // ------------------------------------

    async function loadFirestoreCart() {

        const response = await getAllCartItems();

        let documents = unwrapDocument(response);

        if (Array.isArray(documents?.documents)) {
            documents = documents.documents;
        }

        if (!Array.isArray(documents)) {
            documents = [];
        }

        const updatedCart = {};

        for (const document of documents) {

            const fields = document.fields || document;

            const productId =
                getField(fields, "productId") ||
                document.name?.split("/").pop();

            const quantity = Number(
                getField(fields, "quantity") || document.quantity || 0
            );

            if (!productId || quantity <= 0) continue;

            try {

                const productResponse = await getProductById(productId);

                const product = normalizeProduct(
                    productResponse,
                    productId
                );

                if (!product.active) continue;

                updatedCart[productId] = {
                    ...product,
                    quantity: quantity
                };

            } catch (error) {

                console.warn(
                    "Could not retrieve product:",
                    productId,
                    error
                );
            }
        }

        cart = updatedCart;
    }

    // ------------------------------------
    // MIGRATE OLD LOCAL CART TO FIRESTORE
    // ------------------------------------

    async function migrateLocalCart() {

        const localCart = getLocalCart();
        const localItems = Object.values(localCart);

        if (localItems.length === 0) return;

        for (const item of localItems) {

            const productId = String(item.id);

            const quantity = Number(item.quantity);

            if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
                continue;
            }

            await addToCart(productId, quantity);
        }

        // Remove local copy only after successful migration.
        localStorage.removeItem("havenCart");
    }

    // ------------------------------------
    // TOTAL CALCULATIONS
    // ------------------------------------

    function getCartItems() {
        return Object.values(cart);
    }

    function getSubtotal() {

        return getCartItems().reduce(function (total, item) {
            return total + item.price * item.quantity;
        }, 0);
    }

    function getDelivery() {

        const items = getCartItems();

        if (
            items.length === 0 ||
            getSubtotal() >= FREE_DELIVERY_LIMIT
        ) {
            return 0;
        }

        return DELIVERY_CHARGE;
    }

    // ------------------------------------
    // RENDER CART
    // ------------------------------------

    function renderCart() {

        const items = getCartItems();

        const itemCount = items.reduce(function (total, item) {
            return total + item.quantity;
        }, 0);

        const subtotal = getSubtotal();
        const delivery = getDelivery();
        const grandTotal = subtotal + delivery;

        $("#cartItemCount").text(
            itemCount +
            (itemCount === 1 ? " item in your bag" : " items in your bag")
        );

        $("#subtotal").text(currency.format(subtotal));

        $("#deliveryCharge").text(
            delivery === 0 ? "FREE" : currency.format(delivery)
        );

        $("#grandTotal").text(currency.format(grandTotal));

        if (items.length === 0) {

            $("#cartProductList").empty();

            $("#emptyCart").prop("hidden", false);

            $(".cart-products-heading").hide();

            $("#deliveryMessage").text(
                "Add products to your bag to see delivery information."
            );

            return;
        }

        $("#emptyCart").prop("hidden", true);

        $(".cart-products-heading").show();

        $("#cartProductList").empty();

        if (delivery === 0) {

            $("#deliveryMessage").text(
                "Wonderful! Your order qualifies for free delivery."
            );

        } else {

            $("#deliveryMessage").text(
                "Add " +
                currency.format(FREE_DELIVERY_LIMIT - subtotal) +
                " more to unlock free delivery."
            );
        }

        items.forEach(function (item) {

            const itemTotal = item.price * item.quantity;

            const row = `
                <article class="cart-product-row">

                    <div class="cart-product-info">

                        <img
                            src="${escapeHtml(item.image)}"
                            alt="${escapeHtml(item.name)}"
                        >

                        <div>
                            <h3>${escapeHtml(item.name)}</h3>

                            <p>${escapeHtml(item.category)}</p>

                            <button
                                class="cart-remove"
                                data-id="${escapeHtml(item.id)}"
                            >
                                Remove item
                            </button>
                        </div>

                    </div>

                    <div class="cart-price">
                        ${currency.format(item.price)}
                    </div>

                    <div class="cart-quantity">

                        <button
                            class="decrease-item"
                            data-id="${escapeHtml(item.id)}"
                            aria-label="Decrease quantity"
                        >−</button>

                        <span>${item.quantity}</span>

                        <button
                            class="increase-item"
                            data-id="${escapeHtml(item.id)}"
                            aria-label="Increase quantity"
                        >+</button>

                    </div>

                    <div class="cart-total">
                        ${currency.format(itemTotal)}
                    </div>

                </article>
            `;

            $("#cartProductList").append(row);
        });
    }

    // ------------------------------------
    // UPDATE QUANTITY
    // ------------------------------------

    async function changeQuantity(id, difference) {

        if (isLoading || !cart[id]) return;

        const item = cart[id];

        const newQuantity = item.quantity + difference;

        if (newQuantity <= 0) {
            await deleteCartItem(id);
            return;
        }

        if (newQuantity > item.qty) {
            showToast("Available stock limit reached.");
            return;
        }

        try {

            if (isLoggedIn) {

                await updateCartQuantity(id, newQuantity);

            } else {

                item.quantity = newQuantity;
                saveLocalCart();
            }

            if (isLoggedIn) {
                item.quantity = newQuantity;
            }

            renderCart();

        } catch (error) {

            console.error("Cart quantity update failed:", error);

            showToast("Unable to update quantity. Please try again.");
        }
    }

    $(document).on("click", ".increase-item", function () {

        const id = String($(this).data("id"));

        changeQuantity(id, 1);
    });

    $(document).on("click", ".decrease-item", function () {

        const id = String($(this).data("id"));

        changeQuantity(id, -1);
    });

    // ------------------------------------
    // REMOVE CART ITEM
    // ------------------------------------

    async function deleteCartItem(id) {

        if (isLoading || !cart[id]) return;

        try {

            if (isLoggedIn) {

                await removeFromCart(id);

            } else {

                delete cart[id];
                saveLocalCart();
            }

            delete cart[id];

            renderCart();

            showToast("Item removed from your bag.");

        } catch (error) {

            console.error("Cart removal failed:", error);

            showToast("Unable to remove this item.");
        }
    }

    $(document).on("click", ".cart-remove", function () {

        const id = String($(this).data("id"));

        deleteCartItem(id);
    });

    // ------------------------------------
    // PROCEED TO CHECKOUT
    // ------------------------------------

    $("#proceedCheckout").on("click", function () {

        if (getCartItems().length === 0) {
            showToast("Your shopping bag is empty.");
            return;
        }

        if (isLoggedIn) {

            window.location.href = "checkout.html";

        } else {

            sessionStorage.setItem(
                "havenReturnTo",
                "checkout.html"
            );

            window.location.href = "auth.html";
        }
    });

    // ------------------------------------
    // INITIALIZE CART
    // ------------------------------------

    async function initializeCart() {

        if (isLoading) return;

        isLoading = true;

        $("#cartProductList").html(
            '<p class="cart-loading">Loading your shopping bag...</p>'
        );

        try {

            if (isLoggedIn) {

                // Transfer any existing guest cart first.
                await migrateLocalCart();

                // Retrieve the customer's Firestore cart.
                await loadFirestoreCart();

            } else {

                // Guest cart remains local until login.
                cart = getLocalCart();
            }

            renderCart();

        } catch (error) {

            console.error("Cart initialization failed:", error);

            $("#cartProductList").empty();

            showToast(
                "Unable to load your cart. Please refresh and try again."
            );

        } finally {

            isLoading = false;
        }
    }

    initializeCart();

});
