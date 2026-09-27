const $ = id => document.getElementById(id);

let currentUser = null;
let selectedCategory = '';
let wishlistIds = new Set();
let searchTimer = null;
let chatBusy = false;

async function api(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        ...options
    });

    let data = {};

    try {
        data = await response.json();
    } catch (error) {
        data = {};
    }

    if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
    }

    return data;
}

function togglePassword(id, btn) {
    const input = $(id);

    if (!input) return;

    const visible = input.type === 'text';

    input.type = visible ? 'password' : 'text';
    btn.textContent = visible ? '👁' : '🙈';

    btn.setAttribute(
        'aria-label',
        visible ? 'Show password' : 'Hide password'
    );
}

function toast(message) {
    const toastElement = $('toast');

    if (!toastElement) return;

    toastElement.textContent = message;
    toastElement.classList.add('show');

    setTimeout(() => {
        toastElement.classList.remove('show');
    }, 2500);
}

function showPage(id) {
    document
        .querySelectorAll('.page')
        .forEach(page => page.classList.add('hidden'));

    const page = $(id);

    if (!page) return;

    page.classList.remove('hidden');

    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });

    if (id === 'cart') loadCart();
    if (id === 'wishlist') loadWishlist();
    if (id === 'orders') loadOrders();
    if (id === 'seller') loadSeller();
    if (id === 'checkout') loadCheckout();
}

async function boot() {
    try {
        const session = await api('/api/session');

        currentUser = session.user;

        updateAuth();

        await loadCategories();
        await refreshWishlistIds();
        await loadProducts();
        await updateCartCount();
        updateWishlistCount();
    } catch (error) {
        console.error(error);
        toast(error.message);
    }
}

function updateAuth() {
    const authButton = $('authBtn');
    const sellerNav = $('sellerNav');

    if (!authButton || !sellerNav) return;

    if (currentUser) {
        authButton.textContent = 'Logout';
        authButton.onclick = logout;

        sellerNav.classList.toggle(
            'hidden',
            currentUser.role !== 'seller'
        );
    } else {
        sellerNav.classList.add('hidden');

        authButton.textContent = 'Login';
        authButton.onclick = () => showPage('login');
    }
}

async function login(event) {
    event.preventDefault();

    try {
        const data = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                email: $('loginEmail').value,
                password: $('loginPassword').value
            })
        });

        currentUser = data.user;

        updateAuth();

        await refreshWishlistIds();
        await updateCartCount();

        toast('Welcome back!');

        showPage(
            currentUser.role === 'seller'
                ? 'seller'
                : 'home'
        );
    } catch (error) {
        toast(error.message);
    }
}

async function registerUser(event) {
    event.preventDefault();

    try {
        await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                name: $('regName').value,
                email: $('regEmail').value,
                password: $('regPassword').value
            })
        });

        $('loginEmail').value =
            $('regEmail').value.trim().toLowerCase();

        $('loginPassword').value = '';

        toast('Account created. Please login with your new account.');

        showPage('login');
    } catch (error) {
        toast(error.message);
    }
}

async function logout() {
    try {
        await api('/api/auth/logout', {
            method: 'POST'
        });

        currentUser = null;
        wishlistIds = new Set();

        updateAuth();
        updateWishlistCount();
        updateCartCount();

        showPage('home');

        await loadProducts();

        toast('Logged out safely');
    } catch (error) {
        toast(error.message);
    }
}

async function loadCategories() {
    try {
        const categories = await api('/api/categories');
        const categoryContainer = $('categories');

        if (!categoryContainer) return;

        categoryContainer.innerHTML =
            '<button class="cat ' +
            (!selectedCategory ? 'active' : '') +
            '" onclick="selectCategory(\'\')">All</button>' +
            categories
                .map(category => `
                    <button
                        class="cat ${
                            selectedCategory == category.id
                                ? 'active'
                                : ''
                        }"
                        onclick="selectCategory('${category.id}')"
                    >
                        ${escapeHtml(category.name)}
                    </button>
                `)
                .join('');
    } catch (error) {
        toast(error.message);
    }
}

