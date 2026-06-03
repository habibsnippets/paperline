import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { errorHandler } from './utils/errors.js';
import authRoutes from './routes/auth.js';
import treesRoutes from './routes/trees.js';
import readingListRoutes from './routes/readingList.js';

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/trees', treesRoutes);
app.use('/api/reading-list', readingListRoutes);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Paperline API running on http://localhost:${config.port}`);
});
