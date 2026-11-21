
$(document).ready(function () {

    // ------------------------------------
    // CUSTOMER LOGIN CHECK
    // ------------------------------------

    if (sessionStorage.getItem("havenCustomerLoggedIn") !== "true") {
        sessionStorage.setItem("havenReturnTo", "checkout.html");
        window.location.replace("auth.html");
        return;
    }

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

    let checkoutItems = [];
    let isBuyNow = false;
    let isSubmitting = false;
    let savedAddresses = [];

    // ------------------------------------
    // FIRESTORE RESPONSE HELPERS
    // ------------------------------------

    function unwrapResponse(response) {
        let result = response;

        while (result && result.data !== undefined) {
            result = result.data;
        }

        return result;
    }

    function readField(document, fieldName, type, fallback = null) {
        const value = document?.fields?.[fieldName]?.[type];

        if (value === undefined || value === null) {
            return fallback;
        }

        if (type === "integerValue" || type === "doubleValue") {
            return Number(value);
        }

        return value;
    }

    function getDocumentId(document) {
        if (!document?.name) {
            return null;
        }

        return document.name.split("/").pop();
    }

    function normalizeProduct(document, productId, quantity) {
        return {
            productId: productId,
            title: readField(document, "title", "stringValue", ""),
            categoryId: readField(document, "categoryId", "stringValue", ""),
            price: readField(document, "price", "doubleValue", 0),
            qty: readField(document, "qty", "integerValue", 0),
            imageUrl: readField(document, "imageUrl", "stringValue", ""),
            active: readField(document, "active", "booleanValue", false),
            quantity: Number(quantity)
        };
    }

    // ------------------------------------
    // BUY NOW ITEMS
    // ------------------------------------

    function getBuyNowItems() {
        try {
            const saved = JSON.parse(
                sessionStorage.getItem("havenBuyNow") || "[]"
            );

            return Array.isArray(saved) ? saved : [];

        } catch (error) {
            return [];
        }
    }

    // ------------------------------------
    // LOAD BUY NOW ITEMS
    // ------------------------------------

    async function loadBuyNowItems(savedItems) {
        const verifiedItems = await Promise.all(
            savedItems.map(async function (item) {

                const productId = String(
                    item.productId || item.id || ""
                );

                const quantity = Number(item.quantity);

                if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
                    throw new Error("Invalid Buy Now product details.");
                }

                const document = unwrapResponse(
                    await getProductById(productId)
                );

                const product = normalizeProduct(
                    document,
                    productId,
                    quantity
                );

                if (!product.active) {
                    throw new Error(
                        product.title + " is currently unavailable."
                    );
                }

                if (product.qty < quantity) {
                    throw new Error(
                        "Insufficient stock for " + product.title + "."
                    );
                }

                return product;
            })
        );

        return verifiedItems;
    }

    // ------------------------------------
    // MIGRATE GUEST CART TO FIRESTORE
    // ------------------------------------

    async function migrateGuestCart() {
        let localCart = {};

        try {
            localCart = JSON.parse(
                localStorage.getItem("havenCart") || "{}"
            );
        } catch (error) {
            throw new Error("Your guest cart could not be read.");
        }

        if (
            !localCart ||
            typeof localCart !== "object" ||
            Array.isArray(localCart)
        ) {
            return;
        }

        const localEntries = Object.entries(localCart);

        if (localEntries.length === 0) {
            return;
        }

        for (const [cartKey, item] of localEntries) {
            const productId = String(
                item?.id || item?.productId || cartKey
            );

            const quantity = Number(item?.quantity);

            if (
                !productId ||
                !Number.isInteger(quantity) ||
                quantity <= 0
            ) {
                throw new Error(
                    "An item in your guest cart has invalid details."
                );
            }

            await addToCart(productId, quantity);

            delete localCart[cartKey];

            if (Object.keys(localCart).length > 0) {
                localStorage.setItem(
                    "havenCart",
                    JSON.stringify(localCart)
                );
            } else {
                localStorage.removeItem("havenCart");
            }
        }
    }

    // ------------------------------------
    // LOAD FIRESTORE CART
    // ------------------------------------

    async function loadFirestoreCart() {
        const response = unwrapResponse(
            await getAllCartItems()
        );

        let documents = [];

        if (Array.isArray(response)) {
            documents = response;
        } else if (Array.isArray(response?.documents)) {
            documents = response.documents;
        }

        const items = [];

        for (const document of documents) {
            const productId = readField(
                document,
                "productId",
                "stringValue",
                getDocumentId(document)
            );

            const quantity = readField(
                document,
                "quantity",
                "integerValue",
                0
            );

            if (!productId || quantity <= 0) {
                continue;
            }

            try {
                const productDocument = unwrapResponse(
                    await getProductById(productId)
                );

                const product = normalizeProduct(
                    productDocument,
                    productId,
                    quantity
                );

                if (product.active) {
                    items.push(product);
                }

            } catch (error) {
                if (error.response?.status === 404) {
                    console.warn(
                        "Cart item references a missing product:",
                        productId
                    );
                    continue;
                }

                throw error;
            }
        }

        return items;
    }

    // ------------------------------------
    // LOAD CHECKOUT ITEMS
    // ------------------------------------

    async function loadCheckoutItems() {
        const buyNowItems = getBuyNowItems();

        const localCart = JSON.parse(
            localStorage.getItem("havenCart") || "{}"
        );

        const hasGuestCart =
            localCart &&
            typeof localCart === "object" &&
            !Array.isArray(localCart) &&
            Object.keys(localCart).length > 0;

        if (hasGuestCart) {
            await migrateGuestCart();
        }

        isBuyNow = buyNowItems.length > 0 && !hasGuestCart;

        if (isBuyNow) {
            checkoutItems = await loadBuyNowItems(buyNowItems);
            $("#checkoutTitle").text("Buy Now Checkout");
        } else {
            checkoutItems = await loadFirestoreCart();
            $("#checkoutTitle").text("Order Summary");
        }

        renderSummary();
    }

    // ------------------------------------
    // TOTAL CALCULATIONS
    // ------------------------------------

    function getSubtotal() {
        return checkoutItems.reduce(function (total, item) {
            return total + Number(item.price) * Number(item.quantity);
        }, 0);
    }

    function getDelivery() {
        if (
            checkoutItems.length === 0 ||
            getSubtotal() >= FREE_DELIVERY_LIMIT
        ) {
            return 0;
        }

        return DELIVERY_CHARGE;
    }

    function getTotal() {
        return getSubtotal() + getDelivery();
    }

    // ------------------------------------
    // HTML SAFETY
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

    // ------------------------------------
    // SAVED ADDRESS MANAGEMENT
    // ------------------------------------

    async function loadSavedAddresses() {
        const select = $("#savedAddressSelect");

        select.empty();

        select.append(
            $("<option>", {
                value: "manual",
                text: "Enter a new address"
            })
        );

        try {
            const response = await getSavedAddresses();

            savedAddresses = Array.isArray(response)
                ? response
                : [];

            if (savedAddresses.length === 0) {
                $("#savedAddressFeedback").text(
                    "You have no saved addresses. Enter a new delivery address below."
                );

                return;
            }

            savedAddresses.forEach(function (address) {
                const addressLabel = [
                    address.name,
                    address.address,
                    address.city
                ].filter(Boolean).join(" — ");

                const optionText = addressLabel +
                    (address.isDefault ? " (Default)" : "");

                select.append(
                    $("<option>", {
                        value: address.id,
                        text: optionText
                    })
                );
            });

            $("#savedAddressFeedback").text(
                savedAddresses.length +
                " saved address(es) available."
            );

            const defaultAddress = savedAddresses.find(function (address) {
                return address.isDefault === true;
            });

            if (defaultAddress) {
                select.val(defaultAddress.id);
                fillAddressFields(defaultAddress);
            }

        } catch (error) {
            console.error("Saved address loading error:", error);

            savedAddresses = [];

            $("#savedAddressFeedback").text(
                "Saved addresses could not be loaded. You can enter a new address below."
            );
        }
    }

    // ------------------------------------
    // FILL DELIVERY ADDRESS FIELDS
    // ------------------------------------

    function fillAddressFields(address) {
        if (!address) {
            return;
        }

        $("#customerName").val(address.name || "");
        $("#customerMobile").val(address.mobile || "");

        $("#address").val(address.address || "");
        $("#city").val(address.city || "");
        $("#state").val(address.state || "");
        $("#pincode").val(address.pincode || "");

        clearErrors();
    }

    // ------------------------------------
    // SAVED ADDRESS SELECTION
    // ------------------------------------

    $("#savedAddressSelect").on("change", function () {
        const selectedId = $(this).val();

        if (selectedId === "manual") {
            $("#customerName").val("");
            $("#customerMobile").val("");

            $("#address").val("");
            $("#city").val("");
            $("#state").val("");
            $("#pincode").val("");

            clearErrors();

            return;
        }

        const selectedAddress = savedAddresses.find(function (address) {
            return address.id === selectedId;
        });

        if (selectedAddress) {
            fillAddressFields(selectedAddress);

            $("#savedAddressFeedback").text(
                "Saved address selected successfully."
            );
        }
    });

    // ------------------------------------
    // RENDER ORDER SUMMARY
    // ------------------------------------

    function renderSummary() {
        $("#checkoutItems").empty();

        if (checkoutItems.length === 0) {
            $("#checkoutItems").html(
                '<p class="checkout-empty">Your shopping bag is empty.</p>'
            );

            $("#checkoutSubtotal, #checkoutGrandTotal").text(
                currency.format(0)
            );

            $("#checkoutDelivery").text(currency.format(0));

            $("#placeOrderButton").prop("disabled", true);

            return;
        }

        $("#placeOrderButton").prop("disabled", false);

        checkoutItems.forEach(function (item) {
            const itemElement = `
                <div class="checkout-item">
                    <img
                        src="${escapeHtml(item.imageUrl)}"
                        alt="${escapeHtml(item.title)}"
                    >

                    <div>
                        <h3>${escapeHtml(item.title)}</h3>

                        <div class="checkout-quantity-control">
                            <span>Quantity:</span>

                            <button
                                type="button"
                                class="checkout-qty-btn decrease-checkout-qty"
                                data-id="${escapeHtml(item.productId)}">
                                −
                            </button>

                            <span class="checkout-qty-value">
                                ${Number(item.quantity)}
                            </span>

                            <button
                                type="button"
                                class="checkout-qty-btn increase-checkout-qty"
                                data-id="${escapeHtml(item.productId)}">
                                +
                            </button>
                        </div>
                    </div>

                    <strong class="checkout-item-price">
                        ${currency.format(
                            Number(item.price) * Number(item.quantity)
                        )}
                    </strong>
                </div>
            `;

            $("#checkoutItems").append(itemElement);
        });

        const subtotal = getSubtotal();
        const delivery = getDelivery();

        $("#checkoutSubtotal").text(currency.format(subtotal));

        $("#checkoutDelivery").text(
            delivery === 0 ? "FREE" : currency.format(delivery)
        );

        $("#checkoutGrandTotal").text(
            currency.format(subtotal + delivery)
        );
    }

    // ------------------------------------
    // CHECKOUT QUANTITY CONTROLS
    // ------------------------------------

    async function changeCheckoutQuantity(productId, change) {
        const item = checkoutItems.find(function (product) {
            return String(product.productId) === String(productId);
        });

        if (!item) {
            return;
        }

        const newQuantity = Number(item.quantity) + change;

        try {
            // Remove product when minus is clicked at quantity 1.
            if (newQuantity < 1) {
                if (isBuyNow) {
                    const buyNowItems = getBuyNowItems();

                    const updatedItems = buyNowItems.filter(function (savedItem) {
                        const id = String(
                            savedItem.productId || savedItem.id
                        );

                        return id !== String(productId);
                    });

                    sessionStorage.setItem(
                        "havenBuyNow",
                        JSON.stringify(updatedItems)
                    );

                } else {
                    await removeFromCart(productId);
                }

                checkoutItems = checkoutItems.filter(function (product) {
                    return String(product.productId) !== String(productId);
                });

                renderSummary();

                return;
            }

            if (newQuantity > Number(item.qty)) {
                alert("Available stock limit reached.");
                return;
            }

            if (isBuyNow) {
                const buyNowItems = getBuyNowItems();

                const updatedItems = buyNowItems.map(function (savedItem) {
                    const id = String(
                        savedItem.productId || savedItem.id
                    );

                    return id === String(productId)
                        ? { ...savedItem, quantity: newQuantity }
                        : savedItem;
                });

                sessionStorage.setItem(
                    "havenBuyNow",
                    JSON.stringify(updatedItems)
                );

            } else {
                await updateCartQuantity(productId, newQuantity);
            }

            item.quantity = newQuantity;

            renderSummary();

        } catch (error) {
            console.error("Checkout quantity update failed:", error);
            alert("Unable to update quantity. Please try again.");
        }
    }

    // ------------------------------------
    // CHECKOUT QUANTITY BUTTON EVENTS
    // ------------------------------------

    $("#checkoutItems")
        .off("click", ".decrease-checkout-qty")
        .on("click", ".decrease-checkout-qty", function (event) {
            event.preventDefault();
            event.stopPropagation();

            const productId = String(
                $(this).attr("data-id") || ""
            );

            changeCheckoutQuantity(productId, -1);
        });

    $("#checkoutItems")
        .off("click", ".increase-checkout-qty")
        .on("click", ".increase-checkout-qty", function (event) {
            event.preventDefault();
            event.stopPropagation();

            const productId = String(
                $(this).attr("data-id") || ""
            );

            changeCheckoutQuantity(productId, 1);
        });

    // ------------------------------------
    // FORM ERRORS
    // ------------------------------------

    function showError(field, message) {
        $("#" + field).addClass("invalid");
        $("#" + field + "Error").text(message);
    }

    function clearErrors() {
        $(".form-field input, .form-field textarea").removeClass("invalid");
        $(".field-error").text("");
    }

    // ------------------------------------
    // FORM VALIDATION
    // ------------------------------------

    function validateForm() {
        clearErrors();

        let isValid = true;

        const name = $("#customerName").val().trim();
        const email = $("#customerEmail").val().trim();
        const mobile = $("#customerMobile").val().trim();
        const address = $("#address").val().trim();
        const city = $("#city").val().trim();
        const state = $("#state").val().trim();
        const pincode = $("#pincode").val().trim();

        if (!/^[A-Za-z][A-Za-z .'-]{1,79}$/.test(name)) {
            showError("customerName", "Enter a valid full name.");
            isValid = false;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showError("customerEmail", "Enter a valid email address.");
            isValid = false;
        }

        if (!/^[6-9]\d{9}$/.test(mobile)) {
            showError(
                "customerMobile",
                "Enter a valid 10-digit Indian mobile number."
            );

            isValid = false;
        }

        if (address.length < 5) {
            showError("address", "Enter your complete delivery address.");
            isValid = false;
        }

        if (!/^[A-Za-z][A-Za-z .'-]{1,59}$/.test(city)) {
            showError("city", "Enter a valid city.");
            isValid = false;
        }

        if (!/^[A-Za-z][A-Za-z .'-]{1,59}$/.test(state)) {
            showError("state", "Enter a valid state.");
            isValid = false;
        }

        if (!/^[1-9][0-9]{5}$/.test(pincode)) {
            showError("pincode", "Enter a valid 6-digit PIN code.");
            isValid = false;
        }

        return isValid;
    }

    $(".form-field input, .form-field textarea").on("input", function () {
        $(this).removeClass("invalid");
        $("#" + this.id + "Error").text("");
    });

    // ------------------------------------
    // PAYMENT METHOD
    // ------------------------------------

    $('input[name="paymentMethod"]').on("change", async function () {
        const method = $(this).val();

        if (method === "cod") {
            $("#paymentNote").text(
                "You can pay in cash when your order is delivered."
            );

        } else {
            try {
                const info = await getCustomerCreditInfo();

                $("#paymentNote").text(
                    "Available credit: " +
                    currency.format(info.availableCredit) +
                    ". Your credit eligibility will be checked before ordering."
                );

            } catch (error) {
                $("#paymentNote").text(
                    "Your available credit could not be retrieved. Please try again."
                );
            }
        }
    });

    // ------------------------------------
    // ORDER SIGNATURE
    // Used to resume payment-record creation
    // if an order was created but payment
    // record creation failed.
    // ------------------------------------

    function getCheckoutSignature(address, method) {
        return JSON.stringify({
            items: checkoutItems.map(function (item) {
                return {
                    productId: item.productId,
                    quantity: item.quantity
                };
            }),

            address: address,
            method: method,
            total: getTotal(),
            buyNow: isBuyNow
        });
    }

    // ------------------------------------
    // CREATE ORDER AND PAYMENT
    // ------------------------------------

    async function submitOrder() {
        const items = checkoutItems;

        if (items.length === 0) {
            throw new Error("Your shopping bag is empty.");
        }

        const paymentSelection = $(
            'input[name="paymentMethod"]:checked'
        ).val();

        if (!paymentSelection) {
            throw new Error("Please select a payment method.");
        }

        const paymentMethod =
            paymentSelection === "cod" ? "CASH" : "CREDIT";

        const address = {
            name: $("#customerName").val().trim(),
            mobile: $("#customerMobile").val().trim(),
            address: $("#address").val().trim(),
            city: $("#city").val().trim(),
            state: $("#state").val().trim(),
            pincode: $("#pincode").val().trim()
        };

        const total = getTotal();

        // Check available credit before creating a credit order.
        if (paymentMethod === "CREDIT") {
            const creditInfo = await checkCreditEligibility(total);

            if (!creditInfo.eligibleForReview) {
                throw new Error(
                    "Insufficient available credit. Available: " +
                    currency.format(creditInfo.availableCredit) +
                    ". Required: " +
                    currency.format(total)
                );
            }
        }

        const signature = getCheckoutSignature(address, paymentMethod);

        let pendingOrder = null;

        try {
            pendingOrder = JSON.parse(
                sessionStorage.getItem("havenPendingCheckout") || "null"
            );

        } catch (error) {
            pendingOrder = null;
        }

        let orderId;

        // Reuse the order if its creation succeeded earlier
        // but payment-record creation failed.
        if (
            pendingOrder &&
            pendingOrder.signature === signature &&
            pendingOrder.orderId
        ) {
            orderId = pendingOrder.orderId;

        } else {
            const orderItems = items.map(function (item) {
                return {
                    productId: item.productId,
                    quantity: Number(item.quantity)
                };
            });

            const orderResponse = unwrapResponse(
                await createOrder(
                    orderItems,
                    address,
                    paymentMethod
                )
            );

            orderId = getDocumentId(orderResponse);

            if (!orderId) {
                throw new Error(
                    "The order response did not contain a valid order ID."
                );
            }

            // Save pending order details so the user does not
            // accidentally create another order on a retry.
            sessionStorage.setItem(
                "havenPendingCheckout",
                JSON.stringify({
                    orderId: orderId,
                    signature: signature
                })
            );
        }

        // Create the corresponding Firestore payment record.
        await createPaymentRecord(
            orderId,
            total,
            paymentMethod
        );

        // Clear only after both order and payment creation succeed.
        if (isBuyNow) {
            sessionStorage.removeItem("havenBuyNow");

        } else {
            await clearCart();
            localStorage.removeItem("havenCart");
        }

        sessionStorage.removeItem("havenPendingCheckout");

        showOrderConfirmation(
            orderId,
            address,
            paymentMethod,
            total
        );
    }

    // ------------------------------------
    // ORDER CONFIRMATION
    // ------------------------------------

    function showOrderConfirmation(
        orderId,
        address,
        paymentMethod,
        total
    ) {
        const customerName = $("#customerName").val().trim();

        $(".checkout-page").html(`
            <section class="order-success">

                <div class="success-icon">✓</div>

                <span class="eyebrow">
                    THANK YOU FOR SHOPPING WITH US
                </span>

                <h1>Your order is placed!</h1>

                <p>
                    Thank you, ${escapeHtml(customerName)}.
                    Your order has been saved successfully.
                </p>

                <div class="success-order-card">

                    <span>ORDER REFERENCE</span>
                    <strong>${escapeHtml(orderId)}</strong>

                    <div class="success-divider"></div>

                    <div>
                        <span>ORDER TYPE</span>
                        <strong>
                            ${isBuyNow ? "Buy Now" : "Shopping Cart"}
                        </strong>
                    </div>

                    <div>
                        <span>ORDER TOTAL</span>
                        <strong>${currency.format(total)}</strong>
                    </div>

                    <div>
                        <span>PAYMENT METHOD</span>
                        <strong>
                            ${paymentMethod === "CASH"
                                ? "Cash on Delivery"
                                : "Credit Payment - Pending Approval"}
                        </strong>
                    </div>

                    <div>
                        <span>DELIVERY ADDRESS</span>
                        <strong>
                            ${escapeHtml(address.address)},
                            ${escapeHtml(address.city)},
                            ${escapeHtml(address.state)} -
                            ${escapeHtml(address.pincode)}
                        </strong>
                    </div>

                </div>

                <a href="index.html" class="primary-button">
                    CONTINUE SHOPPING →
                </a>

            </section>
        `);

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }

    // ------------------------------------
    // SUBMIT ORDER
    // ------------------------------------

    $("#checkoutForm").on("submit", async function (event) {
        event.preventDefault();

        if (isSubmitting) {
            return;
        }

        if (checkoutItems.length === 0) {
            alert("Your shopping bag is empty. Please add products first.");
            return;
        }

        if (!validateForm()) {
            const firstInvalid = document.querySelector(
                ".form-field .invalid"
            );

            if (firstInvalid) {
                firstInvalid.focus();
            }

            return;
        }

        if (!$('input[name="paymentMethod"]:checked').val()) {
            alert("Please select a payment method.");
            return;
        }

        isSubmitting = true;

        const button = $("#placeOrderButton");
        const originalText = button.text();

        button.prop("disabled", true).text("Processing order...");

        try {
            await submitOrder();

        } catch (error) {
            console.error("Checkout error:", error);

            alert(
                error.message ||
                "Something went wrong while placing your order. Please try again."
            );

            button.prop("disabled", false).text(originalText);

        } finally {
            isSubmitting = false;
        }
    });

    // ------------------------------------
    // INITIALIZE CHECKOUT
    // ------------------------------------

    async function initializeCheckout() {
        $("#placeOrderButton").prop("disabled", true);

        try {
            // Load saved addresses first.
            await loadSavedAddresses();

            // Then load cart or Buy Now products.
            await loadCheckoutItems();

        } catch (error) {
            console.error("Checkout loading error:", error);

            $("#checkoutItems").html(
                '<p class="checkout-empty">Unable to load your checkout items. Please return to your shopping bag and try again.</p>'
            );

            $("#placeOrderButton").prop("disabled", true);

            alert(
                error.message ||
                "Unable to load checkout items."
            );
        }
    }

    initializeCheckout();

});
