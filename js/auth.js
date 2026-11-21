
$(document).ready(function () {

    // =====================================
    // PANEL SWITCHING
    // =====================================

    function showPanel(panelId) {

        $(
            "#loginPanel, #signupPanel, #forgotPanel, #recoverPanel"
        ).prop("hidden", true);

        $("#" + panelId).prop("hidden", false);

        clearMessages();

    }


    $("#showSignup").on("click", function () {

        showPanel("signupPanel");

    });


    $("#showLogin, #backToLogin").on("click", function () {

        showPanel("loginPanel");

    });


    $("#showForgot").on("click", function () {

        showPanel("forgotPanel");

    });



    // =====================================
    // PASSWORD VISIBILITY
    // =====================================

    $(".toggle-password").on("click", function () {

        const targetId = $(this).data("target");

        const input = $("#" + targetId);

        const isPassword = input.attr("type") === "password";

        input.attr("type", isPassword ? "text" : "password");

        $(this).text(isPassword ? "Hide" : "Show");

    });



    // =====================================
    // MESSAGE HELPERS
    // =====================================

    function clearMessages() {

        $(".auth-error").text("");

        $(".auth-feedback").text("");

    }


    function showFeedback(elementId, message, isError = false) {

        const element = $("#" + elementId);

        element.text(message);

        element.css(
            "color",
            isError ? "#b54747" : "#456b52"
        );

    }


    function getErrorMessage(error) {

        const firebaseMessage =
            error.response?.data?.error?.message;

        const messages = {

            EMAIL_EXISTS:
                "This email is already registered.",

            INVALID_EMAIL:
                "Please enter a valid email address.",

            INVALID_PASSWORD:
                "The password does not meet the requirements.",

            EMAIL_NOT_FOUND:
                "No account found with this email.",

            INVALID_LOGIN_CREDENTIALS:
                "Incorrect email or password.",

            USER_DISABLED:
                "This account has been disabled.",

            TOO_MANY_ATTEMPTS_TRY_LATER:
                "Too many attempts. Please try again later."

        };

        return messages[firebaseMessage]
            || error.message
            || "Something went wrong. Please try again.";

    }


    function setButtonLoading(button, loading, normalText) {

        button.prop("disabled", loading);

        button.text(
            loading ? "PLEASE WAIT..." : normalText
        );

    }



    // =====================================
    // VALIDATION HELPERS
    // =====================================

    function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


    function isValidMobile(mobile) {

        return /^[6-9]\d{9}$/.test(mobile);

    }


    function isValidPassword(password) {
    return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);
}



    // =====================================
    // PROFILE RECOVERY HELPER
    // =====================================

    function openProfileRecovery(name = "", mobile = "") {

        $("#recoveryName").val(name);

        $("#recoveryMobile").val(mobile);

        showPanel("recoverPanel");

        showFeedback(
            "recoveryFeedback",
            "Your account is authenticated. Complete your customer details to continue."
        );

    }



    // =====================================
    // CUSTOMER SIGNUP
    // =====================================

    $("#signupForm").on("submit", async function (event) {

        event.preventDefault();

        clearMessages();


        const name = $("#signupName").val().trim();

        const email = $("#signupEmail").val().trim();

        const mobile = $("#signupMobile").val().trim();

        const password = $("#signupPassword").val();

        const confirmPassword = $("#confirmPassword").val();


        let isValid = true;


        if (!name) {

            $("#signupNameError").text(
                "Please enter your name."
            );

            isValid = false;

        }


        if (!isValidEmail(email)) {

            $("#signupEmailError").text(
                "Enter a valid email address."
            );

            isValid = false;

        }


        if (!isValidMobile(mobile)) {

            $("#signupMobileError").text(
                "Enter a valid 10-digit mobile number."
            );

            isValid = false;

        }


        if (!isValidPassword(password)) {

            $("#signupPasswordError").text(
                "Use at least 8 characters with a letter and a number."
            );

            isValid = false;

        }


        if (password !== confirmPassword) {

            $("#confirmPasswordError").text(
                "Passwords do not match."
            );

            isValid = false;

        }


        if (!isValid) return;


        const button = $(
            "#signupForm button[type='submit']"
        );

        setButtonLoading(
            button,
            true,
            "CREATE ACCOUNT →"
        );


        let authResponse = null;


        try {

            // Step 1: Create Firebase Authentication account

            authResponse = await registerCustomer(
                name,
                email,
                password,
                mobile
            );


            // Step 2: Save authenticated session immediately

            saveCustomerSession(authResponse);


            // Step 3: Create Firestore customer profile

            await createCustomerProfile(
                authResponse.localId,
                name,
                email,
                mobile,
                authResponse.idToken
            );


            // Step 4: Redirect after successful profile creation

            showFeedback(
                "signupFeedback",
                "Account created successfully! Redirecting..."
            );

            window.location.href = "account.html";


        } catch (error) {

            console.error("Signup error:", error);


            if (authResponse) {

                // Authentication succeeded,
                // but Firestore profile creation failed.

                openProfileRecovery(name, mobile);

                showFeedback(
                    "recoveryFeedback",
                    "Your account was created, but saving your profile failed: "
                    + getErrorMessage(error),
                    true
                );

            } else {

                showFeedback(
                    "signupFeedback",
                    getErrorMessage(error),
                    true
                );

            }

        } finally {

            setButtonLoading(
                button,
                false,
                "CREATE ACCOUNT →"
            );

        }

    });



    // =====================================
    // CUSTOMER LOGIN
    // =====================================

$("#loginForm").on("submit", async function (event) {

    event.preventDefault();
    clearMessages();

    const email = $("#loginEmail").val().trim();
    const password = $("#loginPassword").val();

    let isValid = true;

    if (!isValidEmail(email)) {
        $("#loginEmailError").text("Enter a valid email address.");
        isValid = false;
    }

    if (!password) {
        $("#loginPasswordError").text("Please enter your password.");
        isValid = false;
    }

    if (!isValid) return;

    const button = $("#loginForm button[type='submit']");

    setButtonLoading(button, true, "SIGN IN →");

    try {

        // Step 1: Authenticate with Firebase.
        const response = await loginCustomer(email, password);

        // Step 2: Identify the Admin using the authenticated UID.
        const ADMIN_UID = "TTyXkTb0h8ZzJjErDRe3t9roLfU2";

        if (response.localId === ADMIN_UID) {

            // Clear any previous customer session.
            [
                "havenCustomerLoggedIn",
                "havenCustomerUID",
                "havenCustomerToken",
                "havenCustomerEmail",
                "havenCustomerName",
                "havenCustomerMobile"
            ].forEach(key => sessionStorage.removeItem(key));

            // Store the authenticated Admin session.
            sessionStorage.setItem("havenAdminLoggedIn", "true");
            sessionStorage.setItem("havenAdminUID", response.localId);
            sessionStorage.setItem("havenAdminToken", response.idToken);
            sessionStorage.setItem("havenAdminEmail", response.email || email);
            sessionStorage.setItem("havenAdminRefreshToken", response.refreshToken);
            sessionStorage.setItem("havenAdminExpiresIn", response.expiresIn);

            showFeedback(
                "loginFeedback",
                "Admin login successful! Opening dashboard..."
            );

            window.location.href = "admin/dashboard.html";

            return;
        }

        // Step 3: Normal customer login.
        saveCustomerSession(response);

        // Step 4: Retrieve customer profile.
        let profile;

        try {

            profile = await getCustomerProfile(
                response.localId,
                response.idToken
            );

        } catch (profileError) {

            if (profileError.response?.status === 404) {
                openProfileRecovery();
                return;
            }

            throw profileError;
        }

        // Step 5: Check whether customer account is active.
        const fields = profile.fields || {};

        if (fields.active?.booleanValue === false) {

            logoutCustomer();

            showFeedback(
                "loginFeedback",
                "Your account is inactive. Please contact the administrator.",
                true
            );

            return;
        }

        // Step 6: Redirect customer.
        showFeedback(
            "loginFeedback",
            "Login successful! Redirecting..."
        );

        const returnTo = sessionStorage.getItem("havenReturnTo");

        sessionStorage.removeItem("havenReturnTo");

        window.location.href =
            returnTo && returnTo.endsWith(".html")
                ? returnTo
                : "account.html";

    } catch (error) {

        console.error("Login error:", error);

        showFeedback(
            "loginFeedback",
            getErrorMessage(error),
            true
        );

    } finally {

        setButtonLoading(
            button,
            false,
            "SIGN IN →"
        );

    }

});


    // =====================================
    // COMPLETE INCOMPLETE CUSTOMER PROFILE
    // =====================================

    $("#profileRecoveryForm").on("submit", async function (event) {

        event.preventDefault();

        clearMessages();


        const name = $("#recoveryName").val().trim();

        const mobile = $("#recoveryMobile").val().trim();


        let isValid = true;


        if (!name) {

            $("#recoveryNameError").text(
                "Please enter your full name."
            );

            isValid = false;

        }


        if (!isValidMobile(mobile)) {

            $("#recoveryMobileError").text(
                "Enter a valid 10-digit mobile number."
            );

            isValid = false;

        }


        if (!isValid) return;


        const uid = sessionStorage.getItem("havenCustomerUID");

        const token = getCustomerIdToken();

        const email = sessionStorage.getItem("havenCustomerEmail");


        const button = $(
            "#profileRecoveryForm button[type='submit']"
        );

        setButtonLoading(
            button,
            true,
            "COMPLETE REGISTRATION →"
        );


        try {

            if (!uid || !token || !email) {

                throw new Error(
                    "Your login session has expired. Please sign in again."
                );

            }


            // Create the missing Firestore customer profile.

            await createCustomerProfile(
                uid,
                name,
                email,
                mobile,
                token
            );


            // Save profile details in the current session.

            sessionStorage.setItem(
                "havenCustomerName",
                name
            );

            sessionStorage.setItem(
                "havenCustomerMobile",
                mobile
            );


            showFeedback(
                "recoveryFeedback",
                "Your customer profile is complete! Redirecting..."
            );


            window.location.href = "account.html";


        } catch (error) {

            console.error("Profile recovery error:", error);

            showFeedback(
                "recoveryFeedback",
                getErrorMessage(error),
                true
            );

        } finally {

            setButtonLoading(
                button,
                false,
                "COMPLETE REGISTRATION →"
            );

        }

    });



    // =====================================
    // FORGOT PASSWORD
    // =====================================

    $("#forgotForm").on("submit", async function (event) {

        event.preventDefault();

        clearMessages();


        const email = $("#forgotEmail").val().trim();


        if (!isValidEmail(email)) {

            $("#forgotEmailError").text(
                "Enter a valid email address."
            );

            return;

        }


        const button = $(
            "#forgotForm button[type='submit']"
        );

        setButtonLoading(
            button,
            true,
            "REQUEST RESET →"
        );


        try {

            await resetCustomerPassword(email);


            showFeedback(
                "forgotFeedback",
                "If an account exists for this email, a password reset email will be sent."
            );


        } catch (error) {

            console.error("Password reset error:", error);

            showFeedback(
                "forgotFeedback",
                getErrorMessage(error),
                true
            );

        } finally {

            setButtonLoading(
                button,
                false,
                "REQUEST RESET →"
            );

        }

    });

});
