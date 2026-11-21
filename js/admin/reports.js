
/* =========================================
   THE HAVEN - ADMIN REPORTS
   Customer, inventory and sales reports
========================================= */

const reportState = {
    rows: [],
    headers: [],
    categoryMap: {},
    reportTitle: "",
    reportDescription: "",
    summary: []
};

const reportElements = {
    group: document.getElementById("reportGroup"),
    type: document.getElementById("reportType"),
    start: document.getElementById("startDate"),
    end: document.getElementById("endDate"),
    category: document.getElementById("categorySelect"),
    categoryField: document.getElementById("categoryField"),
    dateFields: document.querySelectorAll(".date-field"),
    generate: document.getElementById("generateReportBtn"),
    refresh: document.getElementById("refreshReportBtn"),
    export: document.getElementById("exportReportBtn"),
    message: document.getElementById("reportMessage"),
    title: document.getElementById("resultsTitle"),
    description: document.getElementById("resultsDescription"),
    summary: document.getElementById("resultsSummary"),
    head: document.getElementById("reportTableHead"),
    body: document.getElementById("reportTableBody"),
    footer: document.getElementById("reportFooter")
};


/* -----------------------------------------
   REPORT CONFIGURATION
----------------------------------------- */

const reportOptions = {
    CUSTOMERS: [
        { value: "ALL_CUSTOMERS", label: "All customers", dates: false },
        { value: "TOP_CUSTOMERS", label: "Top 10 customers by purchase value", dates: true },
        { value: "CASH_CUSTOMERS", label: "Cash purchase report", dates: true },
        { value: "CREDIT_CUSTOMERS", label: "Credit purchase report", dates: true }
    ],

    INVENTORY: [
        { value: "ALL_STOCK", label: "Current stock - all products" },
        { value: "CATEGORY_STOCK", label: "Category-wise stock", category: true },
        { value: "HIGH_STOCK", label: "High stock (more than 100)" },
        { value: "LOW_STOCK", label: "Low stock (less than 15)" }
    ],

    SALES: [
        { value: "ALL_SALES", label: "Sales by date range", dates: true },
        { value: "CATEGORY_SALES", label: "Category-wise sales", dates: true, category: true },
        { value: "CASH_SALES", label: "Cash sales", dates: true },
        { value: "CREDIT_SALES", label: "Credit sales", dates: true },
        { value: "TOP_PRODUCTS", label: "Top 10 products", dates: true },
        { value: "BOTTOM_PRODUCTS", label: "Bottom 10 products", dates: true }
    ]
};


/* -----------------------------------------
   AUTHENTICATION
----------------------------------------- */

function validateReportsAdmin() {

    if (
        sessionStorage.getItem("havenAdminLoggedIn") !== "true" ||
        !sessionStorage.getItem("havenAdminUID")
    ) {
        window.location.href = "../auth.html";
        return false;
    }

    return true;
}


/* -----------------------------------------
   COMMON HELPERS
----------------------------------------- */

function reportEscape(value) {

    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);

}


function reportMoney(value) {

    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(Number(value) || 0);

}


function reportNumber(value) {

    return new Intl.NumberFormat("en-IN").format(Number(value) || 0);

}


function reportDate(value) {

    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });

}


function reportFirestoreValue(value) {

    if (!value) return null;

    if (value.stringValue !== undefined) return value.stringValue;
    if (value.integerValue !== undefined) return Number(value.integerValue);
    if (value.doubleValue !== undefined) return Number(value.doubleValue);
    if (value.booleanValue !== undefined) return value.booleanValue;
    if (value.timestampValue !== undefined) return value.timestampValue;

    if (value.mapValue !== undefined) {

        const result = {};

        Object.entries(value.mapValue.fields || {}).forEach(([key, field]) => {
            result[key] = reportFirestoreValue(field);
        });

        return result;
    }

    if (value.arrayValue !== undefined) {
        return (value.arrayValue.values || []).map(reportFirestoreValue);
    }

    return null;
}


function reportDocument(document) {

    const fields = document?.fields || {};
    const result = {};

    Object.entries(fields).forEach(([key, value]) => {
        result[key] = reportFirestoreValue(value);
    });

    result.id = document?.name
        ? document.name.split("/").pop()
        : document?.id || "";

    return result;
}


function reportDocuments(rows) {

    return (rows || [])
        .filter(row => row && row.document)
        .map(row => reportDocument(row.document));

}


