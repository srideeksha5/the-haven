
/* =========================================
   THE HAVEN - ADMIN CUSTOMER MANAGEMENT
========================================= */

const ADMIN_CUSTOMER_UID = "TTyXkTb0h8ZzJjErDRe3t9roLfU2";
const CUSTOMERS_PER_PAGE = 10;

let allCustomers = [];
let filteredCustomers = [];
let currentCustomerPage = 1;
let selectedCustomer = null;

/* =========================================
   INITIALIZATION
========================================= */

$(document).ready(function () {

    if (!validateCustomerAdminSession()) {
        window.location.href = "../auth.html";
        return;
    }

    $("#adminEmail").text(
        sessionStorage.getItem("havenAdminEmail") || "Admin Account"
    );

    $("#refreshCustomers").on("click", loadCustomers);

    $("#customerSearch").on("input", function () {
        currentCustomerPage = 1;
        applyCustomerFilters();
    });

    $("#customerStatusFilter").on("change", function () {
        currentCustomerPage = 1;
        applyCustomerFilters();
    });

    $("#previousPage").on("click", function () {
        if (currentCustomerPage > 1) {
            currentCustomerPage--;
            renderCustomerTable();
        }
    });

    $("#nextPage").on("click", function () {
        const totalPages = Math.ceil(
            filteredCustomers.length / CUSTOMERS_PER_PAGE
        );

        if (currentCustomerPage < totalPages) {
            currentCustomerPage++;
            renderCustomerTable();
        }
    });

    $("#closeCreditModal, #cancelCreditEdit").on("click", closeCreditModal);

    $("#creditModal").on("click", function (event) {
        if (event.target === this) {
            closeCreditModal();
        }
    });

    $("#creditForm").on("submit", saveCustomerCreditLimit);

    $("#customersTableBody").on("click", ".edit-credit", function () {
        openCreditModal($(this).attr("data-id"));
    });

    $("#customersTableBody").on("click", ".toggle-customer", function () {
        toggleCustomerStatus($(this).attr("data-id"));
    });

    $("#customersTableBody").on("click", ".delete-customer", function () {
        deleteCustomerAccount($(this).attr("data-id"));
    });

    $("#adminLogout").on("click", logoutCustomerAdmin);

    loadCustomers();

});

/* =========================================
   ADMIN SESSION
========================================= */

function validateCustomerAdminSession() {

    return (
        sessionStorage.getItem("havenAdminLoggedIn") === "true" &&
        sessionStorage.getItem("havenAdminUID") === ADMIN_CUSTOMER_UID &&
        Boolean(sessionStorage.getItem("havenAdminToken"))
    );

}

function getCustomerAdminToken() {

    if (!validateCustomerAdminSession()) {
        throw new Error("Admin session expired. Please sign in again.");
    }

    if (typeof getAdminIdToken === "function") {
        return requireToken(
            getAdminIdToken(),
            "Admin login required."
        );
    }

    return requireToken(
        sessionStorage.getItem("havenAdminToken"),
        "Admin login required."
    );

}

/* =========================================
   FIRESTORE VALUE CONVERSION
========================================= */

function customerFirestoreValue(value) {

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
        return customerFirestoreFields(value.mapValue.fields || {});
    }

    if (value.arrayValue) {
        return (value.arrayValue.values || []).map(
            customerFirestoreValue
        );
    }

    return value;
}

function customerFirestoreFields(fields) {

    const result = {};

    Object.keys(fields || {}).forEach(function (key) {
        result[key] = customerFirestoreValue(fields[key]);
    });

    return result;
}

/* =========================================
   NORMALIZE CUSTOMER
========================================= */

function normalizeAdminCustomer(document) {

    const customer = customerFirestoreFields(
        document.fields || {}
    );

    const parts = (document.name || "").split("/");

    customer.id = parts[parts.length - 1];

    customer.name = customer.name || "Unnamed Customer";
    customer.email = customer.email || "No email";
    customer.mobile = customer.mobile || "—";
    customer.creditLimit = Number(customer.creditLimit || 0);
    customer.creditUsed = Number(customer.creditUsed || 0);
    customer.active = customer.active !== false;

    customer.availableCredit = Math.max(
        0,
        customer.creditLimit - customer.creditUsed
    );

    return customer;
}

