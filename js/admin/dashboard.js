
/* =========================================
   THE HAVEN - ADMIN DASHBOARD
========================================= */

const ADMIN_UID = "TTyXkTb0h8ZzJjErDRe3t9roLfU2";

$(document).ready(function () {

    initializeDashboard();

    $("#adminLogout").on("click", handleAdminLogout);

});

/* -----------------------------------------
   INITIALIZE DASHBOARD
----------------------------------------- */

async function initializeDashboard() {

    if (!validateAdminSession()) {
        window.location.href = "../auth.html";
        return;
    }

    displayAdminDetails();
    displayDashboardDate();

    await loadDashboardOrders();
}

/* -----------------------------------------
   ADMIN SESSION VALIDATION
----------------------------------------- */

function validateAdminSession() {

    const isLoggedIn =
        sessionStorage.getItem("havenAdminLoggedIn") === "true";

    const adminUID =
        sessionStorage.getItem("havenAdminUID");

    const adminToken =
        sessionStorage.getItem("havenAdminToken");

    return (
        isLoggedIn &&
        adminUID === ADMIN_UID &&
        Boolean(adminToken)
    );
}

/* -----------------------------------------
   ADMIN DETAILS
----------------------------------------- */

function displayAdminDetails() {

    const email =
        sessionStorage.getItem("havenAdminEmail") ||
        "Admin Account";

    $("#adminEmail").text(email);
}

/* -----------------------------------------
   DASHBOARD DATE
----------------------------------------- */

function displayDashboardDate() {

    const today = new Date();

    const formattedDate = today.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });

    $("#dashboardDate").text(formattedDate);
}

/* -----------------------------------------
   FIRESTORE VALUE CONVERSION
----------------------------------------- */

function getFirestoreValue(value) {

    if (value === undefined || value === null) {
        return null;
    }

    if (value.stringValue !== undefined) {
        return value.stringValue;
    }

    if (value.integerValue !== undefined) {
        return Number(value.integerValue);
    }

    if (value.doubleValue !== undefined) {
        return Number(value.doubleValue);
    }

    if (value.booleanValue !== undefined) {
        return value.booleanValue;
    }

    if (value.timestampValue !== undefined) {
        return value.timestampValue;
    }

    if (value.nullValue !== undefined) {
        return null;
    }

    if (value.mapValue) {
        return getFirestoreFields(value.mapValue.fields || {});
    }

    if (value.arrayValue) {
        return (value.arrayValue.values || []).map(
            getFirestoreValue
        );
    }

    return value;
}

function getFirestoreFields(fields) {

    const result = {};

    Object.keys(fields || {}).forEach(function (key) {
        result[key] = getFirestoreValue(fields[key]);
    });

    return result;
}

/* -----------------------------------------
   NORMALIZE ORDER DOCUMENT
----------------------------------------- */

function normalizeDashboardOrder(document) {

    if (!document) {
        return null;
    }

    // Firestore REST document
    if (document.fields) {

        const order = getFirestoreFields(document.fields);

        const nameParts = (document.name || "").split("/");
        order.id = nameParts[nameParts.length - 1];

        return order;
    }

    // Already normalized order object
    return {
        ...document,
        id: document.id || document.orderId || ""
    };
}

/* -----------------------------------------
   LOAD ALL DASHBOARD ORDERS
----------------------------------------- */

async function loadDashboardOrders() {

    const feedback = $("#dashboardFeedback");

    const tableBody = $("#recentOrders");

    feedback.removeClass("error success").text("");

    tableBody.html(`
        <tr>
            <td colspan="5" class="table-message">
                Loading orders...
            </td>
        </tr>
    `);

    try {

        // Uses the existing function in order-api.js
        const response = await getAllOrders();

        let documents = response;

        // Support an Axios response wrapper if returned
        if (documents && documents.data) {
            documents = documents.data;
        }

        // Firestore REST listDocuments response
        if (documents && Array.isArray(documents.documents)) {
            documents = documents.documents;
        }

        if (!Array.isArray(documents)) {
            documents = [];
        }

        const orders = documents
            .map(normalizeDashboardOrder)
            .filter(Boolean);

        updateDashboardStatistics(orders);
        renderRecentOrders(orders);

    } catch (error) {

        console.error("Dashboard order loading error:", error);

        $("#totalOrders").text("—");
        $("#placedOrders").text("—");
        $("#deliveredOrders").text("—");
        $("#cancelledOrders").text("—");

        tableBody.html(`
            <tr>
                <td colspan="5" class="table-message">
                    Unable to load orders.
                </td>
            </tr>
        `);

        feedback
            .addClass("error")
            .text(
                error.message ||
                "Could not retrieve dashboard orders. Please check your admin access and API."
            );
    }
}

