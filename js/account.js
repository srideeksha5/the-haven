
$(document).ready(function () {

    // =====================================
    // CUSTOMER SESSION VALIDATION
    // =====================================

    const isLoggedIn =
        sessionStorage.getItem("havenCustomerLoggedIn") === "true";

    const uid = sessionStorage.getItem("havenCustomerUID");
    const token = sessionStorage.getItem("havenCustomerToken");

    if (!isLoggedIn || !uid || !token) {
        window.location.replace("auth.html");
        return;
    }

    let savedAddresses = [];

    // =====================================
    // DISPLAY HELPERS
    // =====================================

    function formatCurrency(amount) {
        return Number(amount || 0).toLocaleString("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2
        });
    }

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

    function unwrapResponse(response) {
        let result = response;

        while (result && result.data !== undefined) {
            result = result.data;
        }

        return result;
    }

    function getDocumentId(document) {
        if (!document?.name) {
            return "";
        }

        return document.name.split("/").pop();
    }

    function readField(fields, fieldName, type, fallback = null) {
        const value = fields?.[fieldName]?.[type];

        if (value === undefined || value === null) {
            return fallback;
        }

        if (type === "integerValue" || type === "doubleValue") {
            return Number(value);
        }

        return value;
    }

    function formatOrderDate(timestamp) {
        if (!timestamp) {
            return "Date unavailable";
        }

        const date = new Date(timestamp);

        if (Number.isNaN(date.getTime())) {
            return "Date unavailable";
        }

        return date.toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function showFeedback(selector, message, isError = false) {
        $(selector)
            .text(message)
            .css("color", isError ? "#b54747" : "#456b52");
    }

    // =====================================
    // LOAD CUSTOMER PROFILE
    // =====================================

    async function loadCustomerProfile() {
        try {
            const response = unwrapResponse(
                await getCustomerProfile(uid, token)
            );

            const fields = response.fields || {};

            const name = readField(
                fields,
                "name",
                "stringValue",
                "Customer"
            );

            const email = readField(
                fields,
                "email",
                "stringValue",
                sessionStorage.getItem("havenCustomerEmail") ||
                "Not available"
            );

            const mobile = readField(
                fields,
                "mobile",
                "stringValue",
                "Not available"
            );

            const creditLimit = readField(
                fields,
                "creditLimit",
                "integerValue",
                readField(fields, "creditLimit", "doubleValue", 0)
            );

            const creditUsed = readField(
                fields,
                "creditUsed",
                "integerValue",
                readField(fields, "creditUsed", "doubleValue", 0)
            );

            const availableCredit = Math.max(
                0,
                creditLimit - creditUsed
            );

            const isActive = readField(
                fields,
                "active",
                "booleanValue",
                true
            );

            $("#customerName").text(name.split(" ")[0]);
            $("#customerFullName").text(name);
            $("#customerEmail").text(email);
            $("#customerMobile").text(mobile);

            $("#profileAvatar").text(
                name.charAt(0).toUpperCase()
            );

            $("#accountStatus")
                .text(isActive ? "ACTIVE ACCOUNT" : "INACTIVE ACCOUNT")
                .css("color", isActive ? "#456b52" : "#b54747");

            $("#customerCreditLimit").text(
                formatCurrency(creditLimit)
            );

            $("#customerCreditUsed").text(
                formatCurrency(creditUsed)
            );

            $("#customerAvailableCredit").text(
                formatCurrency(availableCredit)
            );

            sessionStorage.setItem("havenCustomerName", name);
            sessionStorage.setItem("havenCustomerEmail", email);
            sessionStorage.setItem("havenCustomerMobile", mobile);

            $("#profileFeedback").text("");

        } catch (error) {
            console.error("Unable to load customer profile:", error);

            const status = error.response?.status;

            if (status === 401 || status === 403) {
                logoutCustomer();
                window.location.replace("auth.html");
                return;
            }

            showFeedback(
                "#profileFeedback",
                "Unable to load your profile. Please refresh the page and try again.",
                true
            );

            $("#customerName").text("Welcome");
            $("#customerFullName").text("Profile unavailable");
        }
    }

    // =====================================
    // ORDER STATUS DISPLAY
    // =====================================

    function getStatusClass(status) {
        switch (status) {
            case "PLACED":
                return "status-placed";

            case "CONFIRMED":
                return "status-confirmed";

            case "SHIPPED":
                return "status-shipped";

            case "DELIVERED":
                return "status-delivered";

            case "CANCELLED":
                return "status-cancelled";

            default:
                return "status-unknown";
        }
    }

    // =====================================
    // READ ORDER ITEMS
    // =====================================

    function getOrderItems(fields) {
        const values = fields.items?.arrayValue?.values || [];

        return values.map(function (item) {
            const itemFields = item.mapValue?.fields || {};

            return {
                productId: readField(
                    itemFields, "productId", "stringValue", ""
                ),

                title: readField(
                    itemFields, "title", "stringValue", "Product"
                ),

                quantity: readField(
                    itemFields, "quantity", "integerValue", 0
                ),

                unitPrice: readField(
                    itemFields, "unitPrice", "doubleValue", 0
                ),

                lineTotal: readField(
                    itemFields, "lineTotal", "doubleValue", 0
                )
            };
        });
    }

    // =====================================
    // RENDER SINGLE ORDER
    // =====================================

    function renderOrder(document) {
        const fields = document.fields || {};

        const orderId = getDocumentId(document);

        const status = readField(
            fields, "orderStatus", "stringValue", "UNKNOWN"
        );

        const paymentMethod = readField(
            fields, "paymentMethod", "stringValue", "UNKNOWN"
        );

        const paymentStatus = readField(
            fields, "paymentStatus", "stringValue", "UNKNOWN"
        );

        const total = readField(
            fields, "totalAmount", "doubleValue", 0
        );

        const createdAt = readField(
            fields, "createdAt", "timestampValue", null
        );

        const items = getOrderItems(fields);

        const itemHtml = items.map(function (item) {
            return `
                <div class="order-product-row">
                    <div class="order-product-info">
                        <strong>${escapeHtml(item.title)}</strong>
                        <span>Quantity: ${Number(item.quantity)}</span>
                    </div>

                    <strong>${formatCurrency(item.lineTotal)}</strong>
                </div>
            `;
        }).join("");

        const cancelButton = status === "PLACED"
            ? `
                <button
                    type="button"
                    class="cancel-order-button"
                    data-order-id="${escapeHtml(orderId)}">
                    Cancel Order
                </button>
            `
            : "";

        return `
            <article class="order-card">

                <div class="order-card-header">
                    <div>
                        <span class="order-label">ORDER REFERENCE</span>
                        <strong class="order-reference">
                            ${escapeHtml(orderId)}
                        </strong>
                    </div>

                    <span class="order-status ${getStatusClass(status)}">
                        ${escapeHtml(status)}
                    </span>
                </div>

                <div class="order-date">
                    ${escapeHtml(formatOrderDate(createdAt))}
                </div>

                <div class="order-products">
                    ${itemHtml || "<p>No item details available.</p>"}
                </div>

                <div class="order-card-footer">
                    <div class="order-payment-info">
                        <span>Payment: ${escapeHtml(paymentMethod)}</span>
                        <span>Payment status: ${escapeHtml(paymentStatus)}</span>
                    </div>

                    <div class="order-total">
                        <span>Order Total</span>
                        <strong>${formatCurrency(total)}</strong>
                    </div>
                </div>

                ${cancelButton}

            </article>
        `;
    }

    // =====================================
    // LOAD CUSTOMER ORDERS
    // =====================================

   
    // =====================================
    // LOAD CUSTOMER ORDERS
    // =====================================

    async function loadCustomerOrders() {
        const feedback = $("#ordersFeedback");
        const list = $("#ordersList");

        feedback.text("Loading your orders...").css("color", "");
        list.empty();

        try {
            const response = unwrapResponse(
                await getCustomerOrders(100)
            );

            let documents = [];

            if (Array.isArray(response)) {
                // Firestore runQuery returns { document: ... } rows.
                documents = response
                    .map(function (row) {
                        return row?.document || row;
                    })
                    .filter(function (document) {
                        return document && document.fields;
                    });

            } else if (Array.isArray(response?.documents)) {
                documents = response.documents;
            }

            documents = documents.filter(function (document) {
                const customerId = readField(
                    document.fields,
                    "customerId",
                    "stringValue",
                    ""
                );

                return customerId === uid;
            });

            documents.sort(function (a, b) {
                const dateA = new Date(
                    readField(
                        a.fields,
                        "createdAt",
                        "timestampValue",
                        0
                    )
                ).getTime();

                const dateB = new Date(
                    readField(
                        b.fields,
                        "createdAt",
                        "timestampValue",
                        0
                    )
                ).getTime();

                return dateB - dateA;
            });

            if (documents.length === 0) {
                feedback
                    .text("You haven't placed any orders yet.")
                    .css("color", "#777");

                return;
            }

            feedback
                .text(documents.length + " order(s) found.")
                .css("color", "#456b52");

            documents.forEach(function (document) {
                list.append(renderOrder(document));
            });

        } catch (error) {
            console.error("Unable to load customer orders:", error);

            showFeedback(
                "#ordersFeedback",
                "Unable to load your orders. Please try again.",
                true
            );
        }
    }


    // =====================================
    // CANCEL CUSTOMER ORDER
    // =====================================

    $("#ordersList").on(
        "click",
        ".cancel-order-button",
        async function () {
            const orderId = $(this).data("order-id");

            if (!window.confirm(
                "Are you sure you want to cancel this order?"
            )) {
                return;
            }

            const button = $(this);

            button.prop("disabled", true).text("Cancelling...");

            try {
                await cancelCustomerOrder(orderId);

                alert("Your order has been cancelled.");

                await loadCustomerOrders();

            } catch (error) {
                console.error("Order cancellation failed:", error);

                alert(
                    error.message ||
                    "Unable to cancel this order. Please try again."
                );

                button.prop("disabled", false).text("Cancel Order");
            }
        }
    );

    $("#refreshOrders").on("click", loadCustomerOrders);

    // =====================================
    // SAVED ADDRESS - RENDER
    // =====================================

    function renderSavedAddress(address) {
        const defaultLabel = address.isDefault
            ? `<span class="default-address-label">DEFAULT ADDRESS</span>`
            : "";

        return `
            <article class="saved-address-card">

                <div class="saved-address-header">
                    <div>
                        <h4>${escapeHtml(address.name)}</h4>
                        ${defaultLabel}
                    </div>
                </div>

                <p>${escapeHtml(address.mobile)}</p>

                <p>${escapeHtml(address.address)}</p>

                <p>
                    ${escapeHtml(address.city)},
                    ${escapeHtml(address.state)} -
                    ${escapeHtml(address.pincode)}
                </p>

                <div class="saved-address-actions">

                    <button
                        type="button"
                        class="edit-address-button"
                        data-address-id="${escapeHtml(address.id)}">
                        Edit
                    </button>

                    ${
                        !address.isDefault
                            ? `
                                <button
                                    type="button"
                                    class="default-address-button"
                                    data-address-id="${escapeHtml(address.id)}">
                                    Set as Default
                                </button>
                            `
                            : ""
                    }

                    <button
                        type="button"
                        class="delete-address-button"
                        data-address-id="${escapeHtml(address.id)}">
                        Delete
                    </button>

                </div>

            </article>
        `;
    }

    // =====================================
    // LOAD SAVED ADDRESSES
    // =====================================

    async function loadSavedAddresses() {
        const list = $("#addressList");

        list.empty();

        showFeedback(
            "#addressFeedback",
            "Loading your saved addresses..."
        );

        try {
            const response = unwrapResponse(
                await getSavedAddresses()
            );

            savedAddresses = Array.isArray(response)
                ? response
                : [];

            if (savedAddresses.length === 0) {
                showFeedback(
                    "#addressFeedback",
                    "You haven't saved any addresses yet."
                );

                return;
            }

            savedAddresses.forEach(function (address) {
                list.append(renderSavedAddress(address));
            });

            showFeedback(
                "#addressFeedback",
                savedAddresses.length + " saved address(es)."
            );

        } catch (error) {
            console.error("Unable to load saved addresses:", error);

            showFeedback(
                "#addressFeedback",
                "Unable to load your addresses. Please try again.",
                true
            );
        }
    }

    // =====================================
    // ADDRESS FORM HELPERS
    // =====================================

    function resetAddressForm() {
        $("#addressForm")[0].reset();

        $("#addressId").val("");

        $("#addressFormTitle").text("Add New Address");

        $("#saveAddressButton").text("Save Address");

        $("#addressIsDefault").prop("checked", false);
    }

    function openAddressForm() {
        $("#addressFormContainer").removeClass("hidden");
    }

    function closeAddressForm() {
        $("#addressFormContainer").addClass("hidden");

        resetAddressForm();
    }

    // =====================================
    // ADD ADDRESS BUTTON
    // =====================================

    $("#addAddressButton").on("click", function () {
        resetAddressForm();
        openAddressForm();
    });

    // =====================================
    // CANCEL ADDRESS FORM
    // =====================================

    $("#cancelAddressButton").on("click", function () {
        closeAddressForm();
    });

    // =====================================
    // EDIT SAVED ADDRESS
    // =====================================

    $("#addressList").on(
        "click",
        ".edit-address-button",
        function () {
            const addressId = $(this).data("address-id");

            const address = savedAddresses.find(function (item) {
                return item.id === addressId;
            });

            if (!address) {
                alert("Address not found. Please refresh the page.");
                return;
            }

            $("#addressId").val(address.id);
            $("#addressName").val(address.name);
            $("#addressMobile").val(address.mobile);
            $("#savedAddress").val(address.address);
            $("#addressCity").val(address.city);
            $("#addressState").val(address.state);
            $("#addressPincode").val(address.pincode);

            $("#addressIsDefault").prop(
                "checked",
                Boolean(address.isDefault)
            );

            $("#addressFormTitle").text("Edit Address");
            $("#saveAddressButton").text("Update Address");

            openAddressForm();

            $("html, body").animate({
                scrollTop: $("#addressFormContainer").offset().top - 100
            }, 300);
        }
    );

    // =====================================
    // SAVE / UPDATE ADDRESS
    // =====================================

    $("#addressForm").on("submit", async function (event) {
        event.preventDefault();

        const addressId = $("#addressId").val().trim();

        const address = {
            name: $("#addressName").val().trim(),
            mobile: $("#addressMobile").val().trim(),
            address: $("#savedAddress").val().trim(),
            city: $("#addressCity").val().trim(),
            state: $("#addressState").val().trim(),
            pincode: $("#addressPincode").val().trim(),
            isDefault: $("#addressIsDefault").is(":checked")
        };

        if (
            !address.name ||
            !address.mobile ||
            !address.address ||
            !address.city ||
            !address.state ||
            !address.pincode
        ) {
            showFeedback(
                "#addressFeedback",
                "Please fill in all address fields.",
                true
            );

            return;
        }

        if (!/^[0-9]{10}$/.test(address.mobile)) {
            showFeedback(
                "#addressFeedback",
                "Enter a valid 10-digit mobile number.",
                true
            );

            return;
        }

        if (!/^[0-9]{6}$/.test(address.pincode)) {
            showFeedback(
                "#addressFeedback",
                "Enter a valid 6-digit PIN code.",
                true
            );

            return;
        }

        const button = $("#saveAddressButton");

        button.prop("disabled", true).text("Saving...");

        try {
            if (addressId) {
                await updateSavedAddress(addressId, address);

                if (address.isDefault) {
                    await setDefaultAddress(addressId);
                }

                showFeedback(
                    "#addressFeedback",
                    "Address updated successfully."
                );

            } else {
                await addSavedAddress(address);

                showFeedback(
                    "#addressFeedback",
                    "Address saved successfully."
                );
            }

            closeAddressForm();

            await loadSavedAddresses();

        } catch (error) {
            console.error("Unable to save address:", error);

            showFeedback(
                "#addressFeedback",
                error.message || "Unable to save address. Please try again.",
                true
            );

        } finally {
            button.prop("disabled", false);
            button.text(addressId ? "Update Address" : "Save Address");
        }
    });

    // =====================================
    // SET DEFAULT ADDRESS
    // =====================================

    $("#addressList").on(
        "click",
        ".default-address-button",
        async function () {
            const addressId = $(this).data("address-id");

            const button = $(this);

            button.prop("disabled", true).text("Updating...");

            try {
                await setDefaultAddress(addressId);

                showFeedback(
                    "#addressFeedback",
                    "Default address updated successfully."
                );

                await loadSavedAddresses();

            } catch (error) {
                console.error("Unable to set default address:", error);

                showFeedback(
                    "#addressFeedback",
                    error.message || "Unable to update default address.",
                    true
                );

                button.prop("disabled", false).text("Set as Default");
            }
        }
    );

    // =====================================
    // DELETE SAVED ADDRESS
    // =====================================

    $("#addressList").on(
        "click",
        ".delete-address-button",
        async function () {
            const addressId = $(this).data("address-id");

            if (!window.confirm(
                "Are you sure you want to delete this saved address?"
            )) {
                return;
            }

            const button = $(this);

            button.prop("disabled", true).text("Deleting...");

            try {
                await deleteSavedAddress(addressId);

                showFeedback(
                    "#addressFeedback",
                    "Address deleted successfully."
                );

                await loadSavedAddresses();

            } catch (error) {
                console.error("Unable to delete address:", error);

                showFeedback(
                    "#addressFeedback",
                    error.message || "Unable to delete address.",
                    true
                );

                button.prop("disabled", false).text("Delete");
            }
        }
    );

    // =====================================
    // CUSTOMER LOGOUT
    // =====================================

    $("#logoutButton").on("click", function () {
        if (!window.confirm("Are you sure you want to log out?")) {
            return;
        }

        logoutCustomer();

        window.location.replace("index.html");
    });

    // =====================================
    // SIDEBAR ACTIVE MENU
    // =====================================

    $(".account-menu").on("click", function () {
        $(".account-menu").removeClass("active");

        $(this).addClass("active");
    });

    // =====================================
    // INITIALIZE ACCOUNT PAGE
    // =====================================

    loadCustomerProfile();
    loadCustomerOrders();
    loadSavedAddresses();

});
