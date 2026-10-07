import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import './index.css';

function App() {
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState('name');
    const [order, setOrder] = useState('ASC');
    const [page, setPage] = useState(1);
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState([]);
    const [messages, setMessages] = useState('');
    const [userRole, setUserRole] = useState('user');
    const [totalPages, setTotalPages] = useState(1);
    const [restockQuantities, setRestockQuantities] = useState({});
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [reloadProducts, setReloadProducts] = useState(0);
    const limit = 10;

    useEffect(() => {
        const controller = new AbortController();
        async function loadProducts() {
            try {
                const response = await axios.get('http://localhost:3000/api/products', {
                    params: { search, sortBy, order, page, limit },
                    signal: controller.signal
                });
                setProducts(response.data.products);
                setTotalPages(Math.max(response.data.totalPages, 1));
            } catch (error) {
                if (!axios.isCancel(error)) {
                    setMessages(error.response?.data?.error || 'Could not load products.');
                }
            }
        }
        loadProducts();
        return () => controller.abort();
    }, [search, sortBy, order, page, reloadProducts]);

    function addToCart(product) {
        const alreadyInCart = cart.find((item) => item.productId === product.id);
        const cartQuantity = alreadyInCart ? alreadyInCart.quantity : 0;

        if (cartQuantity + 1 > product.current_stock) {
            window.alert('There is not enough stock for that quantity.');
            return;
        }

        setCart((currentCart) => {
            const existingItem = currentCart.find((item) => item.productId === product.id);
            if (existingItem) {
                return currentCart.map((item) =>
                    item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
                );
            }
            return [...currentCart, { productId: product.id, name: product.name, quantity: 1 }];
        });
        setMessages('');
    }

    function removeFromCart(productId) {
        setCart((currentCart) =>
            currentCart
                .map((item) => (item.productId === productId ? { ...item, quantity: item.quantity - 1 } : item))
                .filter((item) => item.quantity > 0)
        );
    }

    async function checkout() {
        if (cart.length === 0 || isCheckingOut) return;

        const rollbackProducts = products.map((product) => ({ ...product }));
        const optimisticProducts = products.map((product) => {
            const cartItem = cart.find((item) => item.productId === product.id);
            if (!cartItem) return product;
            return { ...product, current_stock: product.current_stock - cartItem.quantity };
        });

        setProducts(optimisticProducts);
        setIsCheckingOut(true);
        setMessages('');

        try {
            await axios.post('http://localhost:3000/api/orders', {
                items: cart.map((item) => ({ productId: item.productId, quantity: item.quantity }))
            });
            setCart([]);
            setMessages('Order placed successfully.');
            setReloadProducts((count) => count + 1);
        } catch (error) {
            setProducts(rollbackProducts);
            const errorMessage = error.response?.data?.error || 'Checkout failed.';
            setMessages(errorMessage);
            if (error.response?.status === 400) {
                window.alert(errorMessage);
            }
        } finally {
            setIsCheckingOut(false);
        }
    }

    async function restockProduct(productId) {
        if (userRole !== 'admin') {
            setMessages('Access denied.');
            return;
        }

        const quantity = Number(restockQuantities[productId]);
        if (!Number.isInteger(quantity) || quantity < 1) {
            setMessages('Enter a restock quantity greater than zero.');
            return;
        }

        try {
            await axios.patch(
                `http://localhost:3000/api/products/${productId}/restock`,
                { quantity },
                { headers: { 'x-user-role': userRole } }
            );
            setMessages('Product restocked successfully.');
            setRestockQuantities((current) => ({ ...current, [productId]: '' }));
            setReloadProducts((count) => count + 1);
        } catch (error) {
            setMessages(error.response?.data?.error || 'Could not restock product.');
        }
    }

    function updatePage(newPage) {
        setPage(Math.min(Math.max(newPage, 1), totalPages));
    }

    return (
        <main>
            <h1>Product Inventory and Order Management</h1>
            <label>
                User role:
                <select value={userRole} onChange={(event) => setUserRole(event.target.value)}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                </select>
            </label>

            <section>
                <h2>Products</h2>
                <label>
                    Search by name or SKU:
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(1);
                        }}
                    />
                </label>

                <label>
                    Sort by:
                    <select
                        value={sortBy}
                        onChange={(event) => {
                            setSortBy(event.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="name">Name</option>
                        <option value="id">ID</option>
                        <option value="sku">SKU</option>
                        <option value="price">Price</option>
                        <option value="current_stock">Stock</option>
                    </select>
                </label>

                <label>
                    Order:
                    <select
                        value={order}
                        onChange={(event) => {
                            setOrder(event.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="ASC">Ascending</option>
                        <option value="DESC">Descending</option>
                    </select>
                </label>

                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>SKU</th>
                            <th>Product</th>
                            <th>Price</th>
                            <th>Stock</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {products.map((product) => (
                            <tr key={product.id} className={product.current_stock < 5 ? 'low-stock' : ''}>
                                <td>{product.id}</td>
                                <td>{product.sku}</td>
                                <td>
                                    {product.name}
                                    {product.current_stock < 5 && ' (Low Stock!)'}
                                </td>
                                <td>${Number(product.price).toFixed(2)}</td>
                                <td>{product.current_stock}</td>
                                <td>
                                    <button type="button" onClick={() => addToCart(product)} disabled={product.current_stock < 1}>
                                        Add to Cart
                                    </button>
                                    {userRole === 'admin' && (
                                        <span>
                                            <input
                                                type="number"
                                                min="1"
                                                value={restockQuantities[product.id] ?? ''}
                                                onChange={(event) =>
                                                    setRestockQuantities((current) => ({ ...current, [product.id]: event.target.value }))
                                                }
                                                aria-label={`Restock quantity for ${product.name}`}
                                            />
                                            <button type="button" onClick={() => restockProduct(product.id)}>
                                                Restock
                                            </button>
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {products.length === 0 && (
                            <tr>
                                <td colSpan="6">No products found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>

                <div>
                    <button type="button" onClick={() => updatePage(page - 1)} disabled={page <= 1}>
                        Previous
                    </button>
                    <span> Page {page} of {totalPages} </span>
                    <button type="button" onClick={() => updatePage(page + 1)} disabled={page >= totalPages}>
                        Next
                    </button>
                </div>
            </section>

            <section>
                <h2>Cart</h2>
                {cart.length === 0 ? (
                    <p>Your cart is empty.</p>
                ) : (
                    <>
                        <ul>
                            {cart.map((item) => (
                                <li key={item.productId}>
                                    {item.name} — Quantity: {item.quantity}
                                    <button type="button" onClick={() => removeFromCart(item.productId)}>
                                        Remove one
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <button type="button" onClick={checkout} disabled={isCheckingOut}>
                            {isCheckingOut ? 'Placing order...' : 'Checkout'}
                        </button>
                    </>
                )}
            </section>

            {messages && <p role="status">{messages}</p>}
        </main>
    );
}

createRoot(document.getElementById('root')).render(<App />);
