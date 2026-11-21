
$(document).ready(function () {

    // ------------------------------------
    // GET SELECTED PRODUCT
    // ------------------------------------

    const product = JSON.parse(
        sessionStorage.getItem("selectedProduct") || "null"
    );

    const currency = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
    });

    function showMessage(message) {

        $("#toast").text(message).addClass("show");

        clearTimeout(window.productToastTimer);

        window.productToastTimer = setTimeout(function () {
            $("#toast").removeClass("show");
        }, 2200);
    }

    // ------------------------------------
    // PRODUCT VALIDATION
    // ------------------------------------

    if (!product || !product.id) {

        $(".product-detail-page").html(`
            <div class="empty-message">
                <h2>Product not found</h2>
                <p>Please return to the shop and select a product.</p>
                <br>
                <a href="index.html#products" class="primary-button">
                    BACK TO SHOP →
                </a>
            </div>
        `);

        return;
    }

    // Support both old and new product property names.
    const productId = String(product.id);
    const productName = product.name || product.title || "Product";
    const productImage = product.image || product.imageUrl || "";
    const productPrice = Number(product.price) || 0;
    const productCategory = product.category || "Collection";
    const productDescription = product.description || "";
    const availableStock = Math.max(0, Number(product.qty) || 0);

    // ------------------------------------
    // DISPLAY PRODUCT DETAILS
    // ------------------------------------

    $("#mainProductImage").attr({
        src: productImage,
        alt: productName
    });

    $("#detailCategory").text(productCategory.toUpperCase());

    $("#detailName").text(productName);

    $("#breadcrumbProduct").text(productName);

    $("#detailPrice").text(currency.format(productPrice));

    // Old price, discount, rating and reviews
    // are not stored in the current Firestore schema.
    $("#detailOldPrice").text("").hide();

    $("#detailDiscount").text("").hide();

    $("#detailRating").text("New arrival");

    $("#detailReviews").text("");

    $("#detailDescription").text(productDescription);

    $("#productLongDescription").text(productDescription);

    // Stock information
    if (availableStock > 0) {

        $("#productStock")
            .text(availableStock + " items available")
            .removeClass("out-of-stock");

    } else {

        $("#productStock")
            .text("Currently out of stock")
            .addClass("out-of-stock");
    }

    // Hide purchase controls if unavailable
    $("#detailAddToCart, #buyNow")
        .prop("disabled", availableStock <= 0);

    // ------------------------------------
    // QUANTITY CONTROLS
    // ------------------------------------

    $("#productQuantity")
        .attr({
            min: 1,
            max: Math.min(10, availableStock)
        })
        .val(1);

    $("#decreaseQuantity").on("click", function () {

        let quantity = Number($("#productQuantity").val());

        if (quantity > 1) {
            $("#productQuantity").val(quantity - 1);
        }
    });

    $("#increaseQuantity").on("click", function () {

        let quantity = Number($("#productQuantity").val());

        const maximum = Math.min(10, availableStock);

        if (quantity < maximum) {
            $("#productQuantity").val(quantity + 1);
        } else {
            showMessage("Available stock limit reached.");
        }
    });

    $("#productQuantity").on("change", function () {

        let quantity = Number($(this).val());

        if (!Number.isFinite(quantity)) {
            quantity = 1;
        }

        quantity = Math.max(
            1,
            Math.min(
                Math.min(10, availableStock),
                Math.floor(quantity)
            )
        );

        $(this).val(quantity);
    });

    // ------------------------------------
    // ADD TO CART
    // ------------------------------------

    function addProductToCart() {

        if (availableStock <= 0) {
            showMessage("This product is out of stock.");
            return false;
        }

        const quantity = Number($("#productQuantity").val());

        if (
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > Math.min(10, availableStock)
        ) {
            showMessage("Please select a valid quantity.");
            return false;
        }

        let cart = JSON.parse(
            localStorage.getItem("havenCart") || "{}"
        );

        const existingQuantity = cart[productId]
            ? Number(cart[productId].quantity)
            : 0;

        if (existingQuantity + quantity > availableStock) {
            showMessage("Selected quantity exceeds available stock.");
            return false;
        }

        if (cart[productId]) {

            cart[productId].quantity += quantity;

        } else {

            cart[productId] = {
                id: productId,
                name: productName,
                category: productCategory,
                price: productPrice,
                image: productImage,
                quantity: quantity
            };
        }

        localStorage.setItem(
            "havenCart",
            JSON.stringify(cart)
        );

        showMessage("Added to your shopping bag ♡");

        return true;
    }

    $("#detailAddToCart").on("click", function () {
        addProductToCart();
    });

    // ------------------------------------
    // WISHLIST
    // ------------------------------------

    let wishlist = JSON.parse(
        localStorage.getItem("havenWishlist") || "[]"
    ).map(String);

    function updateWishlistButton() {

        const isSaved = wishlist.includes(productId);

        $("#detailWishlist")
            .toggleClass("selected", isSaved)
            .text(isSaved ? "♥" : "♡");
    }

    updateWishlistButton();

    $("#detailWishlist").on("click", function () {

        if (wishlist.includes(productId)) {

            wishlist = wishlist.filter(function (id) {
                return id !== productId;
            });

            showMessage("Removed from your wishlist.");

        } else {

            wishlist.push(productId);

            showMessage("Added to your wishlist ♡");
        }

        localStorage.setItem(
            "havenWishlist",
            JSON.stringify(wishlist)
        );

        updateWishlistButton();
    });

    // ------------------------------------
    // BUY NOW
    // ------------------------------------

    // ------------------------------------
// BUY NOW — CHECKOUT ONLY THIS PRODUCT
// ------------------------------------

$("#buyNow").on("click", function () {

    if (availableStock <= 0) {
        showMessage("This product is out of stock.");
        return;
    }

    const quantity = Number($("#productQuantity").val());

    if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > Math.min(10, availableStock)
    ) {
        showMessage("Please select a valid quantity.");
        return;
    }

    const buyNowItem = {
        id: productId,
        name: productName,
        category: productCategory,
        price: productPrice,
        image: productImage,
        quantity: quantity
    };

    sessionStorage.setItem(
        "havenBuyNow",
        JSON.stringify([buyNowItem])
    );

    window.location.href = "checkout.html";
});

});
