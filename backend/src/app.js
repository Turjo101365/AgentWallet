import express from 'express';
import cors from 'cors';

import healthRoutes from './routes/health.routes.js';
import walletRoutes from './routes/wallet.routes.js';
import agentRoutes from './routes/agent.routes.js';
import rlRoutes from './routes/rl.routes.js';
import transactionRoutes from './routes/transaction.routes.js';
import contractRoutes from './routes/contract.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json());

// Base health route
app.use('/health', healthRoutes);

// API Routes
app.use('/api/wallet', walletRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/rl', rlRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/contract', contractRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Cannot ${req.method} ${req.originalUrl}`,
      status: 404,
    },
  });
});

// Centralized Error Handler
app.use(errorHandler);

export default app;
