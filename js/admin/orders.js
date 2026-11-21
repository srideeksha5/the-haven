
/* =========================================
   THE HAVEN - ADMIN ORDERS
   Order management and payment overview
========================================= */

const ordersState = {
    orders: [],
    payments: [],
    filteredOrders: [],
    currentPage: 1,
    pageSize: 10
};

const ordersElements = {
    tableBody: document.getElementById("ordersTableBody"),
    search: document.getElementById("orderSearch"),
    status: document.getElementById("statusFilter"),
    payment: document.getElementById("paymentFilter"),
    message: document.getElementById("ordersMessage"),
    paginationInfo: document.getElementById("paginationInfo"),
    previous: document.getElementById("previousPage"),
    next: document.getElementById("nextPage"),
    modal: document.getElementById("orderModal"),
    modalTitle: document.getElementById("modalOrderTitle"),
    modalContent: document.getElementById("orderDetailsContent")
};


/* -----------------------------------------
   ADMIN SESSION
----------------------------------------- */

function validateOrdersAdminSession() {

    const loggedIn = sessionStorage.getItem("havenAdminLoggedIn");
    const uid = sessionStorage.getItem("havenAdminUID");

    if (loggedIn !== "true" || !uid) {
        window.location.href = "../auth.html";
        return false;
    }

    return true;
}


/* -----------------------------------------
   FIRESTORE FIELD HELPERS
----------------------------------------- */

function orderFirestoreValue(value) {

    if (!value) return null;

    if (value.stringValue !== undefined) return value.stringValue;
    if (value.integerValue !== undefined) return Number(value.integerValue);
    if (value.doubleValue !== undefined) return Number(value.doubleValue);
    if (value.booleanValue !== undefined) return value.booleanValue;
    if (value.timestampValue !== undefined) return value.timestampValue;
    if (value.nullValue !== undefined) return null;

    if (value.mapValue !== undefined) {

        const result = {};

        Object.entries(value.mapValue.fields || {}).forEach(([key, field]) => {
            result[key] = orderFirestoreValue(field);
        });

        return result;
    }

    if (value.arrayValue !== undefined) {
        return (value.arrayValue.values || []).map(orderFirestoreValue);
    }

    return null;
}


function orderField(document, fieldName, fallback = null) {

    const field = document?.fields?.[fieldName];

    if (!field) return fallback;

    const value = orderFirestoreValue(field);

    return value === null || value === undefined
        ? fallback
        : value;
}


/* -----------------------------------------
   NORMALIZE FIRESTORE DOCUMENTS
----------------------------------------- */

function normalizeOrder(document) {

    const fields = document?.fields || document;

    const name = document?.name || "";
    const id = name ? name.split("/").pop() : document?.id;

    const read = (field, fallback = null) =>
        orderField({ fields }, field, fallback);

    return {
        id: id || "Unknown",
        customerId: read("customerId", "Unknown"),
        items: read("items", []),
        shippingAddress: read("shippingAddress", {}),
        subtotal: Number(read("subtotal", 0)),
        deliveryFee: Number(read("deliveryFee", 0)),
        totalAmount: Number(read("totalAmount", 0)),
        creditAmount: Number(read("creditAmount", 0)),
        paymentMethod: read("paymentMethod", "Unknown"),
        paymentStatus: read("paymentStatus", "Unknown"),
        orderStatus: read("orderStatus", "Unknown"),
        createdAt: read("createdAt"),
        updatedAt: read("updatedAt")
    };
}


function normalizePayment(document) {

    const fields = document?.fields || document;

    const name = document?.name || "";
    const id = name ? name.split("/").pop() : document?.id;

    const read = (field, fallback = null) =>
        orderField({ fields }, field, fallback);

    return {
        id: id || "Unknown",
        orderId: read("orderId", ""),
        customerId: read("customerId", ""),
        amount: Number(read("amount", 0)),
        paymentMethod: read("paymentMethod", "Unknown"),
        paymentStatus: read("paymentStatus", "Unknown"),
        createdAt: read("createdAt")
    };
}


/* -----------------------------------------
   DATE / DISPLAY HELPERS
----------------------------------------- */

function formatOrderDate(value) {

    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}


