
/* =========================================
   THE HAVEN - ADMIN INVENTORY MANAGEMENT
========================================= */

const INVENTORY_ADMIN_UID = "TTyXkTb0h8ZzJjErDRe3t9roLfU2";
const INVENTORY_PAGE_SIZE = 10;

let inventoryProducts = [];
let filteredInventory = [];
let inventoryCategories = [];
let inventoryPage = 1;
let selectedInventoryProduct = null;

/* =========================================
   INITIALIZATION
========================================= */

$(document).ready(function () {

    if (!validateInventoryAdminSession()) {
        window.location.href = "../auth.html";
        return;
    }

    $("#adminEmail").text(
        sessionStorage.getItem("havenAdminEmail") || "Admin Account"
    );

    $("#refreshInventory").on("click", loadInventory);

    $("#inventorySearch").on("input", function () {
        inventoryPage = 1;
        applyInventoryFilters();
    });

    $("#inventoryCategory, #inventoryStockFilter").on("change", function () {
        inventoryPage = 1;
        applyInventoryFilters();
    });

    $("#inventoryPrevious").on("click", function () {
        if (inventoryPage > 1) {
            inventoryPage--;
            renderInventoryTable();
        }
    });

    $("#inventoryNext").on("click", function () {
        const totalPages = Math.ceil(
            filteredInventory.length / INVENTORY_PAGE_SIZE
        );

        if (inventoryPage < totalPages) {
            inventoryPage++;
            renderInventoryTable();
        }
    });

    $("#closeStockModal, #cancelStockUpdate").on("click", closeStockModal);

    $("#stockModal").on("click", function (event) {
        if (event.target === this) {
            closeStockModal();
        }
    });

    $("#stockForm").on("submit", saveStockQuantity);

    $("#inventoryTableBody").on("click", ".edit-stock", function () {
        openStockModal($(this).attr("data-id"));
    });

    $("#adminLogout").on("click", logoutInventoryAdmin);

    loadInventory();

});

/* =========================================
   ADMIN SESSION
========================================= */

function validateInventoryAdminSession() {

    return (
        sessionStorage.getItem("havenAdminLoggedIn") === "true" &&
        sessionStorage.getItem("havenAdminUID") === INVENTORY_ADMIN_UID &&
        Boolean(sessionStorage.getItem("havenAdminToken"))
    );

}

