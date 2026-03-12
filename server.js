const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();
const PORT = 3000;
app.use(cors());
app.use(express.json());

const pool = new Pool({
user: 'postgres',
host: 'localhost',
database: 'eventmanager',
password: 'Cranbrook1',
port: 5432
});

app.get('/api/books', async (req, res) => {
try {
const result = await pool.query(`
SELECT books.*, authors.name as author_name
FROM books
JOIN authors ON books.author_id = authors.author_id
`);
res.json(result.rows);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

app.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});