function formatOrderCurrency(value) {

    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}


function escapeOrderHTML(value) {

    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}


function statusClass(status) {

    const normalized = String(status || "").toUpperCase();

    const classes = {
        PLACED: "status-placed",
        PROCESSING: "status-processing",
        CONFIRMED: "status-processing",
        SHIPPED: "status-shipped",
        DELIVERED: "status-delivered",
        CANCELLED: "status-cancelled",
        REJECTED: "status-cancelled",
        PENDING_COLLECTION: "status-pending",
        PENDING_APPROVAL: "status-pending",
        APPROVED: "status-approved",
        COMPLETED: "status-approved"
    };

    return classes[normalized] || "status-neutral";
}


function statusLabel(status) {

    return String(status || "UNKNOWN")
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, letter => letter.toUpperCase());
}


function getPaymentForOrder(orderId) {

    return ordersState.payments.find(payment =>
        payment.orderId === orderId
    ) || null;
}


function getEffectivePaymentStatus(order) {

    const payment = getPaymentForOrder(order.id);

    return payment?.paymentStatus ||
        order.paymentStatus ||
        "Not recorded";
}


/* -----------------------------------------
   LOAD PAYMENTS
----------------------------------------- */

async function loadAdminPayments() {

    const token = getAdminIdToken();

    if (!token) {
        throw new Error("Admin session expired. Please sign in again.");
    }

    const payments = [];
    let pageToken = null;

    do {

        const query = {
            pageSize: 100
        };

        if (pageToken) {
            query.pageToken = pageToken;
        }

        const response = await firestoreRequest({
            path: "payments",
            method: "GET",
            token: token,
            query: query
        });

        (response.documents || []).forEach(document => {
            payments.push(normalizePayment(document));
        });

        pageToken = response.nextPageToken || null;

    } while (pageToken);

    return payments;
}


/* -----------------------------------------
   LOAD ORDERS AND PAYMENTS
----------------------------------------- */