function selectCategory(id) {
    selectedCategory = id;
    loadCategories();
    loadProducts();
}

async function loadProducts() {
    const productsContainer = $('products');

    if (!productsContainer) return;

    const query = new URLSearchParams({
        sort: $('sortSelect')?.value || 'newest'
    });

    if (selectedCategory) {
        query.set('category', selectedCategory);
    }

    const searchTerm = $('searchInput')?.value.trim();

    if (searchTerm) {
        query.set('search', searchTerm);
    }

    try {
        const products = await api(
            '/api/products?' + query.toString()
        );

        productsContainer.innerHTML = products.length
            ? products.map(productCard).join('')
            : `
                <div class="empty">
                    No products match your search.
                    Try another name or category.
                </div>
            `;
    } catch (error) {
        toast(error.message);
    }
}

function searchProducts() {
    loadProducts();
}

function queueSearch() {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(() => {
        loadProducts();
    }, 250);
}

function productCard(product) {
    const wished = wishlistIds.has(Number(product.id));
    const price = Number(product.price) || 0;
    const originalPrice = Number(product.original_price) || 0;
    const rating = Number(product.rating) || 0;
    const reviews = Number(product.reviews_count) || 0;
    const stock = Number(product.stock) || 0;

    return `
        <article class="product">
            <span class="badge">
                ${escapeHtml(product.badge || product.quality || '')}
            </span>

            <button
                class="heart ${wished ? 'liked' : ''}"
                aria-label="${
                    wished
                        ? 'Remove from wishlist'
                        : 'Add to wishlist'
                }"
                onclick="toggleWishlist(${Number(product.id)})"
            >
                ${wished ? '♥' : '♡'}
            </button>

            <img
                src="${escapeHtml(product.image || '')}"
                alt="${escapeHtml(product.name || '')}"
            >

            <div class="pbody">
                <div class="category">
                    ${escapeHtml(product.category_name || '')}
                </div>

                <h3>${escapeHtml(product.name || '')}</h3>

                <div class="rating">
                    ★ ${rating.toFixed(1)}
                    <span class="muted">(${reviews})</span>
                </div>

                <div>
                    <span class="price">
                        ₹${price.toLocaleString('en-IN')}
                    </span>

                    <span class="old">
                        ₹${originalPrice.toLocaleString('en-IN')}
                    </span>
                </div>

                <div class="stock">
                    ${
                        stock > 0
                            ? stock + ' in stock'
                            : 'Out of stock'
                    }
                    · ${escapeHtml(product.quality || '')} quality
                </div>

                <div class="actions">
                    <button
                        onclick="addCart(${Number(product.id)})"
                        ${stock < 1 ? 'disabled' : ''}
                    >
                        Add to cart
                    </button>

                    <button
                        class="buy"
                        onclick="buyNow(${Number(product.id)})"
                        ${stock < 1 ? 'disabled' : ''}
                    >
                        Buy now
                    </button>
                </div>
            </div>
        </article>
    `;
}

async function addCart(id) {
    if (!currentUser) {
        showPage('login');
        toast('Login to add items');
        return;
    }

    try {
        await api('/api/cart', {
            method: 'POST',
            body: JSON.stringify({
                productId: Number(id),
                quantity: 1
            })
        });

        toast('Added to cart');
        await updateCartCount();
    } catch (error) {
        toast(error.message);
    }
}

async function buyNow(id) {
    if (!currentUser) {
        showPage('login');
        toast('Login to buy items');
        return;
    }

    try {
        await addCart(id);
        showPage('cart');
    } catch (error) {
        toast(error.message);
    }
}