function reportMessage(message, isError = true) {

    reportElements.message.textContent = message;

    reportElements.message.style.color = isError
        ? "#a15d50"
        : "#54785b";

}


function setReportResults(title, description, headers, rows, summary = []) {

    reportState.reportTitle = title;
    reportState.reportDescription = description;
    reportState.headers = headers;
    reportState.rows = rows;
    reportState.summary = summary;

    reportElements.title.textContent = title;
    reportElements.description.textContent = description;

    reportElements.summary.innerHTML = summary.map(item => `
        <div class="summary-chip">
            ${reportEscape(item.label)}
            <strong>${reportEscape(item.value)}</strong>
        </div>
    `).join("");

    reportElements.head.innerHTML = `
        <tr>
            ${headers.map(header => `
                <th>${reportEscape(header.label)}</th>
            `).join("")}
        </tr>
    `;

    if (!rows.length) {

        reportElements.body.innerHTML = `
            <tr>
                <td colspan="${headers.length}" class="empty-report">
                    No records found for this report.
                </td>
            </tr>
        `;

    } else {

        reportElements.body.innerHTML = rows.map(row => `
            <tr>
                ${headers.map(header => `
                    <td>${reportEscape(row[header.key] ?? "—")}</td>
                `).join("")}
            </tr>
        `).join("");

    }

    reportElements.footer.textContent =
        `${reportNumber(rows.length)} record(s)`;

    reportElements.export.disabled = rows.length === 0;

}


function showReportLoading() {

    reportElements.body.innerHTML = `
        <tr>
            <td colspan="10" class="empty-report">
                Generating report...
            </td>
        </tr>
    `;

    reportElements.export.disabled = true;

}


/* -----------------------------------------
   DATE VALIDATION
----------------------------------------- */

function validateSelectedDates() {

    const start = reportElements.start.value;
    const end = reportElements.end.value;

    if (!start || !end) {
        throw new Error("Please select both start and end dates.");
    }

    if (start > end) {
        throw new Error("Start date cannot be after end date.");
    }

    return { start, end };
}


/* -----------------------------------------
   LOAD CATEGORIES
----------------------------------------- */

async function loadReportCategories() {

    const token = getAdminIdToken();

    if (!token) {
        throw new Error("Admin login required.");
    }

    const response = await firestoreRequest({
        path: "categories",
        method: "GET",
        token: token,
        query: { pageSize: 100 }
    });

    const categories = response.documents || [];

    reportState.categoryMap = {};

    categories.forEach(document => {

        const category = reportDocument(document);

        reportState.categoryMap[category.id] =
            category.name || category.title || category.id;

    });

    reportElements.category.innerHTML = `
        <option value="">All categories</option>
        ${Object.entries(reportState.categoryMap).map(([id, name]) => `
            <option value="${reportEscape(id)}">
                ${reportEscape(name)}
            </option>
        `).join("")}
    `;

}


/* -----------------------------------------
   SUMMARY CARDS
----------------------------------------- */

async function loadReportOverview() {

    try {

        const [customers, products, orders] = await Promise.all([
            loadAllReportCustomers(),
            getAllInventory(1000),
            getSalesReport(
                reportElements.start.value,
                reportElements.end.value
            )
        ]);

        const inventory = (products || []).map(item =>
            reportDocument(item.document || item)
        );

        const stockUnits = inventory.reduce(
            (total, item) => total + (Number(item.qty) || 0),
            0
        );

        document.getElementById("customerCount").textContent =
            reportNumber(customers.length);

        document.getElementById("productCount").textContent =
            reportNumber(inventory.length);

        document.getElementById("stockCount").textContent =
            reportNumber(stockUnits);

        document.getElementById("orderCount").textContent =
            reportNumber(reportDocuments(orders).length);

    } catch (error) {

        console.error("Report overview error:", error);

    }

}


/* -----------------------------------------
   CUSTOMER REPORT DATA
----------------------------------------- */

async function loadAllReportCustomers() {

    const customers = [];
    let pageToken = null;

    do {

        const response = await getAllCustomerReport(100, pageToken);

        (response.documents || []).forEach(document => {
            customers.push(reportDocument(document));
        });

        pageToken = response.nextPageToken || null;

    } while (pageToken);

    return customers;

}


