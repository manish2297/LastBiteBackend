require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', apiLimiter);

const verifyApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.MOBILE_API_KEY) {
        return res.status(403).json({ error: 'Forbidden: Invalid or missing API Key' });
    }
    next();
};

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER, 
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }
};

const poolPromise = new sql.ConnectionPool(dbConfig).connect()
    .then(pool => { console.log('Connected to SQL Server'); return pool; })
    .catch(err => console.error('Database Connection Failed:', err));

app.get('/api/drops', verifyApiKey, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT * FROM FlashDrops 
            WHERE QuantityLeft > 0 AND TargetTime > GETDATE()
            ORDER BY CreatedAt DESC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch drops' });
    }
});

app.post('/api/drops', verifyApiKey, async (req, res) => {
    const { storeName, address, latitude, longitude, itemTitle, originalPrice, discountedPrice, quantityLeft, category, targetTime } = req.body;
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('storeName', sql.NVarChar, storeName)
            .input('address', sql.NVarChar, address)
            .input('latitude', sql.Decimal(10, 8), latitude)
            .input('longitude', sql.Decimal(11, 8), longitude)
            .input('itemTitle', sql.NVarChar, itemTitle)
            .input('originalPrice', sql.Int, originalPrice)
            .input('discountedPrice', sql.Int, discountedPrice)
            .input('quantityLeft', sql.Int, quantityLeft)
            .input('category', sql.NVarChar, category)
            .input('targetTime', sql.DateTime, targetTime)
            .query(`
                INSERT INTO FlashDrops (StoreName, Address, Latitude, Longitude, ItemTitle, OriginalPrice, DiscountedPrice, QuantityLeft, Category, TargetTime)
                VALUES (@storeName, @address, @latitude, @longitude, @itemTitle, @originalPrice, @discountedPrice, @quantityLeft, @category, @targetTime);
                SELECT SCOPE_IDENTITY() AS Id;
            `);
        res.status(201).json({ message: 'Success', id: result.recordset[0].Id });
    } catch (err) {
        res.status(500).json({ error: 'Failed to publish drop' });
    }
});

app.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('API running on Port 3000'));