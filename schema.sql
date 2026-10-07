CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR UNIQUE NOT NULL,
    name VARCHAR NOT NULL,
    current_stock INT NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
    price DECIMAL(12,2) NOT NULL CHECK (price >= 0)
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    total_price DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
    status VARCHAR NOT NULL DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders ON DELETE CASCADE,
    product_id INT REFERENCES products ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    price_at_purchase DECIMAL(12,2) NOT NULL
);

CREATE INDEX products_name_sku_idx
    ON products USING btree (name, sku);

INSERT INTO products (sku, name, current_stock, price) VALUES
    ('SKU-1001', 'Laptop Stand', 2, 29.99),
    ('SKU-1002', 'Wireless Mouse', 4, 19.99),
    ('SKU-1003', 'Mechanical Keyboard', 10, 59.99),
    ('SKU-1004', 'USB-C Hub', 7, 39.99),
    ('SKU-1005', 'Monitor Cable', 3, 12.50),
    ('SKU-1006', 'Office Chair', 15, 149.00);