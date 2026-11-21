
/* =========================================
   THE HAVEN - AUTHENTICATION API
   Firebase Authentication REST API
   HTTP Client: Axios
========================================= */


/* 1. CUSTOMER REGISTRATION */

function registerCustomer(name, email, password, mobile) {

    return firebaseAuthRequest("accounts:signUp", {
        email: email,
        password: password,
        returnSecureToken: true
    });

}


/* 2. CUSTOMER LOGIN */

function loginCustomer(email, password) {

    return firebaseAuthRequest("accounts:signInWithPassword", {
        email: email,
        password: password,
        returnSecureToken: true
    });

}


/* 3. ADMIN LOGIN */

function adminLogin(email, password) {

    return firebaseAuthRequest("accounts:signInWithPassword", {
        email: email,
        password: password,
        returnSecureToken: true
    }).then(function(response) {

        sessionStorage.setItem(
            "havenAdminLoggedIn",
            "true"
        );

        sessionStorage.setItem(
            "havenAdminToken",
            response.idToken
        );

        sessionStorage.setItem(
            "havenAdminUID",
            response.localId
        );

        sessionStorage.setItem(
            "havenAdminRefreshToken",
            response.refreshToken
        );

        sessionStorage.setItem(
            "havenAdminExpiresIn",
            response.expiresIn
        );

        sessionStorage.setItem(
            "havenAdminTokenExpiry",
            String(Date.now() + Number(response.expiresIn || 3600) * 1000)
        );

        sessionStorage.setItem(
            "havenAdminEmail",
            response.email || email
        );

        return response;

    });

}


/* 4. CUSTOMER PASSWORD RESET */

function resetCustomerPassword(email) {

    return firebaseAuthRequest("accounts:sendOobCode", {
        requestType: "PASSWORD_RESET",
        email: email
    });

}


/* 5. CUSTOMER TOKEN REFRESH */

/* 5. CUSTOMER TOKEN REFRESH */

function refreshAuthToken(refreshToken) {

    const token =
        refreshToken ||
        sessionStorage.getItem("havenCustomerRefreshToken");

    if (!token) {
        return Promise.reject(
            new Error("Customer refresh token is missing. Please sign in again.")
        );
    }

    const url =
        `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;

    const formData = new URLSearchParams();

    formData.append("grant_type", "refresh_token");
    formData.append("refresh_token", token);

    return axios.post(url, formData, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        }
    }).then(function(response) {

        const data = response.data;

        const currentUID =
            sessionStorage.getItem("havenCustomerUID");

        if (
            !data.id_token ||
            !data.refresh_token ||
            !data.user_id ||
            (currentUID && data.user_id !== currentUID)
        ) {
            throw new Error(
                "Refreshed token does not match the current customer."
            );
        }

        sessionStorage.setItem(
            "havenCustomerToken",
            data.id_token
        );

        sessionStorage.setItem(
            "havenCustomerRefreshToken",
            data.refresh_token
        );

        return data;

    });

}


/* 6. ADMIN TOKEN REFRESH */

function refreshAdminAuthToken(refreshToken) {

    const token =
        refreshToken ||
        sessionStorage.getItem("havenAdminRefreshToken");

    if (!token) {
        return Promise.reject(
            new Error("Admin refresh token is missing. Please sign in again.")
        );
    }

    const url =
        `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;

    const formData = new URLSearchParams();

    formData.append("grant_type", "refresh_token");
    formData.append("refresh_token", token);

    return axios.post(url, formData, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        }
    }).then(function(response) {

        const data = response.data;

        const currentUID =
            sessionStorage.getItem("havenAdminUID");

        if (
            currentUID &&
            data.user_id !== currentUID
        ) {
            throw new Error(
                "Refreshed token does not match the current admin."
            );
        }

        sessionStorage.setItem(
            "havenAdminToken",
            data.id_token
        );

        sessionStorage.setItem(
            "havenAdminRefreshToken",
            data.refresh_token
        );

        sessionStorage.setItem(
            "havenAdminUID",
            data.user_id
        );

        sessionStorage.setItem(
            "havenAdminExpiresIn",
            data.expires_in
        );

        sessionStorage.setItem(
            "havenAdminTokenExpiry",
            String(Date.now() + Number(data.expires_in || 3600) * 1000)
        );

        return data;

    });

}


/* 7. CUSTOMER LOGOUT */

function logoutCustomer() {

    const customerSessionKeys = [
        "havenCustomerLoggedIn",
        "havenCustomerUID",
        "havenCustomerToken",
        "havenCustomerRefreshToken",
        "havenCustomerEmail",
        "havenCustomerName",
        "havenCustomerMobile"
    ];

    customerSessionKeys.forEach(function(key) {
        sessionStorage.removeItem(key);
    });

}


/* 8. ADMIN LOGOUT */

function logoutAdmin() {

    const adminSessionKeys = [
        "havenAdminLoggedIn",
        "havenAdminUID",
        "havenAdminToken",
        "havenAdminEmail",
        "havenAdminRefreshToken",
        "havenAdminExpiresIn",
        "havenAdminTokenExpiry"
    ];

    adminSessionKeys.forEach(function(key) {
        sessionStorage.removeItem(key);
    });

}


/* 9. GET ADMIN AUTHENTICATION TOKEN */

function getAdminIdToken() {

    const token =
        sessionStorage.getItem("havenAdminToken");

    const uid =
        sessionStorage.getItem("havenAdminUID");

    if (!token || !uid) {
        throw new Error(
            "Admin authentication required. Please sign in again."
        );
    }

    return token;

}


/* =========================================
   10. SAVE CUSTOMER SESSION
========================================= */

function saveCustomerSession(response) {

    sessionStorage.setItem(
        "havenCustomerLoggedIn",
        "true"
    );

    sessionStorage.setItem(
        "havenCustomerUID",
        response.localId
    );

    sessionStorage.setItem(
        "havenCustomerToken",
        response.idToken
    );

    sessionStorage.setItem(
        "havenCustomerEmail",
        response.email
    );

    if (response.refreshToken) {
        sessionStorage.setItem(
            "havenCustomerRefreshToken",
            response.refreshToken
        );
    }

}