async function loadOrdersPage() {

    if (!validateOrdersAdminSession()) return;

    ordersElements.message.textContent = "";

    ordersElements.tableBody.innerHTML = `
        <tr>
            <td colspan="8" class="empty-cell">
                Loading orders...
            </td>
        </tr>
    `;

    try {

        const [orderResponse, paymentResponse] = await Promise.all([
            getAllOrders(),
            loadAdminPayments()
        ]);

        let rawOrders = [];

        if (Array.isArray(orderResponse)) {
            rawOrders = orderResponse;
        } else if (Array.isArray(orderResponse?.documents)) {
            rawOrders = orderResponse.documents;
        }

        ordersState.orders = rawOrders.map(normalizeOrder);
        ordersState.payments = paymentResponse;

        updateOrderStatistics();
        applyOrderFilters();

    } catch (error) {

        console.error("Unable to load orders:", error);

        ordersElements.tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-cell">
                    Unable to load orders. Please refresh the page.
                </td>
            </tr>
        `;

        ordersElements.message.textContent =
            error.message || "An error occurred while loading orders.";

    }
}


/* -----------------------------------------
   ORDER STATISTICS
----------------------------------------- */

function updateOrderStatistics() {

    const orders = ordersState.orders;

    document.getElementById("totalOrders").textContent = orders.length;

    document.getElementById("placedOrders").textContent =
        orders.filter(order => order.orderStatus === "PLACED").length;

    document.getElementById("processingOrders").textContent =
        orders.filter(order => order.orderStatus === "CONFIRMED").length;

    document.getElementById("deliveredOrders").textContent =
        orders.filter(order => order.orderStatus === "DELIVERED").length;

    document.getElementById("cancelledOrders").textContent =
        orders.filter(order => order.orderStatus === "CANCELLED").length;
}


/* -----------------------------------------
   FILTER ORDERS
----------------------------------------- */

function applyOrderFilters() {

    const searchValue = ordersElements.search.value
        .trim()
        .toLowerCase();

    const statusValue = ordersElements.status.value;
    const paymentValue = ordersElements.payment.value;

    ordersState.filteredOrders = ordersState.orders.filter(order => {

        const matchesSearch =
            String(order.id).toLowerCase().includes(searchValue) ||
            String(order.customerId).toLowerCase().includes(searchValue);

        const matchesStatus =
            statusValue === "ALL" ||
            order.orderStatus === statusValue;

        const matchesPayment =
            paymentValue === "ALL" ||
            order.paymentMethod === paymentValue;

        return matchesSearch && matchesStatus && matchesPayment;

    });

    ordersState.currentPage = 1;

    renderOrdersTable();
}


/* -----------------------------------------
   RENDER ORDER TABLE
----------------------------------------- */

function renderOrdersTable() {

    const orders = ordersState.filteredOrders;

    const start = (ordersState.currentPage - 1) * ordersState.pageSize;
    const end = start + ordersState.pageSize;

    const pageOrders = orders.slice(start, end);

    if (!pageOrders.length) {

        ordersElements.tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-cell">
                    No matching orders found.
                </td>
            </tr>
        `;

    } else {

        ordersElements.tableBody.innerHTML = pageOrders.map(order => {

            const paymentStatus = getEffectivePaymentStatus(order);

            return `
                <tr>
                    <td>
                        <span class="order-id">
                            #${escapeOrderHTML(order.id.slice(0, 10))}
                        </span>

                        <span class="subtle-text">
                            ${order.items.length} item(s)
                        </span>
                    </td>

                    <td>
                        ${escapeOrderHTML(String(order.customerId).slice(0, 12))}
                        <span class="subtle-text">Customer ID</span>
                    </td>

                    <td>
                        ${escapeOrderHTML(formatOrderDate(order.createdAt))}
                    </td>

                    <td>
                        <strong>
                            ${escapeOrderHTML(formatOrderCurrency(order.totalAmount))}
                        </strong>
                    </td>

                    <td>
                        ${escapeOrderHTML(statusLabel(order.paymentMethod))}
                    </td>

                    <td>
                        <span class="status-pill ${statusClass(paymentStatus)}">
                            ${escapeOrderHTML(statusLabel(paymentStatus))}
                        </span>
                    </td>

                    <td>
                        <span class="status-pill ${statusClass(order.orderStatus)}">
                            ${escapeOrderHTML(statusLabel(order.orderStatus))}
                        </span>
                    </td>

                    <td>
                        <button
                            class="view-order-btn"
                            data-order-id="${escapeOrderHTML(order.id)}">
                            View details
                        </button>
                    </td>
                </tr>
            `;

        }).join("");

    }

    const totalPages = Math.max(
        1,
        Math.ceil(orders.length / ordersState.pageSize)
    );

    ordersElements.paginationInfo.textContent =
        `Showing ${orders.length ? start + 1 : 0}-${Math.min(end, orders.length)} of ${orders.length} orders`;

    ordersElements.previous.disabled = ordersState.currentPage <= 1;
    ordersElements.next.disabled = ordersState.currentPage >= totalPages;
}


/* -----------------------------------------
   ORDER DETAILS
----------------------------------------- */

function getAddressValue(address, key) {

    if (!address) return "";

    return address[key] ?? "";
}


function renderPaymentActions(order, payment) {

    const paymentStatus = payment?.paymentStatus ||
        order.paymentStatus ||
        "";

    if (!payment) {

        return `
            <p class="subtle-text">
                No payment record is available for this order.
                Payment actions are disabled until the payment record exists.
            </p>
        `;
    }

    if (
        order.paymentMethod === "CASH" &&
        paymentStatus === "PENDING_COLLECTION"
    ) {

        return `
            <div class="payment-action-group">
                <p>
                    Cash payment is awaiting collection.
                </p>

                <button
                    class="refresh-btn"
                    id="collectCashBtn"
                    data-order-id="${escapeOrderHTML(order.id)}">
                    Mark as Collected
                </button>
            </div>
        `;
    }

    if (
        order.paymentMethod === "CREDIT" &&
        paymentStatus === "PENDING_APPROVAL" &&
        order.orderStatus === "PLACED"
    ) {

        return `
            <div class="payment-action-group">
                <p>
                    This credit order is awaiting administrator approval.
                </p>

                <button
                    class="refresh-btn"
                    id="approveCreditBtn"
                    data-order-id="${escapeOrderHTML(order.id)}">
                    Approve Credit
                </button>

                <button
                    class="refresh-btn"
                    id="rejectCreditBtn"
                    data-order-id="${escapeOrderHTML(order.id)}">
                    Reject Credit
                </button>
            </div>
        `;
    }

    return `
        <p class="subtle-text">
            No payment action is currently available.
            Current payment status:
            <strong>${escapeOrderHTML(statusLabel(paymentStatus))}</strong>
        </p>
    `;
}