async function generateAllCustomersReport() {

    const customers = await loadAllReportCustomers();

    const rows = customers.map(customer => ({
        id: customer.id,
        name: customer.name || "—",
        email: customer.email || "—",
        mobile: customer.mobile || "—",
        creditLimit: reportMoney(customer.creditLimit),
        creditUsed: reportMoney(customer.creditUsed),
        active: customer.active ? "Active" : "Inactive"
    }));

    setReportResults(
        "All customers",
        "Complete customer records registered in THE HAVEN.",
        [
            { key: "id", label: "Customer ID" },
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "mobile", label: "Mobile" },
            { key: "creditLimit", label: "Credit limit" },
            { key: "creditUsed", label: "Credit used" },
            { key: "active", label: "Status" }
        ],
        rows,
        [{ label: "Total customers", value: rows.length }]
    );

}


async function generateTopCustomersReport(start, end) {

    const customers = await getTop10Customers(start, end);

    const rows = customers.map((customer, index) => ({
        rank: index + 1,
        customerId: customer.customerId,
        name: customer.name,
        email: customer.email,
        mobile: customer.mobile,
        totalPurchase: reportMoney(customer.totalPurchase)
    }));

    setReportResults(
        "Top 10 customers",
        `Highest purchase value from ${start} to ${end}.`,
        [
            { key: "rank", label: "Rank" },
            { key: "customerId", label: "Customer ID" },
            { key: "name", label: "Customer" },
            { key: "email", label: "Email" },
            { key: "mobile", label: "Mobile" },
            { key: "totalPurchase", label: "Purchase value" }
        ],
        rows,
        [{ label: "Customers shown", value: rows.length }]
    );

}


/* -----------------------------------------
   PURCHASE / SALES REPORTS
----------------------------------------- */

function purchaseRows(rows) {

    return reportDocuments(rows)
        .filter(order => order.orderStatus !== "CANCELLED")
        .map(order => ({
            orderId: order.id,
            customerId: order.customerId || "—",
            date: reportDate(order.createdAt),
            paymentMethod: order.paymentMethod || "—",
            totalAmount: reportMoney(order.totalAmount),
            orderStatus: order.orderStatus || "—"
        }));

}


async function generatePurchaseMethodReport(start, end, method) {

    const result = method === "CASH"
        ? await getCashPurchaseReport(start, end)
        : await getCreditPurchaseReport(start, end);

    const rows = purchaseRows(result);

    const total = reportDocuments(result)
        .filter(order => order.orderStatus !== "CANCELLED")
        .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

    setReportResults(
        `${method === "CASH" ? "Cash" : "Credit"} purchase report`,
        `Customer ${method.toLowerCase()} purchases from ${start} to ${end}.`,
        [
            { key: "orderId", label: "Order ID" },
            { key: "customerId", label: "Customer ID" },
            { key: "date", label: "Order date" },
            { key: "paymentMethod", label: "Payment method" },
            { key: "totalAmount", label: "Amount" },
            { key: "orderStatus", label: "Order status" }
        ],
        rows,
        [
            { label: "Orders", value: rows.length },
            { label: "Purchase value", value: reportMoney(total) }
        ]
    );

}


async function generateSalesReport(start, end) {

    const result = await getSalesReport(start, end);
    const orders = reportDocuments(result)
        .filter(order => order.orderStatus !== "CANCELLED");

    const rows = orders.map(order => ({
        orderId: order.id,
        customerId: order.customerId || "—",
        date: reportDate(order.createdAt),
        paymentMethod: order.paymentMethod || "—",
        amount: reportMoney(order.totalAmount),
        status: order.orderStatus || "—"
    }));

    const total = orders.reduce(
        (sum, order) => sum + Number(order.totalAmount || 0),
        0
    );

    setReportResults(
        "Sales by date range",
        `Sales records from ${start} to ${end}, excluding cancelled orders.`,
        [
            { key: "orderId", label: "Order ID" },
            { key: "customerId", label: "Customer ID" },
            { key: "date", label: "Date" },
            { key: "paymentMethod", label: "Payment" },
            { key: "amount", label: "Amount" },
            { key: "status", label: "Order status" }
        ],
        rows,
        [
            { label: "Total orders", value: rows.length },
            { label: "Sales value", value: reportMoney(total) }
        ]
    );

}


