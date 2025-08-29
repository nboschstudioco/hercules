const express = require('express');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Basic middleware
app.use(express.json());

// Basic health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', message: 'Minimal server running' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Test server running on port ${PORT}`);
});