function showOrderDetails(orderId) {

    const order = ordersState.orders.find(item => item.id === orderId);

    if (!order) return;

    const payment = getPaymentForOrder(order.id);

    const address = order.shippingAddress || {};

    const paymentStatus = payment?.paymentStatus ||
        order.paymentStatus ||
        "Not recorded";

    ordersElements.modalTitle.textContent =
        `Order #${order.id.slice(0, 12)}`;

    const itemRows = order.items.map(item => {

        const quantity = Number(item.quantity) || 0;
        const unitPrice = Number(item.unitPrice) || 0;
        const lineTotal = Number(item.lineTotal) || quantity * unitPrice;

        return `
            <tr>
                <td>${escapeOrderHTML(item.title || "Product")}</td>
                <td>${quantity}</td>
                <td>${escapeOrderHTML(formatOrderCurrency(unitPrice))}</td>
                <td>${escapeOrderHTML(formatOrderCurrency(lineTotal))}</td>
            </tr>
        `;

    }).join("");

    ordersElements.modalContent.innerHTML = `

        <section class="detail-section">
            <h3>Order summary</h3>

            <div class="detail-grid">

                <div class="detail-item">
                    <span>Customer ID</span>
                    <strong>${escapeOrderHTML(order.customerId)}</strong>
                </div>

                <div class="detail-item">
                    <span>Order date</span>
                    <strong>${escapeOrderHTML(formatOrderDate(order.createdAt))}</strong>
                </div>

                <div class="detail-item">
                    <span>Order status</span>
                    <strong>${escapeOrderHTML(statusLabel(order.orderStatus))}</strong>
                </div>

                <div class="detail-item">
                    <span>Payment method</span>
                    <strong>${escapeOrderHTML(statusLabel(order.paymentMethod))}</strong>
                </div>

                <div class="detail-item">
                    <span>Payment status</span>
                    <strong>${escapeOrderHTML(statusLabel(paymentStatus))}</strong>
                </div>

                <div class="detail-item">
                    <span>Payment record ID</span>
                    <strong>${escapeOrderHTML(payment?.id || "Not available")}</strong>
                </div>

            </div>
        </section>


        <section class="detail-section">
            <h3>Products</h3>

            <div class="table-wrapper">
                <table class="detail-products">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Qty</th>
                            <th>Unit price</th>
                            <th>Total</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${itemRows || `
                            <tr>
                                <td colspan="4">No item details available.</td>
                            </tr>
                        `}
                    </tbody>
                </table>
            </div>
        </section>


        <section class="detail-section">
            <h3>Delivery address</h3>

            <div class="detail-grid">

                <div class="detail-item">
                    <span>Name</span>
                    <strong>${escapeOrderHTML(getAddressValue(address, "name") || "—")}</strong>
                </div>

                <div class="detail-item">
                    <span>Mobile</span>
                    <strong>${escapeOrderHTML(getAddressValue(address, "mobile") || "—")}</strong>
                </div>

                <div class="detail-item">
                    <span>Address</span>
                    <strong>${escapeOrderHTML(getAddressValue(address, "address") || "—")}</strong>
                </div>

                <div class="detail-item">
                    <span>City / State</span>
                    <strong>
                        ${escapeOrderHTML(getAddressValue(address, "city") || "—")},
                        ${escapeOrderHTML(getAddressValue(address, "state") || "—")}
                    </strong>
                </div>

                <div class="detail-item">
                    <span>Pincode</span>
                    <strong>${escapeOrderHTML(getAddressValue(address, "pincode") || "—")}</strong>
                </div>

            </div>
        </section>


        <section class="detail-section">
            <h3>Amount breakdown</h3>

            <div class="detail-grid">

                <div class="detail-item">
                    <span>Subtotal</span>
                    <strong>${escapeOrderHTML(formatOrderCurrency(order.subtotal))}</strong>
                </div>

                <div class="detail-item">
                    <span>Delivery fee</span>
                    <strong>${escapeOrderHTML(formatOrderCurrency(order.deliveryFee))}</strong>
                </div>

                <div class="detail-item">
                    <span>Order total</span>
                    <strong>${escapeOrderHTML(formatOrderCurrency(order.totalAmount))}</strong>
                </div>

            </div>
        </section>


        <section class="detail-section">
            <h3>Payment management</h3>

            <div class="detail-grid">

                <div class="detail-item">
                    <span>Payment method</span>
                    <strong>${escapeOrderHTML(statusLabel(order.paymentMethod))}</strong>
                </div>

                <div class="detail-item">
                    <span>Payment status</span>
                    <strong>${escapeOrderHTML(statusLabel(paymentStatus))}</strong>
                </div>

                <div class="detail-item">
                    <span>Payment amount</span>
                    <strong>${escapeOrderHTML(formatOrderCurrency(payment?.amount ?? order.totalAmount))}</strong>
                </div>

            </div>

            ${renderPaymentActions(order, payment)}
        </section>


        <section class="detail-section">
            <h3>Update order status</h3>

            <div class="order-status-editor">

                <select id="newOrderStatus">
                    <option value="PLACED">Placed</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="SHIPPED">Shipped</option>
                    <option value="DELIVERED">Delivered</option>
                    <option value="CANCELLED">Cancelled</option>
                </select>

                <button class="refresh-btn" id="saveOrderStatus">
                    Save status
                </button>

            </div>

            <p class="subtle-text">
                Cancelling a pending order restores inventory.
                Cancelling a credit order also releases its reserved credit.
                Completed payments require a separate refund workflow.
            </p>
        </section>

    `;

    const statusSelect = document.getElementById("newOrderStatus");

    statusSelect.value = order.orderStatus;

    document.getElementById("saveOrderStatus")
        .addEventListener("click", () => {
            changeOrderStatus(order.id, statusSelect.value);
        });

    const collectButton = document.getElementById("collectCashBtn");

    if (collectButton) {
        collectButton.addEventListener("click", () => {
            handleAdminPaymentAction(order.id, "COLLECT_CASH");
        });
    }

    const approveButton = document.getElementById("approveCreditBtn");

    if (approveButton) {
        approveButton.addEventListener("click", () => {
            handleAdminPaymentAction(order.id, "APPROVE_CREDIT");
        });
    }

    const rejectButton = document.getElementById("rejectCreditBtn");

    if (rejectButton) {
        rejectButton.addEventListener("click", () => {
            handleAdminPaymentAction(order.id, "REJECT_CREDIT");
        });
    }

    ordersElements.modal.classList.add("show");
}