async function generateCategorySalesReport(start, end) {

    const result = await getCategorySalesReport(start, end);

    let rows = result.map(item => ({
        categoryId: item.categoryId,
        category: reportState.categoryMap[item.categoryId] || item.categoryId,
        quantitySold: Number(item.quantitySold || 0),
        salesValue: Number(item.salesValue || 0)
    }));

    const selectedCategory = reportElements.category.value;

    if (selectedCategory) {
        rows = rows.filter(row => row.categoryId === selectedCategory);
    }

    rows = rows.map(row => ({
        category: row.category,
        quantitySold: reportNumber(row.quantitySold),
        salesValue: reportMoney(row.salesValue)
    }));

    setReportResults(
        "Category-wise sales",
        `Sales grouped by product category from ${start} to ${end}.`,
        [
            { key: "category", label: "Category" },
            { key: "quantitySold", label: "Quantity sold" },
            { key: "salesValue", label: "Sales value" }
        ],
        rows
    );

}


async function generateTopBottomProductsReport(start, end, type) {

    const result = type === "TOP_PRODUCTS"
        ? await getTop10Products(start, end)
        : await getBottom10Products(start, end);

    const rows = result.map((item, index) => ({
        rank: index + 1,
        productId: item.productId,
        title: item.title,
        quantitySold: reportNumber(item.quantitySold),
        salesValue: reportMoney(item.salesValue)
    }));

    setReportResults(
        type === "TOP_PRODUCTS" ? "Top 10 products" : "Bottom 10 products",
        `Product performance from ${start} to ${end}, ranked by quantity sold.`,
        [
            { key: "rank", label: "Rank" },
            { key: "productId", label: "Product ID" },
            { key: "title", label: "Product" },
            { key: "quantitySold", label: "Quantity sold" },
            { key: "salesValue", label: "Sales value" }
        ],
        rows
    );

}


/* -----------------------------------------
   INVENTORY REPORTS
----------------------------------------- */

async function generateInventoryReport(type) {

    let products = [];

    if (type === "ALL_STOCK") {
        products = await getStockReport(1000);
    }

    if (type === "CATEGORY_STOCK") {

        const categoryId = reportElements.category.value;

        if (!categoryId) {
            throw new Error("Please select a category.");
        }

        products = await getCategoryStockReport(categoryId, 1000);

    }

    if (type === "HIGH_STOCK") {
        products = await getHighStockReport(1000);
    }

    if (type === "LOW_STOCK") {
        products = await getLowStockReport(1000);
    }

    const normalized = (products || []).map(item =>
        reportDocument(item.document || item)
    );

    const rows = normalized.map(product => ({
        productId: product.id,
        title: product.title || "—",
        category: reportState.categoryMap[product.categoryId] ||
            product.categoryId || "—",
        quantity: reportNumber(product.qty),
        price: reportMoney(product.price),
        stockValue: reportMoney(
            (Number(product.qty) || 0) * (Number(product.price) || 0)
        ),
        status: product.active ? "Active" : "Inactive"
    }));

    const units = normalized.reduce(
        (sum, product) => sum + (Number(product.qty) || 0),
        0
    );

    setReportResults(
        reportOptions.INVENTORY.find(option => option.value === type).label,
        "Current inventory quantities and estimated stock value.",
        [
            { key: "productId", label: "Product ID" },
            { key: "title", label: "Product" },
            { key: "category", label: "Category" },
            { key: "quantity", label: "Quantity" },
            { key: "price", label: "Unit price" },
            { key: "stockValue", label: "Stock value" },
            { key: "status", label: "Status" }
        ],
        rows,
        [
            { label: "Products", value: rows.length },
            { label: "Total units", value: reportNumber(units) }
        ]
    );

}


/* -----------------------------------------
   GENERATE SELECTED REPORT
----------------------------------------- */