/* =========================================
   LOAD CUSTOMERS
========================================= */

async function loadCustomers() {

    const feedback = $("#customersFeedback");
    const tableBody = $("#customersTableBody");

    feedback.removeClass("error success").text("");

    tableBody.html(`
        <tr>
            <td colspan="7" class="table-message">
                Loading customers...
            </td>
        </tr>
    `);

    $("#refreshCustomers").prop("disabled", true);

    try {

        const token = getCustomerAdminToken();

        let documents = [];
        let pageToken = null;
        let pageCount = 0;

        do {

            const query = {
                pageSize: 100
            };

            if (pageToken) {
                query.pageToken = pageToken;
            }

            const response = await firestoreRequest({
                path: "customers",
                method: "GET",
                token: token,
                query: query
            });

            documents = documents.concat(
                response.documents || []
            );

            pageToken = response.nextPageToken || null;
            pageCount++;

        } while (pageToken && pageCount < 100);

        allCustomers = documents.map(normalizeAdminCustomer);

        currentCustomerPage = 1;

        updateCustomerStatistics();
        applyCustomerFilters();

    } catch (error) {

        console.error("Customer loading error:", error);

        tableBody.html(`
            <tr>
                <td colspan="7" class="table-message">
                    Unable to load customers.
                </td>
            </tr>
        `);

        feedback
            .addClass("error")
            .text(error.message || "Failed to retrieve customers.");

    } finally {

        $("#refreshCustomers").prop("disabled", false);

    }

}

/* =========================================
   CUSTOMER STATISTICS
========================================= */

function updateCustomerStatistics() {

    const total = allCustomers.length;

    const active = allCustomers.filter(
        customer => customer.active
    ).length;

    const inactive = total - active;

    const totalCredit = allCustomers.reduce(
        (sum, customer) => sum + customer.creditLimit,
        0
    );

    $("#totalCustomers").text(total);
    $("#activeCustomers").text(active);
    $("#inactiveCustomers").text(inactive);
    $("#customerCount").text(total);

    $("#totalCredit").text(formatCustomerCurrency(totalCredit));

}

/* =========================================
   SEARCH AND FILTER
========================================= */

function applyCustomerFilters() {

    const search = String(
        $("#customerSearch").val() || ""
    ).trim().toLowerCase();

    const status = $("#customerStatusFilter").val();

    filteredCustomers = allCustomers.filter(function (customer) {

        const matchesSearch =
            String(customer.name).toLowerCase().includes(search) ||
            String(customer.email).toLowerCase().includes(search) ||
            String(customer.mobile).toLowerCase().includes(search) ||
            String(customer.id).toLowerCase().includes(search);

        const matchesStatus =
            status === "all" ||
            (status === "active" && customer.active) ||
            (status === "inactive" && !customer.active);

        return matchesSearch && matchesStatus;

    });

    currentCustomerPage = Math.min(
        currentCustomerPage,
        Math.max(1, Math.ceil(
            filteredCustomers.length / CUSTOMERS_PER_PAGE
        ))
    );

    renderCustomerTable();

}

/* =========================================
   RENDER CUSTOMER TABLE
========================================= */