async function updateCartCount() {
    const cartCount = $('cartCount');

    if (!cartCount) return;

    if (!currentUser) {
        cartCount.textContent = '0';
        return;
    }

    try {
        const cart = await api('/api/cart');

        const total = cart.reduce(
            (sum, item) => sum + Number(item.quantity || 0),
            0
        );

        cartCount.textContent = total;
    } catch (error) {
        cartCount.textContent = '0';
    }
}

async function loadCart() {
    const cartContent = $('cartContent');

    if (!cartContent) return;

    if (!currentUser) {
        cartContent.innerHTML = `
            <div class="empty">
                Please
                <a onclick="showPage('login')">login</a>
                to view your cart.
            </div>
        `;
        return;
    }

    try {
        const cart = await api('/api/cart');

        if (!cart.length) {
            cartContent.innerHTML = `
                <div class="empty">
                    Your cart is empty.
                    <br>
                    <button
                        class="primary"
                        onclick="showPage('home')"
                    >
                        Continue shopping
                    </button>
                </div>
            `;
            return;
        }

        const total = cart.reduce(
            (sum, item) => sum + Number(item.subtotal || 0),
            0
        );

        const delivery = total >= 999 ? 0 : 49;
        const grandTotal = total + delivery;

        cartContent.innerHTML = `
            <div class="cart-layout">
                <div>
                    ${cart.map(item => {
                        const price = Number(item.price) || 0;
                        const subtotal = Number(item.subtotal) || 0;
                        const quantity = Number(item.quantity) || 0;

                        return `
                            <div class="cart-item">
                                <img
                                    src="${escapeHtml(item.image || '')}"
                                    alt="${escapeHtml(item.name || '')}"
                                >

                                <div class="grow">
                                    <strong>
                                        ${escapeHtml(item.name || '')}
                                    </strong>

                                    <div class="muted">
                                        ${escapeHtml(item.quality || '')}
                                        quality ·
                                        ₹${price.toLocaleString('en-IN')}
                                        each
                                    </div>

                                    <div class="qty">
                                        <button
                                            onclick="changeQty(
                                                ${Number(item.id)},
                                                ${quantity - 1}
                                            )"
                                        >
                                            −
                                        </button>

                                        <strong>${quantity}</strong>

                                        <button
                                            onclick="changeQty(
                                                ${Number(item.id)},
                                                ${quantity + 1}
                                            )"
                                        >
                                            +
                                        </button>

                                        <button
                                            onclick="removeCart(
                                                ${Number(item.id)}
                                            )"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>

                                <strong>
                                    ₹${subtotal.toLocaleString('en-IN')}
                                </strong>
                            </div>
                        `;
                    }).join('')}
                </div>

                <div class="summary-card">
                    <h3>Order summary</h3>

                    <div class="summary-row">
                        <span>Subtotal</span>
                        <strong>
                            ₹${total.toLocaleString('en-IN')}
                        </strong>
                    </div>

                    <div class="summary-row">
                        <span>Delivery</span>
                        <strong>
                            ${delivery === 0 ? 'FREE' : '₹49'}
                        </strong>
                    </div>

                    <div class="summary-row total">
                        <span>Total</span>
                        <strong>
                            ₹${grandTotal.toLocaleString('en-IN')}
                        </strong>
                    </div>

                    <button
                        class="primary full"
                        onclick="showPage('checkout')"
                    >
                        Proceed to checkout
                    </button>
                </div>
            </div>
        `;
    } catch (error) {
        toast(error.message);
    }
}

async function changeQty(id, quantity) {
    if (quantity < 1) {
        await removeCart(id);
        return;
    }

    try {
        await api('/api/cart/' + id, {
            method: 'PATCH',
            body: JSON.stringify({
                quantity: Number(quantity)
            })
        });

        await loadCart();
        await updateCartCount();
    } catch (error) {
        toast(error.message);
    }
}

async function removeCart(id) {
    try {
        await api('/api/cart/' + id, {
            method: 'DELETE'
        });

        await loadCart();
        await updateCartCount();

        toast('Removed from cart');
    } catch (error) {
        toast(error.message);
    }
}

