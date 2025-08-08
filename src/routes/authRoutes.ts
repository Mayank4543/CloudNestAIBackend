import express from 'express';
import { AuthController } from '../controller/AuthController';
import { authenticateToken } from '../middleware/authMiddleware';

// Create router
const router = express.Router();

/**
 * @route POST /api/auth/register
 * @desc Register a new user
 * @access Public
 * @body { name, email, password }
 * 
 */
router.get('/test', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Test route is working'
    });
})

/**
 * @route POST /api/auth/logout
 * @desc Logout user (client-side token removal)
 * @access Private (requires JWT token)
 * @headers Authorization: Bearer <token>
 */

router.post('/register', AuthController.register);

/**
 * @route POST /api/auth/login
 * @desc Login user and get JWT token
 * @access Public
 * @body { email, password }
 */
router.post('/login', AuthController.login);

/**
 * @route POST /api/auth/google
 * @desc Google OAuth login
 * @access Public
 * @body { token }
 */
router.post('/google', AuthController.googleLogin);

/**
 * @route GET /api/auth/profile
 * @desc Get current user profile
 * @access Private (requires JWT token)
 * @headers Authorization: Bearer <token>
 */
router.get('/profile', authenticateToken, AuthController.getProfile);

/**
 * @route POST /api/auth/logout
 * @desc Logout user (client-side token removal)
 * @access Private (requires JWT token)
 * @headers Authorization: Bearer <token>
 */
router.post('/logout', authenticateToken, AuthController.logout);

/**
 * @route POST /api/auth/forgot-password
 * @desc Send password reset token
 * @access Public
 * @body { email }
 */
router.post('/forgot-password', AuthController.forgotPassword);

/**
 * @route POST /api/auth/reset-password
 * @desc Reset password using token
 * @access Public
 * @body { token, password, confirmPassword }
 */
router.post('/reset-password', AuthController.resetPassword);

export default router;