function renderCustomerTable() {

    const tableBody = $("#customersTableBody");

    const start = (currentCustomerPage - 1) * CUSTOMERS_PER_PAGE;

    const pageCustomers = filteredCustomers.slice(
        start,
        start + CUSTOMERS_PER_PAGE
    );

    if (!pageCustomers.length) {

        tableBody.html(`
            <tr>
                <td colspan="7" class="table-message">
                    No customers found.
                </td>
            </tr>
        `);

    } else {

        const rows = pageCustomers.map(function (customer) {

            const safeId = escapeCustomerHTML(customer.id);
            const safeName = escapeCustomerHTML(customer.name);
            const safeEmail = escapeCustomerHTML(customer.email);
            const safeMobile = escapeCustomerHTML(customer.mobile);

            const statusText = customer.active ? "Active" : "Inactive";
            const statusClass = customer.active ? "status-active" : "status-inactive";

            const toggleLabel = customer.active ? "Deactivate" : "Activate";

            return `
                <tr>
                    <td>
                        <span class="customer-name">${safeName}</span>
                        <span class="customer-email">${safeEmail}</span>
                        <span class="customer-id">ID: ${safeId}</span>
                    </td>

                    <td>${safeMobile}</td>

                    <td>
                        <span class="credit-value">
                            ${formatCustomerCurrency(customer.creditLimit)}
                        </span>
                    </td>

                    <td>
                        ${formatCustomerCurrency(customer.creditUsed)}
                    </td>

                    <td>
                        <span class="available-credit">
                            ${formatCustomerCurrency(customer.availableCredit)}
                        </span>
                    </td>

                    <td>
                        <span class="status-badge ${statusClass}">
                            ${statusText}
                        </span>
                    </td>

                    <td>
                        <div class="customer-actions">

                            <button
                                type="button"
                                class="customer-action-button edit-credit"
                                data-id="${safeId}">
                                Credit
                            </button>

                            <button
                                type="button"
                                class="customer-action-button toggle-customer"
                                data-id="${safeId}">
                                ${toggleLabel}
                            </button>

                            <button
                                type="button"
                                class="customer-action-button danger delete-customer"
                                data-id="${safeId}">
                                Delete
                            </button>

                        </div>
                    </td>
                </tr>
            `;

        }).join("");

        tableBody.html(rows);

    }

    const totalPages = Math.ceil(
        filteredCustomers.length / CUSTOMERS_PER_PAGE
    );

    const firstRecord = filteredCustomers.length ? start + 1 : 0;

    const lastRecord = Math.min(
        start + CUSTOMERS_PER_PAGE,
        filteredCustomers.length
    );

    $("#paginationInfo").text(
        `Showing ${firstRecord}-${lastRecord} of ${filteredCustomers.length} customers`
    );

    $("#currentPage").text(
        `${currentCustomerPage} / ${Math.max(1, totalPages)}`
    );

    $("#previousPage").prop(
        "disabled",
        currentCustomerPage <= 1
    );

    $("#nextPage").prop(
        "disabled",
        currentCustomerPage >= totalPages
    );

}

/* =========================================
   OPEN CREDIT MODAL
========================================= */

function openCreditModal(customerId) {

    selectedCustomer = allCustomers.find(
        customer => customer.id === customerId
    );

    if (!selectedCustomer) {
        showCustomerFeedback("Customer not found.", "error");
        return;
    }

    $("#creditCustomerId").val(selectedCustomer.id);

    $("#creditCustomerName").text(selectedCustomer.name);
    $("#creditCustomerEmail").text(selectedCustomer.email);

    $("#currentCreditLimit").text(
        formatCustomerCurrency(selectedCustomer.creditLimit)
    );

    $("#currentCreditUsed").text(
        formatCustomerCurrency(selectedCustomer.creditUsed)
    );

    $("#newCreditLimit")
        .val(selectedCustomer.creditLimit)
        .attr("min", Math.ceil(selectedCustomer.creditUsed));

    $("#creditModal").addClass("show");

}

/* =========================================
   CLOSE CREDIT MODAL
========================================= */

function closeCreditModal() {

    $("#creditModal").removeClass("show");

    $("#creditForm")[0].reset();

    selectedCustomer = null;

}

/* =========================================
   SAVE CUSTOMER CREDIT LIMIT
========================================= */

