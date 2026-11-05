require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
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

const dbPath = path.resolve(process.env.DB_FILE || 'lastbite.db');
const db = new DatabaseSync(dbPath);

// Initialize table if it doesn't exist
db.exec(`
    CREATE TABLE IF NOT EXISTS FlashDrops (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        StoreName TEXT NOT NULL,
        Address TEXT,
        Latitude REAL,
        Longitude REAL,
        ItemTitle TEXT NOT NULL,
        OriginalPrice INTEGER,
        DiscountedPrice INTEGER,
        QuantityLeft INTEGER,
        Category TEXT,
        TargetTime TEXT,
        CreatedAt DATETIME DEFAULT (datetime('now', 'localtime'))
    );
`);
console.log(`Connected to SQLite database at: ${dbPath}`);

app.get('/api/drops', verifyApiKey, (req, res) => {
    try {
        const stmt = db.prepare(`
            SELECT * FROM FlashDrops 
            WHERE QuantityLeft > 0 AND (TargetTime IS NULL OR datetime(TargetTime) > datetime('now', 'localtime'))
            ORDER BY CreatedAt DESC
        `);
        const drops = stmt.all();
        res.status(200).json(drops);
    } catch (err) {
        console.error('Error fetching drops:', err);
        res.status(500).json({ error: 'Failed to fetch drops' });
    }
});

app.post('/api/drops', verifyApiKey, (req, res) => {
    const { storeName, address, latitude, longitude, itemTitle, originalPrice, discountedPrice, quantityLeft, category, targetTime } = req.body;
    try {
        const stmt = db.prepare(`
            INSERT INTO FlashDrops (StoreName, Address, Latitude, Longitude, ItemTitle, OriginalPrice, DiscountedPrice, QuantityLeft, Category, TargetTime)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
            storeName,
            address || null,
            latitude || null,
            longitude || null,
            itemTitle,
            originalPrice ?? null,
            discountedPrice ?? null,
            quantityLeft ?? null,
            category || null,
            targetTime || null
        );
        res.status(201).json({ message: 'Success', id: Number(result.lastInsertRowid) });
    } catch (err) {
        console.error('Error publishing drop:', err);
        res.status(500).json({ error: 'Failed to publish drop' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`API running on Port ${PORT}`));