async function refreshWishlistIds() {
    if (!currentUser) {
        wishlistIds = new Set();
        updateWishlistCount();
        return;
    }

    try {
        const rows = await api('/api/wishlist/ids');

        wishlistIds = new Set(
            rows.map(row => Number(row.product_id))
        );
    } catch (error) {
        wishlistIds = new Set();
    }

    updateWishlistCount();
}

function updateWishlistCount() {
    const wishlistCount = $('wishlistCount');

    if (!wishlistCount) return;

    wishlistCount.textContent = wishlistIds.size;
}

async function toggleWishlist(id) {
    if (!currentUser) {
        showPage('login');
        toast('Create an account and login to use wishlist');
        return;
    }

    try {
        if (wishlistIds.has(Number(id))) {
            await api('/api/wishlist/' + id, {
                method: 'DELETE'
            });

            wishlistIds.delete(Number(id));
            updateWishlistCount();
            toast('Removed from wishlist');
        } else {
            await api('/api/wishlist/' + id, {
                method: 'POST'
            });

            wishlistIds.add(Number(id));
            updateWishlistCount();
            toast('Saved to wishlist');
        }

        await loadProducts();

        const wishlistPage = $('wishlist');

        if (
            wishlistPage &&
            !wishlistPage.classList.contains('hidden')
        ) {
            await loadWishlist();
        }
    } catch (error) {
        toast(error.message);
    }
}

async function loadWishlist() {
    const wishlistContent = $('wishlistContent');

    if (!wishlistContent) return;

    if (!currentUser) {
        wishlistContent.innerHTML = `
            <div class="empty">
                Please login to view your wishlist.
            </div>
        `;
        return;
    }

    try {
        await refreshWishlistIds();

        const products = await api('/api/wishlist');

        wishlistContent.innerHTML = products.length
            ? products.map(productCard).join('')
            : `
                <div class="empty">
                    No saved products yet.
                </div>
            `;
    } catch (error) {
        toast(error.message);
    }
}

async function loadOrders() {
    const ordersContent = $('ordersContent');

    if (!ordersContent) return;

    if (!currentUser) {
        ordersContent.innerHTML = `
            <div class="empty">
                Please login to view orders.
            </div>
        `;
        return;
    }

    try {
        const orders = await api('/api/orders');

        ordersContent.innerHTML = orders.length
            ? orders.map(order => `
                <div class="order">
                    <div
                        style="
                            display: flex;
                            justify-content: space-between;
                            gap: 10px;
                        "
                    >
                        <strong>Order #${order.id}</strong>

                        <span class="status">
                            ${escapeHtml(order.status || '')}
                        </span>
                    </div>

                    <p class="muted">
                        ${new Date(
                            order.created_at
                        ).toLocaleString()}
                        · ${Number(order.item_count || 0)} item(s)
                        · ${escapeHtml(
                            order.payment_method || ''
                        )}
                    </p>

                    <strong>
                        ₹${Number(
                            order.total || 0
                        ).toLocaleString('en-IN')}
                    </strong>
                </div>
            `).join('')
            : `
                <div class="empty">
                    No orders yet.
                </div>
            `;
    } catch (error) {
        toast(error.message);
    }
}