async function saveCustomerCreditLimit(event) {

    event.preventDefault();

    const customerId = $("#creditCustomerId").val();

    const newLimit = Number($("#newCreditLimit").val());

    const customer = allCustomers.find(
        item => item.id === customerId
    );

    if (!customer) {
        showCustomerFeedback("Customer not found.", "error");
        return;
    }

    if (
        !Number.isInteger(newLimit) ||
        newLimit < 0 ||
        newLimit < customer.creditUsed
    ) {

        alert(
            "Credit limit must be a non-negative whole number and cannot be lower than credit already used."
        );

        return;
    }

    const button = $("#saveCreditLimit");

    button.prop("disabled", true).text("Saving...");

    try {

        await updateCustomerCreditLimit(
            customerId,
            newLimit,
            getCustomerAdminToken()
        );

        showCustomerFeedback(
            "Customer credit limit updated successfully.",
            "success"
        );

        closeCreditModal();

        await loadCustomers();

    } catch (error) {

        console.error("Credit update error:", error);

        showCustomerFeedback(
            error.message || "Unable to update credit limit.",
            "error"
        );

    } finally {

        button.prop("disabled", false).text("Save Credit Limit");

    }

}

/* =========================================
   ACTIVATE / DEACTIVATE CUSTOMER
========================================= */


async function toggleCustomerStatus(customerId) {

    const customer = allCustomers.find(
        item => item.id === customerId
    );

    if (!customer) {
        showCustomerFeedback("Customer not found.", "error");
        return;
    }

    const newStatus = !customer.active;
    const action = newStatus ? "activate" : "deactivate";

    const confirmed = window.confirm(
        `Are you sure you want to ${action} ${customer.name}'s account?`
    );

    if (!confirmed) {
        return;
    }

    try {

        await updateCustomerStatus(
            customerId,
            newStatus,
            getCustomerAdminToken()
        );

        showCustomerFeedback(
            `Customer account ${action}d successfully.`,
            "success"
        );

        await loadCustomers();

    } catch (error) {

        console.error("Customer status update error:", error);

        showCustomerFeedback(
            error.message || "Unable to update customer status.",
            "error"
        );

    }

}


/* =========================================
   DELETE CUSTOMER
========================================= */

async function deleteCustomerAccount(customerId) {

    const customer = allCustomers.find(
        item => item.id === customerId
    );

    if (!customer) {
        showCustomerFeedback("Customer not found.", "error");
        return;
    }

    const confirmed = window.confirm(
        `Are you sure you want to delete ${customer.name}'s customer profile?\n\nThis action cannot be undone.`
    );

    if (!confirmed) {
        return;
    }

    try {

        await firestoreRequest({

            path: `customers/${encodeURIComponent(customerId)}`,
            method: "DELETE",
            token: getCustomerAdminToken()

        });

        showCustomerFeedback(
            "Customer profile deleted successfully.",
            "success"
        );

        await loadCustomers();

    } catch (error) {

        console.error("Customer deletion error:", error);

        showCustomerFeedback(
            error.message || "Unable to delete customer profile.",
            "error"
        );

    }

}

/* =========================================
   FEEDBACK
========================================= */

function showCustomerFeedback(message, type) {

    const feedback = $("#customersFeedback");

    feedback
        .removeClass("error success")
        .addClass(type || "")
        .text(message);

}

/* =========================================
   FORMAT CURRENCY
========================================= */

function formatCustomerCurrency(amount) {

    return Number(amount || 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
    });

}

/* =========================================
   ESCAPE HTML
========================================= */

function escapeCustomerHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}

/* =========================================
   LOGOUT
========================================= */

function logoutCustomerAdmin() {

    const confirmed = window.confirm(
        "Are you sure you want to sign out?"
    );

    if (!confirmed) {
        return;
    }

    [
        "havenAdminLoggedIn",
        "havenAdminUID",
        "havenAdminToken",
        "havenAdminEmail",
        "havenAdminRefreshToken",
        "havenAdminExpiresIn"
    ].forEach(function (key) {
        sessionStorage.removeItem(key);
    });

    window.location.href = "../auth.html";

}
