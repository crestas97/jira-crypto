const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL Connection Pool using Docker environment variables
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'secret123',
  database: process.env.DB_NAME || 'jiradb'
});

// Mock market prices
const MARKET_PRICES = {
  BTC: 64250.00,
  ETH: 3450.00,
  SOL: 145.50,
  ADA: 0.48,
  DOT: 7.20
};

// Fetch Market Prices & Live Portfolio
app.get('/api/portfolio', async (req, res) => {
  try {
    const portfolioRes = await pool.query('SELECT * FROM portfolio ORDER BY symbol ASC');
    const usdRow = portfolioRes.rows.find(r => r.symbol === 'USD');
    const usdBalance = usdRow ? parseFloat(usdRow.usd_balance) : 10000.00;

    const holdings = portfolioRes.rows
      .filter(r => r.symbol !== 'USD')
      .map(row => {
        const currentPrice = MARKET_PRICES[row.symbol] || 0;
        const totalValue = parseFloat(row.amount) * currentPrice;
        return {
          symbol: row.symbol,
          name: row.coin_name,
          amount: parseFloat(row.amount),
          currentPrice,
          totalValue
        };
      });

    const cryptoTotal = holdings.reduce((sum, item) => sum + item.totalValue, 0);

    res.json({
      usdBalance,
      cryptoTotal,
      netWorth: usdBalance + cryptoTotal,
      holdings,
      marketPrices: MARKET_PRICES
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database connection error' });
  }
});

// Fetch Transaction History
app.get('/api/transactions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 20');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transaction logs' });
  }
});

// Execute Trade (BUY/SELL)
app.post('/api/trade', async (req, res) => {
  const { type, symbol, coinName, amount } = req.body;
  const numAmount = parseFloat(amount);
  const unitPrice = MARKET_PRICES[symbol];

  if (!unitPrice || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Invalid trade input or price unavailable.' });
  }

  const totalCost = numAmount * unitPrice;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock and fetch current USD balance
    const usdRes = await client.query('SELECT usd_balance FROM portfolio WHERE symbol = $1 FOR UPDATE', ['USD']);
    let currentUsd = parseFloat(usdRes.rows[0].usd_balance);

    // Lock and fetch crypto asset row
    const assetRes = await client.query('SELECT amount FROM portfolio WHERE symbol = $1 FOR UPDATE', [symbol]);
    let currentAssetAmount = assetRes.rows.length > 0 ? parseFloat(assetRes.rows[0].amount) : 0;

    if (type === 'BUY') {
      if (currentUsd < totalCost) {
        throw new Error(`Insufficient USD cash balance. Required: $${totalCost.toFixed(2)}`);
      }
      currentUsd -= totalCost;
      currentAssetAmount += numAmount;
    } else if (type === 'SELL') {
      if (currentAssetAmount < numAmount) {
        throw new Error(`Insufficient ${symbol} holdings to sell.`);
      }
      currentUsd += totalCost;
      currentAssetAmount -= numAmount;
    }

    // Update USD balance
    await client.query('UPDATE portfolio SET usd_balance = $1 WHERE symbol = $2', [currentUsd, 'USD']);

    // Upsert crypto holding
    if (assetRes.rows.length > 0) {
      await client.query('UPDATE portfolio SET amount = $1 WHERE symbol = $2', [currentAssetAmount, symbol]);
    } else {
      await client.query('INSERT INTO portfolio (symbol, coin_name, amount) VALUES ($1, $2, $3)', [symbol, coinName, currentAssetAmount]);
    }

    // Insert Transaction Log
    await client.query(
      'INSERT INTO transactions (type, symbol, amount, price, total) VALUES ($1, $2, $3, $4, $5)',
      [type, symbol, numAmount, unitPrice, totalCost]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: `Trade executed: ${type} ${numAmount} ${symbol}` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.listen(3000, () => console.log('Jira Crypto API active on port 3000'));