async function loadCheckout() {
    const checkoutSummary = $('checkoutSummary');

    if (!checkoutSummary) return;

    if (!currentUser) {
        showPage('login');
        toast('Please login before checkout');
        return;
    }

    try {
        const cart = await api('/api/cart');

        if (!cart.length) {
            checkoutSummary.innerHTML = `
                <div class="empty">
                    Your cart is empty.
                </div>
            `;
            return;
        }

        const total = cart.reduce(
            (sum, item) => sum + Number(item.subtotal || 0),
            0
        );

        const delivery = total >= 999 ? 0 : 49;
        const grandTotal = total + delivery;

        checkoutSummary.innerHTML = `
            <h3>Review order</h3>

            ${cart.map(item => `
                <div class="summary-row">
                    <span>
                        ${escapeHtml(item.name || '')}
                        × ${Number(item.quantity || 0)}
                    </span>

                    <strong>
                        ₹${Number(
                            item.subtotal || 0
                        ).toLocaleString('en-IN')}
                    </strong>
                </div>
            `).join('')}

            <div class="summary-row">
                <span>Delivery</span>

                <strong>
                    ${delivery === 0 ? 'FREE' : '₹49'}
                </strong>
            </div>

            <div class="summary-row total">
                <span>Total</span>

                <strong>
                    ₹${grandTotal.toLocaleString('en-IN')}
                </strong>
            </div>

            <p class="muted">
                🔒 Your demo checkout stores only order details
                in SQLite. No real payment is processed.
            </p>
        `;

        if ($('shipName')) {
            $('shipName').value = currentUser.name || '';
        }
    } catch (error) {
        toast(error.message);
    }
}

async function placeOrder(event) {
    event.preventDefault();

    if (!currentUser) {
        showPage('login');
        toast('Please login before placing an order');
        return;
    }

    try {
        const data = await api('/api/orders', {
            method: 'POST',
            body: JSON.stringify({
                shippingName: $('shipName').value,
                shippingAddress: $('shipAddress').value,
                shippingCity: $('shipCity').value,
                shippingPincode: $('shipPin').value,
                paymentMethod: $('payment').value
            })
        });

        toast(
            'Order #' +
            data.orderId +
            ' placed successfully'
        );

        await updateCartCount();

        showPage('orders');
    } catch (error) {
        toast(error.message);
    }
}

async function loadSeller() {
    if (
        !currentUser ||
        currentUser.role !== 'seller'
    ) {
        showPage('login');
        return;
    }

    try {
        const products = await api('/api/products');

        const totalStock = products.reduce(
            (sum, product) =>
                sum + Number(product.stock || 0),
            0
        );

        const averageRating = products.length
            ? (
                products.reduce(
                    (sum, product) =>
                        sum + Number(product.rating || 0),
                    0
                ) / products.length
            ).toFixed(1)
            : '0.0';

        $('sellerStats').innerHTML = `
            <div class="stat">
                <span class="muted">Active products</span>
                <strong>${products.length}</strong>
            </div>

            <div class="stat">
                <span class="muted">Units in stock</span>
                <strong>${totalStock}</strong>
            </div>

            <div class="stat">
                <span class="muted">Average rating</span>
                <strong>★ ${averageRating}</strong>
            </div>
        `;

        $('sellerProducts').innerHTML =
            `
                <div class="seller-row">
                    <strong>Image</strong>
                    <strong>Product</strong>
                    <strong>Price</strong>
                    <strong>Stock</strong>
                    <strong>Category</strong>
                    <strong>Actions</strong>
                </div>
            ` +
            products
                .map(product => `
                    <div class="seller-row">
                        <img
                            src="${escapeHtml(product.image || '')}"
                            alt="${escapeHtml(product.name || '')}"
                        >

                        <strong>
                            ${escapeHtml(product.name || '')}
                        </strong>

                        <span>
                            ₹${Number(
                                product.price || 0
                            ).toLocaleString('en-IN')}
                        </span>

                        <span>
                            ${Number(product.stock || 0)}
                        </span>

                        <span>
                            ${escapeHtml(
                                product.category_name || ''
                            )}
                        </span>

                        <span>
                            <button
                                onclick="openProductForm(
                                    ${Number(product.id)}
                                )"
                            >
                                Edit
                            </button>

                            <button
                                onclick="deleteProduct(
                                    ${Number(product.id)}
                                )"
                            >
                                Delete
                            </button>
                        </span>
                    </div>
                `)
                .join('');
    } catch (error) {
        toast(error.message);
    }
}