async function generateSelectedReport() {

    reportMessage("");

    const group = reportElements.group.value;
    const type = reportElements.type.value;

    showReportLoading();

    reportElements.generate.disabled = true;
    reportElements.generate.textContent = "Generating...";

    try {

        let dates = null;

        const option = reportOptions[group].find(item =>
            item.value === type
        );

        if (option?.dates) {
            dates = validateSelectedDates();
        }

        if (group === "CUSTOMERS") {

            if (type === "ALL_CUSTOMERS") {
                await generateAllCustomersReport();
            }

            if (type === "TOP_CUSTOMERS") {
                await generateTopCustomersReport(dates.start, dates.end);
            }

            if (type === "CASH_CUSTOMERS") {
                await generatePurchaseMethodReport(
                    dates.start,
                    dates.end,
                    "CASH"
                );
            }

            if (type === "CREDIT_CUSTOMERS") {
                await generatePurchaseMethodReport(
                    dates.start,
                    dates.end,
                    "CREDIT"
                );
            }

        }

        if (group === "INVENTORY") {
            await generateInventoryReport(type);
        }

        if (group === "SALES") {

            if (type === "ALL_SALES") {
                await generateSalesReport(dates.start, dates.end);
            }

            if (type === "CATEGORY_SALES") {
                await generateCategorySalesReport(dates.start, dates.end);
            }

            if (type === "CASH_SALES") {
                await generatePurchaseMethodReport(
                    dates.start,
                    dates.end,
                    "CASH"
                );
            }

            if (type === "CREDIT_SALES") {
                await generatePurchaseMethodReport(
                    dates.start,
                    dates.end,
                    "CREDIT"
                );
            }

            if (type === "TOP_PRODUCTS" || type === "BOTTOM_PRODUCTS") {
                await generateTopBottomProductsReport(
                    dates.start,
                    dates.end,
                    type
                );
            }

        }

        reportMessage("Report generated successfully.", false);

    } catch (error) {

        console.error("Report generation error:", error);

        reportMessage(error.message || "Unable to generate report.");

        reportElements.body.innerHTML = `
            <tr>
                <td colspan="10" class="empty-report">
                    Report could not be generated.
                </td>
            </tr>
        `;

        reportElements.export.disabled = true;

    } finally {

        reportElements.generate.disabled = false;
        reportElements.generate.textContent = "Generate report";

    }

}


/* -----------------------------------------
   FILTER VISIBILITY
----------------------------------------- */

function updateReportControls() {

    const group = reportElements.group.value;
    const options = reportOptions[group];

    reportElements.type.innerHTML = options.map(option => `
        <option value="${option.value}">${reportEscape(option.label)}</option>
    `).join("");

    updateReportFieldVisibility();

}


function updateReportFieldVisibility() {

    const group = reportElements.group.value;
    const type = reportElements.type.value;

    const option = reportOptions[group].find(item =>
        item.value === type
    );

    const showDates = Boolean(option?.dates);
    const showCategory = Boolean(option?.category);

    reportElements.dateFields.forEach(field => {
        field.style.display = showDates ? "flex" : "none";
    });

    reportElements.categoryField.style.display =
        showCategory ? "flex" : "none";

}


/* -----------------------------------------
   CSV EXPORT
----------------------------------------- */

function exportReportCSV() {

    if (!reportState.rows.length || !reportState.headers.length) {
        return;
    }

    const headings = reportState.headers.map(header => header.label);

    const csvRows = reportState.rows.map(row =>
        reportState.headers.map(header => {

            const value = String(row[header.key] ?? "")
                .replace(/"/g, '""');

            return `"${value}"`;

        }).join(",")
    );

    const csv = [
        headings.map(value => `"${value}"`).join(","),
        ...csvRows
    ].join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const filename = reportState.reportTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    link.href = url;
    link.download = `haven-${filename}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

}


/* -----------------------------------------
   EVENT LISTENERS
----------------------------------------- */

reportElements.group.addEventListener("change", updateReportControls);

reportElements.type.addEventListener("change", updateReportFieldVisibility);

reportElements.generate.addEventListener("click", generateSelectedReport);

reportElements.export.addEventListener("click", exportReportCSV);

reportElements.refresh.addEventListener("click", async () => {

    reportMessage("");

    try {

        await loadReportCategories();
        await loadReportOverview();

        reportMessage("Report overview refreshed.", false);

    } catch (error) {

        reportMessage(error.message || "Unable to refresh report overview.");

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

async function initializeReportsPage() {

    if (!validateReportsAdmin()) return;

    updateReportControls();

    const today = new Date();
    const monthAgo = new Date();

    monthAgo.setDate(today.getDate() - 30);

    reportElements.start.value = monthAgo.toISOString().slice(0, 10);
    reportElements.end.value = today.toISOString().slice(0, 10);

    try {

        await loadReportCategories();
        await loadReportOverview();

    } catch (error) {

        console.error("Reports initialization error:", error);
        reportMessage(error.message || "Unable to load report overview.");

    }

}

initializeReportsPage();
