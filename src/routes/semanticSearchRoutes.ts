import express from 'express';
import { SemanticSearchController } from '../controller/SemanticSearchController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

// Search routes with authentication middleware
router.get('/search', authenticateToken, SemanticSearchController.searchFiles);
router.post('/process/:id', authenticateToken, SemanticSearchController.processFile);

export default router;
