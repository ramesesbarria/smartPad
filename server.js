require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();

// Use port 51920 so it's consistent with DCISM later
const PORT = process.env.PORT || 51920;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files (CSS, client-side JS, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Basic home route
app.get('/', (req, res) => {
  res.render('index', { title: 'SmartPad' });
});

// Start server
app.listen(PORT, () => {
  console.log(`SmartPad server running at http://localhost:${PORT}`);
});