function getInventoryAdminToken() {

    if (!validateInventoryAdminSession()) {
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

function inventoryFirestoreValue(value) {

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
        return inventoryFirestoreFields(value.mapValue.fields || {});
    }

    if (value.arrayValue) {
        return (value.arrayValue.values || []).map(
            inventoryFirestoreValue
        );
    }

    return value;
}

function inventoryFirestoreFields(fields) {

    const result = {};

    Object.keys(fields || {}).forEach(function (key) {
        result[key] = inventoryFirestoreValue(fields[key]);
    });

    return result;
}

/* =========================================
   NORMALIZE PRODUCT
========================================= */

function normalizeInventoryProduct(document) {

    const product = inventoryFirestoreFields(
        document.fields || {}
    );

    const parts = (document.name || "").split("/");

    product.id = parts[parts.length - 1];

    product.title = product.title || "Untitled Product";
    product.categoryId = product.categoryId || "";
    product.description = product.description || "";
    product.price = Number(product.price || 0);
    product.qty = Number(product.qty || 0);
    product.active = product.active !== false;

    return product;
}

/* =========================================
   LOAD INVENTORY
========================================= */

async function loadInventory() {

    const feedback = $("#inventoryFeedback");
    const tableBody = $("#inventoryTableBody");

    feedback.removeClass("error success").text("");

    tableBody.html(`
        <tr>
            <td colspan="7" class="table-message">
                Loading inventory...
            </td>
        </tr>
    `);

    $("#refreshInventory").prop("disabled", true);

    try {

        // Load categories and inventory
        const results = await Promise.all([
            getAllInventory(1000),
            loadInventoryCategories()
        ]);

        const inventoryDocuments = results[0] || [];

        // Run the supplied high/low stock queries too.
        // These results are used to cross-check the dashboard counts.
        const stockResults = await Promise.all([
            getHighStockProducts(1000),
            getLowStockProducts(1000)
        ]);

        inventoryProducts = inventoryDocuments
            .map(function (item) {
                return normalizeInventoryProduct(item.document || item);
            })
            .filter(product => product.id);

        updateInventoryStatistics(
            stockResults[0] || [],
            stockResults[1] || []
        );

        populateInventoryCategories();

        inventoryPage = 1;
        applyInventoryFilters();

    } catch (error) {

        console.error("Inventory loading error:", error);

        tableBody.html(`
            <tr>
                <td colspan="7" class="table-message">
                    Unable to load inventory.
                </td>
            </tr>
        `);

        feedback
            .addClass("error")
            .text(error.message || "Failed to retrieve inventory.");

    } finally {

        $("#refreshInventory").prop("disabled", false);

    }

}

/* =========================================
   LOAD CATEGORIES
========================================= */

async function loadInventoryCategories() {

    const response = await firestoreRequest({
        path: "categories",
        method: "GET",
        token: getInventoryAdminToken(),
        query: {
            pageSize: 1000
        }
    });

    const documents = response.documents || [];

    inventoryCategories = documents.map(function (document) {

        const category = inventoryFirestoreFields(
            document.fields || {}
        );

        const parts = (document.name || "").split("/");

        category.id = parts[parts.length - 1];

        return category;

    });

}

/* =========================================
   CATEGORY DROPDOWN
========================================= */

function populateInventoryCategories() {

    const select = $("#inventoryCategory");

    const currentValue = select.val();

    let options = `<option value="all">All Categories</option>`;

    inventoryCategories.forEach(function (category) {

        options += `
            <option value="${escapeInventoryHTML(category.id)}">
                ${escapeInventoryHTML(category.name || "Unnamed Category")}
            </option>
        `;

    });

    select.html(options);

    if (
        currentValue === "all" ||
        inventoryCategories.some(category => category.id === currentValue)
    ) {
        select.val(currentValue || "all");
    }

}

/* =========================================
   GET CATEGORY NAME
========================================= */

function getInventoryCategoryName(categoryId) {

    const category = inventoryCategories.find(
        item => item.id === categoryId
    );

    return category ? category.name : "Uncategorized";

}

/* =========================================
   UPDATE STATISTICS
========================================= */

function updateInventoryStatistics(highResults, lowResults) {

    const totalProducts = inventoryProducts.length;

    const totalUnits = inventoryProducts.reduce(
        (sum, product) => sum + product.qty,
        0
    );

    const highStockCount = inventoryProducts.filter(
        product => product.qty > 100
    ).length;

    const lowStockCount = inventoryProducts.filter(
        product => product.qty < 15
    ).length;

    $("#totalProducts").text(totalProducts);
    $("#totalUnits").text(totalUnits);
    $("#highStockCount").text(highStockCount);
    $("#lowStockCount").text(lowStockCount);

}

/* =========================================
   SEARCH AND FILTER
========================================= */

function applyInventoryFilters() {

    const search = String(
        $("#inventorySearch").val() || ""
    ).trim().toLowerCase();

    const categoryId = $("#inventoryCategory").val();

    const stockFilter = $("#inventoryStockFilter").val();

    filteredInventory = inventoryProducts.filter(function (product) {

        const categoryName = getInventoryCategoryName(
            product.categoryId
        );

        const matchesSearch =
            product.title.toLowerCase().includes(search) ||
            categoryName.toLowerCase().includes(search) ||
            product.id.toLowerCase().includes(search);

        const matchesCategory =
            categoryId === "all" ||
            product.categoryId === categoryId;

        let matchesStock = true;

        if (stockFilter === "high") {
            matchesStock = product.qty > 100;
        }

        if (stockFilter === "normal") {
            matchesStock = product.qty >= 15 && product.qty <= 100;
        }

        if (stockFilter === "low") {
            matchesStock = product.qty > 0 && product.qty < 15;
        }

        if (stockFilter === "out") {
            matchesStock = product.qty === 0;
        }

        return matchesSearch && matchesCategory && matchesStock;

    });

    const totalPages = Math.ceil(
        filteredInventory.length / INVENTORY_PAGE_SIZE
    );

    inventoryPage = Math.min(
        inventoryPage,
        Math.max(1, totalPages)
    );

    renderInventoryTable();

}

/* =========================================
   STOCK LEVEL
========================================= */

function getInventoryStockLevel(quantity) {

    if (quantity === 0) {
        return {
            label: "Out of Stock",
            className: "out"
        };
    }

    if (quantity < 15) {
        return {
            label: "Low Stock",
            className: "low"
        };
    }

    if (quantity > 100) {
        return {
            label: "High Stock",
            className: "high"
        };
    }

    return {
        label: "Normal",
        className: "normal"
    };

}

/* =========================================
   RENDER INVENTORY TABLE
========================================= */

function renderInventoryTable() {

    const tableBody = $("#inventoryTableBody");

    const start = (inventoryPage - 1) * INVENTORY_PAGE_SIZE;

    const pageProducts = filteredInventory.slice(
        start,
        start + INVENTORY_PAGE_SIZE
    );

    if (!pageProducts.length) {

        tableBody.html(`
            <tr>
                <td colspan="7" class="table-message">
                    No inventory products found.
                </td>
            </tr>
        `);

    } else {

        const rows = pageProducts.map(function (product) {

            const stockLevel = getInventoryStockLevel(product.qty);

            const statusClass = product.active
                ? "status-active"
                : "status-inactive";

            const statusText = product.active
                ? "Active"
                : "Inactive";

            return `
                <tr>

                    <td>
                        <span class="inventory-product-name">
                            ${escapeInventoryHTML(product.title)}
                        </span>

                        <span class="inventory-product-id">
                            ID: ${escapeInventoryHTML(product.id)}
                        </span>
                    </td>

                    <td>
                        <span class="inventory-category">
                            ${escapeInventoryHTML(
                                getInventoryCategoryName(product.categoryId)
                            )}
                        </span>
                    </td>

                    <td>
                        <span class="inventory-price">
                            ${formatInventoryCurrency(product.price)}
                        </span>
                    </td>

                    <td>
                        <span class="stock-quantity">
                            ${product.qty}
                        </span>
                    </td>

                    <td>
                        <span class="stock-level ${stockLevel.className}">
                            ${stockLevel.label}
                        </span>
                    </td>

                    <td>
                        <span class="status-badge ${statusClass}">
                            ${statusText}
                        </span>
                    </td>

                    <td>
                        <button
                            type="button"
                            class="stock-action-button edit-stock"
                            data-id="${escapeInventoryHTML(product.id)}">
                            Update Stock
                        </button>
                    </td>

                </tr>
            `;

        }).join("");

        tableBody.html(rows);

    }

    const total = filteredInventory.length;

    const first = total ? start + 1 : 0;

    const last = Math.min(
        start + INVENTORY_PAGE_SIZE,
        total
    );

    const totalPages = Math.ceil(
        total / INVENTORY_PAGE_SIZE
    );

    $("#inventoryResultCount").text(
        `${total} products`
    );

    $("#inventoryPaginationInfo").text(
        `Showing ${first}-${last} of ${total} products`
    );

    $("#inventoryCurrentPage").text(
        `${inventoryPage} / ${Math.max(1, totalPages)}`
    );

    $("#inventoryPrevious").prop(
        "disabled",
        inventoryPage <= 1
    );

    $("#inventoryNext").prop(
        "disabled",
        inventoryPage >= totalPages
    );

}

/* =========================================
   OPEN STOCK MODAL
========================================= */

function openStockModal(productId) {

    selectedInventoryProduct = inventoryProducts.find(
        product => product.id === productId
    );

    if (!selectedInventoryProduct) {
        showInventoryFeedback("Product not found.", "error");
        return;
    }

    $("#stockProductId").val(productId);

    $("#stockProductName").text(
        selectedInventoryProduct.title
    );

    $("#stockProductCategory").text(
        getInventoryCategoryName(
            selectedInventoryProduct.categoryId
        )
    );

    $("#currentStockQuantity").text(
        selectedInventoryProduct.qty
    );

    $("#newStockQuantity")
        .val(selectedInventoryProduct.qty)
        .attr("min", 0);

    $("#stockModal").addClass("show");

}

/* =========================================
   CLOSE STOCK MODAL
========================================= */

function closeStockModal() {

    $("#stockModal").removeClass("show");

    $("#stockForm")[0].reset();

    selectedInventoryProduct = null;

}

/* =========================================
   SAVE STOCK QUANTITY
========================================= */

async function saveStockQuantity(event) {

    event.preventDefault();

    const productId = $("#stockProductId").val();

    const quantity = Number($("#newStockQuantity").val());

    if (
        !Number.isInteger(quantity) ||
        quantity < 0
    ) {
        alert("Enter a valid non-negative whole number.");
        return;
    }

    const product = inventoryProducts.find(
        item => item.id === productId
    );

    if (!product) {
        showInventoryFeedback("Product not found.", "error");
        return;
    }

    const confirmed = window.confirm(
        `Update stock for "${product.title}" from ${product.qty} to ${quantity}?`
    );

    if (!confirmed) {
        return;
    }

    const button = $("#saveStockButton");

    button.prop("disabled", true).text("Updating...");

    try {

        await updateStockQuantity(productId, quantity);

        showInventoryFeedback(
            "Stock quantity updated successfully.",
            "success"
        );

        closeStockModal();

        await loadInventory();

    } catch (error) {

        console.error("Stock update error:", error);

        showInventoryFeedback(
            error.message || "Unable to update stock.",
            "error"
        );

    } finally {

        button.prop("disabled", false).text("Update Stock");

    }

}

/* =========================================
   FEEDBACK
========================================= */

function showInventoryFeedback(message, type) {

    $("#inventoryFeedback")
        .removeClass("error success")
        .addClass(type || "")
        .text(message);

}

/* =========================================
   FORMAT CURRENCY
========================================= */

function formatInventoryCurrency(amount) {

    return Number(amount || 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    });

}

/* =========================================
   HTML ESCAPING
========================================= */

function escapeInventoryHTML(value) {

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

function logoutInventoryAdmin() {

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
