$(document).ready(function () {

    const ADMIN_UID = "TTyXkTb0h8ZzJjErDRe3t9roLfU2";
    const PAGE_SIZE = 8;

    let products = [];
    let categories = [];
    let currentPage = 1;
    let editingProductId = null;

    const currency = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    });


    // =====================================
    // ADMIN SESSION
    // =====================================

    function checkAdminSession() {

        const loggedIn =
            sessionStorage.getItem("havenAdminLoggedIn") === "true";

        const uid =
            sessionStorage.getItem("havenAdminUID");

        const token =
            sessionStorage.getItem("havenAdminToken");

        if (!loggedIn || uid !== ADMIN_UID || !token) {
            logoutAdmin();
            window.location.replace("../auth.html");
            return false;
        }

        return true;
    }

    if (!checkAdminSession()) {
        return;
    }

    $("#adminEmail").text(
        sessionStorage.getItem("havenAdminEmail") || "Admin Account"
    );

    $("#adminLogout").on("click", function () {
        if (confirm("Are you sure you want to sign out?")) {
            logoutAdmin();
            window.location.replace("../auth.html");
        }
    });


    // =====================================
    // FIRESTORE FIELD HELPERS
    // =====================================

    function readField(document, fieldName, type, fallback = "") {

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
        return document.name.split("/").pop();
    }

    function normalizeProduct(document) {

        return {
            id: getDocumentId(document),
            categoryId: readField(document, "categoryId", "stringValue"),
            title: readField(document, "title", "stringValue"),
            description: readField(document, "description", "stringValue"),
            qty: readField(document, "qty", "integerValue", 0),
            price: readField(document, "price", "doubleValue", 0),
            imageUrl: readField(document, "imageUrl", "stringValue"),
            active: readField(document, "active", "booleanValue", false)
        };
    }

    function escapeHTML(value) {

        return String(value).replace(/[&<>"']/g, function (character) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            }[character];
        });
    }


    // =====================================
    // LOAD CATEGORIES
    // =====================================

    async function loadCategories() {

        const previousFilter =
            $("#categoryFilter").val() || "all";

        const previousProductCategory =
            $("#productCategory").val() || "";

        const response = await getCategories(100);

        categories = (response.documents || [])
            .map(function (document) {

                return {
                    id: getDocumentId(document),
                    name: readField(document, "name", "stringValue"),
                    active: readField(
                        document,
                        "active",
                        "booleanValue",
                        true
                    )
                };

            })
            .sort((a, b) => a.name.localeCompare(b.name));


        // All categories appear in the product filter.
        const filterOptions = categories.map(function (category) {

            return `
                <option value="${escapeHTML(category.id)}">
                    ${escapeHTML(category.name)}
                    ${category.active ? "" : " (Inactive)"}
                </option>
            `;

        }).join("");


        // Only active categories can be assigned to new products.
        const activeOptions = categories
            .filter(category => category.active)
            .map(function (category) {

                return `
                    <option value="${escapeHTML(category.id)}">
                        ${escapeHTML(category.name)}
                    </option>
                `;

            })
            .join("");


        $("#categoryFilter").html(`
            <option value="all">All Categories</option>
            ${filterOptions}
        `);

        if (
            categories.some(category =>
                category.id === previousFilter
            )
        ) {
            $("#categoryFilter").val(previousFilter);
        } else {
            $("#categoryFilter").val("all");
        }


        $("#productCategory").html(`
            <option value="">Select category</option>
            ${activeOptions}
        `);

        if (
            previousProductCategory &&
            categories.some(category =>
                category.id === previousProductCategory &&
                category.active
            )
        ) {
            $("#productCategory").val(previousProductCategory);
        }

        renderCategories();
    }


    // =====================================
    // DISPLAY CATEGORIES
    // =====================================

    function renderCategories() {

        if (categories.length === 0) {

            $("#categoriesTableBody").html(`
                <tr>
                    <td colspan="4">
                        No categories found. Add your first category.
                    </td>
                </tr>
            `);

            return;
        }

        const rows = categories.map(function (category) {

            const productCount = products.filter(product =>
                product.categoryId === category.id
            ).length;

            const statusClass = category.active
                ? "status-active"
                : "status-inactive";

            const statusText = category.active
                ? "Active"
                : "Inactive";

            return `
                <tr>

                    <td>
                        ${escapeHTML(category.name)}
                    </td>

                    <td class="category-count">
                        ${productCount}
                    </td>

                    <td>
                        <span class="status-label ${statusClass}">
                            ${statusText}
                        </span>
                    </td>

                    <td>

                        <div class="category-actions">

                            <button
                                type="button"
                                data-category-action="edit"
                                data-id="${escapeHTML(category.id)}">
                                Edit
                            </button>

                            <button
                                type="button"
                                data-category-action="toggle"
                                data-id="${escapeHTML(category.id)}">
                                ${category.active ? "Deactivate" : "Activate"}
                            </button>

                            <button
                                type="button"
                                class="category-delete-button"
                                data-category-action="delete"
                                data-id="${escapeHTML(category.id)}">
                                Delete
                            </button>

                        </div>

                    </td>

                </tr>
            `;

        }).join("");

        $("#categoriesTableBody").html(rows);
    }


    // =====================================
    // CATEGORY FEEDBACK
    // =====================================

    function showCategoryFeedback(message, isError = false) {

        $("#categoryFeedback")
            .text(message)
            .css(
                "color",
                isError ? "#a34c42" : "#456b52"
            );
    }


    // =====================================
    // OPEN / CLOSE CATEGORY FORM
    // =====================================

    function openCategoryModal(category = null) {

        $("#categoryForm")[0].reset();

        $("#categoryId").val(
            category ? category.id : ""
        );

        $("#categoryModalTitle").text(
            category ? "Edit Category" : "Add Category"
        );

        $("#saveCategoryButton").text(
            category ? "Update Category" : "Save Category"
        );

        $("#categoryFormFeedback").text("");

        $("#categoryModal").prop("hidden", false);

        $("#categoryName").trigger("focus");
    }


    function closeCategoryModal() {

        $("#categoryModal").prop("hidden", true);

        $("#categoryForm")[0].reset();
    }


    $("#addCategoryButton").on("click", function () {
        openCategoryModal();
    });


    $("#closeCategoryModal, #cancelCategoryForm").on(
        "click",
        closeCategoryModal
    );


    $("#categoryModal").on("click", function (event) {

        if (event.target === this) {
            closeCategoryModal();
        }

    });


    // =====================================
    // CHECK PRODUCT USAGE BEFORE DELETING
    // =====================================

    async function countProductsInCategory(categoryId) {

        let count = 0;
        let pageToken = null;

        do {

            const response = await getProducts(1000, pageToken);

            (response.documents || []).forEach(function (document) {

                const productCategoryId = readField(
                    document,
                    "categoryId",
                    "stringValue"
                );

                if (productCategoryId === categoryId) {
                    count++;
                }

            });

            pageToken = response.nextPageToken || null;

        } while (pageToken);

        return count;
    }


    // =====================================
    // ADD / UPDATE CATEGORY
    // =====================================

    $("#categoryForm").on("submit", async function (event) {

        event.preventDefault();

        const id = $("#categoryId").val();

        const name = $("#categoryName")
            .val()
            .trim()
            .replace(/\s+/g, " ");

        const saveButton = $("#saveCategoryButton");

        if (!name) {

            $("#categoryFormFeedback").text(
                "Please enter a category name."
            );

            return;
        }

        const duplicate = categories.some(category =>

            category.id !== id &&
            category.name.toLowerCase() === name.toLowerCase()

        );

        if (duplicate) {

            $("#categoryFormFeedback").text(
                "A category with this name already exists."
            );

            return;
        }

        saveButton
            .prop("disabled", true)
            .text("Saving...");

        try {

            if (id) {

                await updateCategory(id, name);

                showCategoryFeedback(
                    "Category updated successfully."
                );

            } else {

                await createCategory(name);

                showCategoryFeedback(
                    "Category created successfully."
                );

            }

            closeCategoryModal();

            await loadCategories();

            renderProducts();

        } catch (error) {

            console.error("Category save error:", error);

            $("#categoryFormFeedback").text(
                error.response?.data?.error?.message ||
                error.message ||
                "Unable to save category."
            );

        } finally {

            saveButton
                .prop("disabled", false)
                .text(id ? "Update Category" : "Save Category");

        }

    });


    // =====================================
    // EDIT / ACTIVATE / DEACTIVATE / DELETE
    // CATEGORY ACTIONS
    // =====================================

    $(document).on(
        "click",
        "[data-category-action]",
        async function () {

            const action = $(this).data("category-action");

            const id = String($(this).data("id"));

            const category = categories.find(item =>
                item.id === id
            );

            if (!category) {

                showCategoryFeedback(
                    "Category not found. Refresh the page and try again.",
                    true
                );

                return;
            }


            // EDIT CATEGORY

            if (action === "edit") {

                openCategoryModal(category);

                return;
            }


            // ACTIVATE / DEACTIVATE CATEGORY

            if (action === "toggle") {

                const newStatus = !category.active;

                const confirmation = confirm(
                    `Are you sure you want to ${
                        newStatus ? "activate" : "deactivate"
                    } the category "${category.name}"?`
                );

                if (!confirmation) {
                    return;
                }

                try {

                    await updateCategoryStatus(id, newStatus);

                    await loadCategories();

                    showCategoryFeedback(
                        `Category ${
                            newStatus ? "activated" : "deactivated"
                        } successfully.`
                    );

                    renderProducts();

                } catch (error) {

                    console.error(
                        "Category status error:",
                        error
                    );

                    showCategoryFeedback(
                        error.response?.data?.error?.message ||
                        error.message ||
                        "Unable to update category status.",
                        true
                    );

                }

                return;
            }


            // DELETE CATEGORY

            if (action === "delete") {

                const confirmation = confirm(
                    `Permanently delete the category "${category.name}"? This cannot be undone.`
                );

                if (!confirmation) {
                    return;
                }

                try {

                    showCategoryFeedback(
                        "Checking whether products use this category..."
                    );

                    const productCount =
                        await countProductsInCategory(id);

                    if (productCount > 0) {

                        showCategoryFeedback(
                            `Cannot delete this category because ${productCount} product(s) still use it. Reassign or delete those products first.`,
                            true
                        );

                        return;
                    }

                    await deleteCategory(id);

                    await loadCategories();

                    showCategoryFeedback(
                        "Category deleted successfully."
                    );

                    renderProducts();

                } catch (error) {

                    console.error(
                        "Category deletion error:",
                        error
                    );

                    showCategoryFeedback(
                        error.response?.data?.error?.message ||
                        error.message ||
                        "Unable to delete category.",
                        true
                    );

                }

            }

        }
    );


    // =====================================
    // GET CATEGORY NAME
    // =====================================

    function getCategoryName(categoryId) {

        const category = categories.find(item =>
            item.id === categoryId
        );

        return category
            ? category.name
            : "Unknown category";
    }


    // =====================================
    // LOAD ALL PRODUCTS
    // =====================================

    async function loadProducts() {

        showFeedback("Loading products...");

        try {

            let allDocuments = [];

            let pageToken = null;

            do {

                const response = await getProducts(
                    1000,
                    pageToken
                );

                allDocuments = allDocuments.concat(
                    response.documents || []
                );

                pageToken = response.nextPageToken || null;

            } while (pageToken);

            products = allDocuments.map(normalizeProduct);

            currentPage = 1;

            updateStatistics();

            renderProducts();

            renderCategories();

            showFeedback(
                products.length + " products loaded."
            );

        } catch (error) {

            console.error("Product loading error:", error);

            showFeedback(
                error.response?.data?.error?.message ||
                error.message ||
                "Unable to load products.",
                true
            );

        }

    }


    // =====================================
    // PRODUCT STATISTICS
    // =====================================

    function updateStatistics() {

        $("#totalProducts").text(products.length);

        $("#activeProducts").text(
            products.filter(product =>
                product.active
            ).length
        );

        $("#inactiveProducts").text(
            products.filter(product =>
                !product.active
            ).length
        );

        $("#lowStockProducts").text(
            products.filter(product =>
                product.qty < 15 && product.active
            ).length
        );

    }


    // =====================================
    // FILTER PRODUCTS
    // =====================================

    function getFilteredProducts() {

        const search = $("#productSearch")
            .val()
            .trim()
            .toLowerCase();

        const category = $("#categoryFilter").val();

        const status = $("#statusFilter").val();

        return products.filter(function (product) {

            const matchesSearch =
                product.title.toLowerCase().includes(search);

            const matchesCategory =
                category === "all" ||
                product.categoryId === category;

            const matchesStatus =
                status === "all" ||
                (status === "active" && product.active) ||
                (status === "inactive" && !product.active);

            return (
                matchesSearch &&
                matchesCategory &&
                matchesStatus
            );

        });

    }


    // =====================================
    // DISPLAY PRODUCTS
    // =====================================

    function renderProducts() {

        const filteredProducts = getFilteredProducts();

        const totalPages = Math.max(
            1,
            Math.ceil(filteredProducts.length / PAGE_SIZE)
        );

        if (currentPage > totalPages) {
            currentPage = totalPages;
        }

        const start = (currentPage - 1) * PAGE_SIZE;

        const visibleProducts = filteredProducts.slice(
            start,
            start + PAGE_SIZE
        );

        if (visibleProducts.length === 0) {

            $("#productsTableBody").html(`
                <tr>
                    <td colspan="6">No products found.</td>
                </tr>
            `);

        } else {

            let html = "";

            visibleProducts.forEach(function (product) {

                const statusClass = product.active
                    ? "status-active"
                    : "status-inactive";

                const statusText = product.active
                    ? "Active"
                    : "Inactive";

                const stockClass = product.qty < 15
                    ? "stock-low"
                    : "";

                const image = product.imageUrl ||
                    "https://placehold.co/100x100?text=Product";

                html += `
                    <tr>

                        <td>
                            <div class="product-cell">

                                <img
                                    src="${escapeHTML(image)}"
                                    alt="${escapeHTML(product.title)}"
                                    onerror="this.onerror=null;this.src='https://placehold.co/100x100?text=Product';"
                                >

                                <div>
                                    <strong>${escapeHTML(product.title)}</strong>
                                    <small>ID: ${escapeHTML(product.id)}</small>
                                </div>

                            </div>
                        </td>

                        <td>
                            ${escapeHTML(
                                getCategoryName(product.categoryId)
                            )}
                        </td>

                        <td>
                            ${currency.format(product.price)}
                        </td>

                        <td class="${stockClass}">
                            ${product.qty}
                        </td>

                        <td>
                            <span class="status-label ${statusClass}">
                                ${statusText}
                            </span>
                        </td>

                        <td>

                            <div class="action-buttons">

                                <button
                                    data-action="edit"
                                    data-id="${escapeHTML(product.id)}">
                                    Edit
                                </button>

                                <button
                                    data-action="toggle"
                                    data-id="${escapeHTML(product.id)}">
                                    ${product.active ? "Deactivate" : "Activate"}
                                </button>

                                <button
                                    class="delete-button"
                                    data-action="delete"
                                    data-id="${escapeHTML(product.id)}">
                                    Delete
                                </button>

                            </div>

                        </td>

                    </tr>
                `;

            });

            $("#productsTableBody").html(html);

        }

        const firstItem = filteredProducts.length === 0
            ? 0
            : start + 1;

        const lastItem = Math.min(
            start + PAGE_SIZE,
            filteredProducts.length
        );

        $("#paginationInfo").text(
            `Showing ${firstItem}-${lastItem} of ${filteredProducts.length} products`
        );

        $("#currentPage").text(
            `${currentPage} / ${totalPages}`
        );

        $("#previousPage").prop(
            "disabled",
            currentPage === 1
        );

        $("#nextPage").prop(
            "disabled",
            currentPage >= totalPages
        );

    }


    // =====================================
    // PRODUCT FEEDBACK
    // =====================================

    function showFeedback(message, isError = false) {

        $("#productFeedback")
            .text(message)
            .css(
                "color",
                isError ? "#a34c42" : "#456b52"
            );

    }


    // =====================================
    // OPEN / CLOSE PRODUCT FORM
    // =====================================

    function openProductModal(product = null) {

        $("#productForm")[0].reset();

        editingProductId = product
            ? product.id
            : null;

        $("#productId").val(
            product ? product.id : ""
        );

        $("#modalTitle").text(
            product ? "Edit Product" : "Add Product"
        );

        $("#saveProductButton").text(
            product ? "Update Product" : "Save Product"
        );

        if (product) {

            const selectedCategory = categories.find(item =>
                item.id === product.categoryId
            );

            // Keep an inactive category selectable when editing
            // an existing product assigned to that category.

            if (
                selectedCategory &&
                !selectedCategory.active &&
                $("#productCategory option").filter(function () {
                    return this.value === product.categoryId;
                }).length === 0
            ) {

                $("#productCategory").append(`
                    <option value="${escapeHTML(selectedCategory.id)}">
                        ${escapeHTML(selectedCategory.name)}
                        (Inactive - existing product)
                    </option>
                `);

            }

            $("#productCategory").val(product.categoryId);

            $("#productTitle").val(product.title);

            $("#productDescription").val(product.description);

            $("#productQuantity").val(product.qty);

            $("#productPrice").val(product.price);

            $("#productImage").val(product.imageUrl);

        }

        $("#formFeedback").text("");

        $("#productModal").prop("hidden", false);

    }


    function closeProductModal() {

        $("#productModal").prop("hidden", true);

        $("#productForm")[0].reset();

        editingProductId = null;

    }


    $("#addProductButton").on("click", function () {

        openProductModal();

    });


    $("#closeProductModal, #cancelProductForm").on(
        "click",
        function () {
            closeProductModal();
        }
    );


    $("#productModal").on("click", function (event) {

        if (event.target === this) {
            closeProductModal();
        }

    });


    // =====================================
    // ADD / UPDATE PRODUCT
    // =====================================

    $("#productForm").on("submit", async function (event) {

        event.preventDefault();

        const product = {

            categoryId: $("#productCategory").val(),

            title: $("#productTitle").val().trim(),

            description: $("#productDescription").val().trim(),

            qty: Number($("#productQuantity").val()),

            price: Number($("#productPrice").val()),

            imageUrl: $("#productImage").val().trim()

        };


        if (
            !product.categoryId ||
            !product.title ||
            !product.description ||
            !Number.isInteger(product.qty) ||
            product.qty < 0 ||
            !Number.isFinite(product.price) ||
            product.price < 0
        ) {

            $("#formFeedback").text(
                "Please enter valid values in all required fields."
            );

            return;
        }


        if (
            product.imageUrl &&
            !/^https?:\/\/\S+$/i.test(product.imageUrl)
        ) {

            $("#formFeedback").text(
                "Please enter a valid HTTP or HTTPS image URL."
            );

            return;
        }


        const selectedCategory = categories.find(category =>
            category.id === product.categoryId
        );

        if (!selectedCategory) {

            $("#formFeedback").text(
                "Please select a valid category."
            );

            return;
        }

        if (
            !editingProductId &&
            !selectedCategory.active
        ) {

            $("#formFeedback").text(
                "Please select an active category."
            );

            return;
        }


        const button = $("#saveProductButton");

        button
            .prop("disabled", true)
            .text("Saving...");

        try {

            if (editingProductId) {

                await updateProduct(
                    editingProductId,
                    product
                );

                showFeedback(
                    "Product updated successfully."
                );

            } else {

                await createProduct(product);

                showFeedback(
                    "Product added successfully."
                );

            }

            closeProductModal();

            await loadProducts();

        } catch (error) {

            console.error("Product save error:", error);

            $("#formFeedback").text(
                error.response?.data?.error?.message ||
                error.message ||
                "Unable to save product."
            );

        } finally {

            button
                .prop("disabled", false)
                .text(
                    editingProductId
                        ? "Update Product"
                        : "Save Product"
                );

        }

    });


    // =====================================
    // EDIT / ACTIVATE / DEACTIVATE / DELETE
    // PRODUCT ACTIONS
    // =====================================

    $(document).on(
        "click",
        "[data-action]",
        async function () {

            const action = $(this).data("action");

            const id = String($(this).data("id"));

            const product = products.find(item =>
                item.id === id
            );

            if (!product) {

                showFeedback(
                    "Product not found.",
                    true
                );

                return;
            }


            // EDIT PRODUCT

            if (action === "edit") {

                openProductModal(product);

                return;
            }


            // ACTIVATE / DEACTIVATE PRODUCT

            if (action === "toggle") {

                const newStatus = !product.active;

                const confirmation = confirm(
                    `Are you sure you want to ${
                        newStatus ? "activate" : "deactivate"
                    } "${product.title}"?`
                );

                if (!confirmation) {
                    return;
                }

                try {

                    await updateProductStatus(
                        id,
                        newStatus
                    );

                    showFeedback(
                        `Product ${
                            newStatus ? "activated" : "deactivated"
                        } successfully.`
                    );

                    await loadProducts();

                } catch (error) {

                    console.error(
                        "Product status error:",
                        error
                    );

                    showFeedback(
                        error.response?.data?.error?.message ||
                        error.message ||
                        "Unable to update product status.",
                        true
                    );

                }

                return;
            }


            // DELETE PRODUCT

            if (action === "delete") {

                const confirmation = confirm(
                    `Are you sure you want to permanently delete "${product.title}"? This action cannot be undone.`
                );

                if (!confirmation) {
                    return;
                }

                try {

                    await deleteProduct(id);

                    showFeedback(
                        "Product deleted successfully."
                    );

                    await loadProducts();

                } catch (error) {

                    console.error(
                        "Product deletion error:",
                        error
                    );

                    showFeedback(
                        error.response?.data?.error?.message ||
                        error.message ||
                        "Unable to delete product.",
                        true
                    );

                }

            }

        }
    );


    // =====================================
    // SEARCH AND FILTER EVENTS
    // =====================================

    $("#productSearch, #categoryFilter, #statusFilter").on(
        "input change",
        function () {

            currentPage = 1;

            renderProducts();

        }
    );


    // =====================================
    // PAGINATION
    // =====================================

    $("#previousPage").on("click", function () {

        if (currentPage > 1) {

            currentPage--;

            renderProducts();

        }

    });


    $("#nextPage").on("click", function () {

        const totalPages = Math.ceil(
            getFilteredProducts().length / PAGE_SIZE
        );

        if (currentPage < totalPages) {

            currentPage++;

            renderProducts();

        }

    });


    // =====================================
    // INITIALIZE
    // =====================================

    async function initializeProductsPage() {

        try {

            await loadCategories();

            await loadProducts();

        } catch (error) {

            console.error(
                "Product page initialization error:",
                error
            );

            showFeedback(
                error.response?.data?.error?.message ||
                error.message ||
                "Unable to initialize product management.",
                true
            );

        }

    }

    initializeProductsPage();

});