async function openProductForm(id) {
    try {
        const categories = await api('/api/categories');

        $('pCategory').innerHTML = categories
            .map(category => `
                <option value="${category.id}">
                    ${escapeHtml(category.name)}
                </option>
            `)
            .join('');

        $('productId').value = '';
        $('modalTitle').textContent = 'Add product';

        if (id) {
            const product = await api('/api/products/' + id);

            $('modalTitle').textContent = 'Edit product';
            $('productId').value = product.id;
            $('pName').value = product.name || '';
            $('pCategory').value = product.category_id;
            $('pDescription').value =
                product.description || '';
            $('pPrice').value = product.price || '';
            $('pOriginal').value =
                product.original_price || '';
            $('pStock').value = product.stock || '';
            $('pQuality').value =
                product.quality || '';
            $('pBadge').value =
                product.badge || '';
            $('pImage').value =
                product.image || '';
        }

        $('productModal').classList.remove('hidden');
    } catch (error) {
        toast(error.message);
    }
}

function closeProductForm() {
    $('productModal').classList.add('hidden');
}

async function saveProduct(event) {
    event.preventDefault();

    const id = $('productId').value;

    const productData = {
        categoryId: $('pCategory').value,
        name: $('pName').value,
        description: $('pDescription').value,
        price: $('pPrice').value,
        originalPrice: $('pOriginal').value,
        stock: $('pStock').value,
        quality: $('pQuality').value,
        badge: $('pBadge').value,
        image: $('pImage').value
    };

    try {
        await api(
            id
                ? '/api/seller/products/' + id
                : '/api/seller/products',
            {
                method: id ? 'PUT' : 'POST',
                body: JSON.stringify(productData)
            }
        );

        closeProductForm();

        toast(
            id
                ? 'Product updated'
                : 'Product added'
        );

        await loadSeller();
        await loadProducts();
    } catch (error) {
        toast(error.message);
    }
}

async function deleteProduct(id) {
    if (!confirm('Remove this product from the store?')) {
        return;
    }

    try {
        await api('/api/seller/products/' + id, {
            method: 'DELETE'
        });

        toast('Product removed');

        await loadSeller();
        await loadProducts();
    } catch (error) {
        toast(error.message);
    }
}

function escapeHtml(value) {
    return String(value ?? '').replace(
        /[&<>'"]/g,
        character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[character])
    );
}

function toggleChatbot() {
    const panel = $('chatbotPanel');

    if (!panel) return;

    panel.classList.toggle('hidden');

    if (!panel.classList.contains('hidden')) {
        setTimeout(() => {
            const input = $('chatInput');

            if (input) {
                input.focus();
            }
        }, 50);
    }
}

function useChatSuggestion(text) {
    const input = $('chatInput');

    if (!input) return;

    input.value = text;
    sendChat(new Event('submit'));
}

function addChatMessage(text, type) {
    const messages = $('chatMessages');

    if (!messages) return null;

    const element = document.createElement('div');

    element.className = 'chat-msg ' + type;
    element.textContent = text;

    messages.appendChild(element);
    messages.scrollTop = messages.scrollHeight;

    return element;
}

async function sendChat(event) {
    if (event?.preventDefault) {
        event.preventDefault();
    }

    if (chatBusy) return;

    const input = $('chatInput');

    if (!input) return;

    const message = input.value.trim();

    if (!message) return;

    input.value = '';

    addChatMessage(message, 'user');

    chatBusy = true;

    const typingMessage = addChatMessage(
        'Thinking…',
        'bot typing'
    );

    try {
        const data = await api('/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: message
            })
        });

        if (typingMessage) {
            typingMessage.remove();
        }

        addChatMessage(
            data.reply ||
            'Sorry, I could not generate a response.',
            'bot'
        );
    } catch (error) {
        if (typingMessage) {
            typingMessage.remove();
        }

        addChatMessage(error.message, 'bot');
    } finally {
        chatBusy = false;

        if ($('chatInput')) {
            $('chatInput').focus();
        }
    }
}

boot();