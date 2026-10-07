import express from 'express';
import cors from 'cors';
import pg from 'pg';
import 'dotenv/config';

const app = express();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

app.use(cors());
app.use(express.json());

function verifyAdmin(req, res, next) {
    const userRole = req.headers['x-user-role'];

    if (userRole !== 'admin') {
        return res.status(403).json({
            error: 'Access denied.'
        });
    }

    next();
}
app.get('/api/products', async (req, res) => {
    try {
        const search = req.query.search || '';
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;

        if (page < 1) {
            return res.status(400).json({
                error: 'Page must be greater than 0.'
            });
        }

        if (limit < 1 || limit > 100) {
            return res.status(400).json({
                error: 'Limit must be between 1 and 100.'
            });
        }

        const offset = (page - 1) * limit;

        const allowedSortColumns = [
            'id',
            'name',
            'sku',
            'price',
            'current_stock'
        ];

        let sortBy = req.query.sortBy || 'id';

        if (!allowedSortColumns.includes(sortBy)) {
            sortBy = 'id';
        }

        let order = req.query.order || 'ASC';

        if (order.toUpperCase() !== 'DESC') {
            order = 'ASC';
        } else {
            order = 'DESC';
        }

        const searchValue = `%${search}%`;

        const products = await pool.query(
            `SELECT id, sku, name, current_stock, price
             FROM products
             WHERE name ILIKE $1 OR sku ILIKE $1
             ORDER BY ${sortBy} ${order}
             LIMIT $2 OFFSET $3`,
            [searchValue, limit, offset]
        );

        const count = await pool.query(
            `SELECT COUNT(*)
             FROM products
             WHERE name ILIKE $1 OR sku ILIKE $1`,
            [searchValue]
        );

        const totalProducts = Number(count.rows[0].count);

        const totalPages = Math.ceil(totalProducts / limit);

        res.json({
            products: products.rows,
            totalPages: totalPages
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Something went wrong.'
        });
    }
});
app.post('/api/orders', async (req, res) => {
    try {
        const items = req.body.items;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                error: 'Order must contain at least one item.'
            });
        }

        for (const item of items) {
            if (
                !Number.isInteger(item.productId) ||
                item.productId <= 0
            ) {
                return res.status(400).json({
                    error: 'Invalid product ID.'
                });
            }

            if (
                !Number.isInteger(item.quantity) ||
                item.quantity <= 0
            ) {
                return res.status(400).json({
                    error: 'Quantity must be greater than 0.'
                });
            }
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const orderResult = await client.query(
                `INSERT INTO orders (total_price)
                 VALUES (0)
                 RETURNING id`
            );

            const orderId = orderResult.rows[0].id;

            let totalPrice = 0;

            for (const item of items) {

                const productResult = await client.query(
                    `SELECT id, current_stock, price
                     FROM products
                     WHERE id = $1
                     FOR UPDATE`,
                    [item.productId]
                );

                if (productResult.rows.length === 0) {
                    await client.query('ROLLBACK');

                    return res.status(404).json({
                        error: 'Product not found.'
                    });
                }

                const product = productResult.rows[0];

                if (product.current_stock < item.quantity) {
                    await client.query('ROLLBACK');

                    return res.status(400).json({
                        error: `Not enough stock for product ${item.productId}.`
                    });
                }

                const itemTotal =
                    Number(product.price) * item.quantity;

                totalPrice += itemTotal;

                await client.query(
                    `UPDATE products
                     SET current_stock = current_stock - $1
                     WHERE id = $2`,
                    [item.quantity, item.productId]
                );

                await client.query(
                    `INSERT INTO order_items
                     (order_id, product_id, quantity, price_at_purchase)
                     VALUES ($1, $2, $3, $4)`,
                    [
                        orderId,
                        item.productId,
                        item.quantity,
                        product.price
                    ]
                );
            }

            await client.query(
                `UPDATE orders
                 SET total_price = $1
                 WHERE id = $2`,
                [totalPrice, orderId]
            );

            const savedOrder = await client.query(
                `SELECT id, total_price, status, created_at
                 FROM orders
                 WHERE id = $1`,
                [orderId]
            );

            await client.query('COMMIT');

            res.status(201).json({
                order: savedOrder.rows[0]
            });

        } catch (error) {
            await client.query('ROLLBACK');

            console.error(error);

            res.status(500).json({
                error: 'Could not create order.'
            });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Something went wrong.'
        });
    }
});
app.patch('/api/products/:id/restock',verifyAdmin,async (req, res) => {

        try {
            const productId = Number(req.params.id);
            const quantity = Number(req.body.quantity);

            if (!Number.isInteger(productId) || productId <= 0) {
                return res.status(400).json({
                    error: 'Invalid product ID.'
                });
            }

            if (!Number.isInteger(quantity) || quantity <= 0) {
                return res.status(400).json({
                    error: 'Quantity must be greater than 0.'
                });
            }

            const result = await pool.query(
                `UPDATE products
                 SET current_stock = current_stock + $1
                 WHERE id = $2
                 RETURNING id, sku, name, current_stock, price`,
                [quantity, productId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Product not found.'
                });
            }

            res.json({
                product: result.rows[0]
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                error: 'Could not restock product.'
            });
        }
    }
);
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found.'
    });
});
const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});