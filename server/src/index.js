import express from 'express';
import { pool } from './db.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { storesRouter } from './routes/stores.js';

const app = express();
app.use(express.json());
app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/stores', storesRouter);

app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS time');
    res.json({
      status: 'ok',
      database: 'connected',
      time: result.rows[0].time,
    });
  } catch (err) {
    console.error('Health check failed:', err.message);
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, (err) => {
  if (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
  console.log(`ISIZOFIKA server listening on http://localhost:${port}`);
});
