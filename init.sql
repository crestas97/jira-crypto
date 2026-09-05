CREATE TABLE IF NOT EXISTS portfolio (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) UNIQUE NOT NULL,
    coin_name VARCHAR(50) NOT NULL,
    amount NUMERIC(18, 8) DEFAULT 0.0,
    usd_balance NUMERIC(18, 2) DEFAULT 10000.00
);

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    type VARCHAR(10) NOT NULL, -- BUY or SELL
    symbol VARCHAR(10) NOT NULL,
    amount NUMERIC(18, 8) NOT NULL,
    price NUMERIC(18, 2) NOT NULL,
    total NUMERIC(18, 2) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial cash balance and crypto holdings
INSERT INTO portfolio (symbol, coin_name, amount, usd_balance)
VALUES ('USD', 'US Dollar', 10000.00, 10000.00)
ON CONFLICT (symbol) DO NOTHING;

INSERT INTO portfolio (symbol, coin_name, amount, usd_balance)
VALUES 
    ('BTC', 'Bitcoin', 0.45),
    ('ETH', 'Ethereum', 3.20),
    ('SOL', 'Solana', 15.00)
ON CONFLICT (symbol) DO NOTHING;