/* -----------------------------------------
   ADMIN PAYMENT ACTION HANDLER
----------------------------------------- */

async function handleAdminPaymentAction(orderId, action) {

    const messages = {
        COLLECT_CASH: {
            confirm: "Confirm that the cash payment has been collected?",
            progress: "Recording collection...",
            success: "Cash collection recorded successfully."
        },

        APPROVE_CREDIT: {
            confirm: "Approve this customer's credit order?",
            progress: "Approving credit...",
            success: "Credit order approved successfully."
        },

        REJECT_CREDIT: {
            confirm:
                "Reject this credit order? The order will be cancelled, stock restored, and reserved credit released.",
            progress: "Rejecting credit...",
            success: "Credit order rejected. Stock and reserved credit have been restored."
        }
    };

    const actionInfo = messages[action];

    if (!actionInfo) {
        alert("Invalid payment action.");
        return;
    }

    if (!confirm(actionInfo.confirm)) {
        return;
    }

    const buttonIds = {
        COLLECT_CASH: "collectCashBtn",
        APPROVE_CREDIT: "approveCreditBtn",
        REJECT_CREDIT: "rejectCreditBtn"
    };

    const button = document.getElementById(buttonIds[action]);

    if (button) {
        button.disabled = true;
        button.textContent = actionInfo.progress;
    }

    try {

        await processAdminPayment(orderId, action);

        alert(actionInfo.success);

        ordersElements.modal.classList.remove("show");

        await loadOrdersPage();

    } catch (error) {

        console.error("Payment action failed:", error);

        alert(
            error?.response?.data?.error?.message ||
            error.message ||
            "Unable to complete the payment action."
        );

        if (button) {
            button.disabled = false;

            button.textContent = {
                COLLECT_CASH: "Mark as Collected",
                APPROVE_CREDIT: "Approve Credit",
                REJECT_CREDIT: "Reject Credit"
            }[action];
        }
    }
}