/* -----------------------------------------
   UPDATE DASHBOARD STATISTICS
----------------------------------------- */

function updateDashboardStatistics(orders) {

    const total = orders.length;

    const placed = orders.filter(function (order) {
        return normalizeStatus(order.orderStatus) === "PLACED";
    }).length;

    const delivered = orders.filter(function (order) {
        return normalizeStatus(order.orderStatus) === "DELIVERED";
    }).length;

    const cancelled = orders.filter(function (order) {
        return normalizeStatus(order.orderStatus) === "CANCELLED";
    }).length;

    $("#totalOrders").text(total);
    $("#placedOrders").text(placed);
    $("#deliveredOrders").text(delivered);
    $("#cancelledOrders").text(cancelled);
}

/* -----------------------------------------
   NORMALIZE STATUS
----------------------------------------- */

function normalizeStatus(status) {

    return String(status || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
}

/* -----------------------------------------
   RENDER RECENT ORDERS
----------------------------------------- */

function renderRecentOrders(orders) {

    const tableBody = $("#recentOrders");

    if (!orders.length) {

        tableBody.html(`
            <tr>
                <td colspan="5" class="table-message">
                    No orders have been recorded yet.
                </td>
            </tr>
        `);

        return;
    }

    const recentOrders = [...orders]
        .sort(function (a, b) {
            return getOrderTimestamp(b) - getOrderTimestamp(a);
        })
        .slice(0, 5);

    const rows = recentOrders.map(function (order) {

        const orderId = order.id || "—";
        const customerId = order.customerId || "—";
        const amount = Number(order.totalAmount || 0);
        const payment = order.paymentMethod || "—";
        const status = order.orderStatus || "UNKNOWN";

        const safeOrderId = escapeDashboardHTML(orderId);
        const safeCustomerId = escapeDashboardHTML(customerId);
        const safePayment = escapeDashboardHTML(payment);
        const safeStatus = escapeDashboardHTML(status);

        const statusClass = getStatusClass(status);

        return `
            <tr>
                <td>#${safeOrderId}</td>
                <td>${safeCustomerId}</td>
                <td>${formatCurrency(amount)}</td>
                <td>${safePayment}</td>
                <td>
                    <span class="status-badge ${statusClass}">
                        ${safeStatus}
                    </span>
                </td>
            </tr>
        `;

    }).join("");

    tableBody.html(rows);
}

/* -----------------------------------------
   ORDER DATE
----------------------------------------- */

function getOrderTimestamp(order) {

    const value = order.createdAt;

    if (!value) {
        return 0;
    }

    const timestamp = new Date(value).getTime();

    return Number.isNaN(timestamp) ? 0 : timestamp;
}

/* -----------------------------------------
   STATUS CSS CLASS
----------------------------------------- */

function getStatusClass(status) {

    const normalized = normalizeStatus(status);

    const allowedClasses = [
        "placed",
        "pending",
        "delivered",
        "active",
        "paid",
        "cancelled",
        "inactive",
        "failed",
        "processing",
        "shipped"
    ];

    const className = normalized.toLowerCase();

    return allowedClasses.includes(className)
        ? "status-" + className
        : "status-pending";
}

/* -----------------------------------------
   FORMAT CURRENCY
----------------------------------------- */

function formatCurrency(amount) {

    return Number(amount || 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    });
}

/* -----------------------------------------
   HTML ESCAPING
----------------------------------------- */

function escapeDashboardHTML(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* -----------------------------------------
   ADMIN LOGOUT
----------------------------------------- */

function handleAdminLogout() {

    const confirmed = window.confirm(
        "Are you sure you want to sign out of the admin account?"
    );

    if (!confirmed) {
        return;
    }

    // Clear admin session data
    sessionStorage.removeItem("havenAdminLoggedIn");
    sessionStorage.removeItem("havenAdminUID");
    sessionStorage.removeItem("havenAdminToken");
    sessionStorage.removeItem("havenAdminEmail");
    sessionStorage.removeItem("havenAdminRefreshToken");
    sessionStorage.removeItem("havenAdminExpiresIn");

    window.location.href = "../auth.html";
}