/* -----------------------------------------
   UPDATE ORDER STATUS
----------------------------------------- */

async function changeOrderStatus(orderId, newStatus) {

    const allowedStatuses = [
        "PLACED",
        "CONFIRMED",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED"
    ];

    if (!allowedStatuses.includes(newStatus)) {
        alert("Invalid order status.");
        return;
    }

    const order = ordersState.orders.find(item => item.id === orderId);

    if (!order) return;

    if (order.orderStatus === newStatus) {
        alert("The order already has this status.");
        return;
    }

    if (order.orderStatus === "CANCELLED") {
        alert("A cancelled order cannot be changed from this page.");
        return;
    }

    if (
        newStatus === "CANCELLED" &&
        !confirm(
            "Cancel this order? Pending stock and credit reservations will be restored."
        )
    ) {
        return;
    }

    if (
        newStatus !== "CANCELLED" &&
        !confirm(`Change this order status to ${statusLabel(newStatus)}?`)
    ) {
        return;
    }

    const button = document.getElementById("saveOrderStatus");

    button.disabled = true;
    button.textContent = "Saving...";

    try {

        await updateOrderStatus(orderId, newStatus);

        alert("Order status updated.");

        ordersElements.modal.classList.remove("show");

        await loadOrdersPage();

    } catch (error) {

        console.error("Order status update failed:", error);

        alert(
            error?.response?.data?.error?.message ||
            error.message ||
            "Unable to update order status."
        );

        button.disabled = false;
        button.textContent = "Save status";
    }
}


/* -----------------------------------------
   EVENT LISTENERS
----------------------------------------- */

ordersElements.search.addEventListener("input", applyOrderFilters);

ordersElements.status.addEventListener("change", applyOrderFilters);

ordersElements.payment.addEventListener("change", applyOrderFilters);


ordersElements.previous.addEventListener("click", () => {

    if (ordersState.currentPage > 1) {
        ordersState.currentPage--;
        renderOrdersTable();
    }

});


ordersElements.next.addEventListener("click", () => {

    const totalPages = Math.ceil(
        ordersState.filteredOrders.length / ordersState.pageSize
    );

    if (ordersState.currentPage < totalPages) {
        ordersState.currentPage++;
        renderOrdersTable();
    }

});


document.getElementById("refreshBtn")
    .addEventListener("click", loadOrdersPage);


ordersElements.tableBody.addEventListener("click", event => {

    const button = event.target.closest("[data-order-id]");

    if (!button) return;

    showOrderDetails(button.dataset.orderId);

});


document.getElementById("closeOrderModal")
    .addEventListener("click", () => {
        ordersElements.modal.classList.remove("show");
    });


document.getElementById("closeDetailsBtn")
    .addEventListener("click", () => {
        ordersElements.modal.classList.remove("show");
    });


ordersElements.modal.addEventListener("click", event => {

    if (event.target === ordersElements.modal) {
        ordersElements.modal.classList.remove("show");
    }

});


document.getElementById("logoutBtn").addEventListener("click", () => {

    sessionStorage.removeItem("havenAdminLoggedIn");
    sessionStorage.removeItem("havenAdminUID");
    sessionStorage.removeItem("havenAdminToken");
    sessionStorage.removeItem("havenAdminEmail");
    sessionStorage.removeItem("havenAdminRefreshToken");
    sessionStorage.removeItem("havenAdminExpiresIn");

    window.location.href = "../auth.html";

});


/* -----------------------------------------
   INITIALIZE
----------------------------------------- */

if (validateOrdersAdminSession()) {
    loadOrdersPage();
}
