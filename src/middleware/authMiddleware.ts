import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';

// Extend the Request interface to include user property
declare global {
    namespace Express {
        interface Request {
            user?: IUser;
        }
    }
}

// Interface for JWT payload (should match AuthController)
interface JWTPayload {
    userId: string;
    email: string;
    name: string;
}

/**
 * Middleware to verify JWT token and attach user to request
 * Expects token in Authorization header: "Bearer <token>"
 */
export const authenticateToken = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;
        console.log('🔍 Auth header received:', authHeader ? 'Present' : 'Missing');
        
        const token = authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.substring(7) // Remove "Bearer " prefix
            : null;

        if (!token) {
            console.log('❌ No token provided');
            res.status(401).json({
                success: false,
                message: 'Access token is required'
            });
            return;
        }

        console.log('🔑 Token extracted, length:', token.length);

        // Verify JWT token
        const secret = process.env.JWT_SECRET || 'fallback-secret-key';
        console.log('🔐 Using JWT secret:', secret.substring(0, 10) + '...');
        
        const decoded = jwt.verify(token, secret) as JWTPayload;
        console.log('✅ Token decoded successfully, userId:', decoded.userId);

        // Find user in database
        const user = await User.findById(decoded.userId);
        console.log('👤 User lookup result:', user ? `Found user: ${user.email}` : 'User not found');
        
        if (!user) {
            res.status(401).json({
                success: false,
                message: 'Invalid token - user not found'
            });
            return;
        }

        console.log('🎯 User attached to request. User ID:', user._id);
        console.log('📋 User object keys:', Object.keys(user.toObject()));

        // Attach user to request object
        req.user = user;

        // Continue to next middleware/route handler
        next();

    } catch (error) {
        // Handle JWT errors
        if (error instanceof jwt.JsonWebTokenError) {
            res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
            return;
        }

        if (error instanceof jwt.TokenExpiredError) {
            res.status(401).json({
                success: false,
                message: 'Token has expired'
            });
            return;
        }

        // Handle other errors
        console.error('Auth middleware error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during authentication'
        });
    }
};

/**
 * Optional middleware - authenticates if token is present, but doesn't require it
 * Useful for routes that work for both authenticated and non-authenticated users
 */
export const optionalAuth = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.substring(7)
            : null;

        if (!token) {
            // No token provided, continue without user
            next();
            return;
        }

        // Verify JWT token
        const secret = process.env.JWT_SECRET || 'fallback-secret-key';
        const decoded = jwt.verify(token, secret) as JWTPayload;

        // Find user in database
        const user = await User.findById(decoded.userId);
        if (user) {
            req.user = user;
        }

        next();

    } catch (error) {
        // In optional auth, we don't return errors - just continue without user
        console.warn('Optional auth warning:', error instanceof Error ? error.message : 'Unknown error');
        next();
    }
};

/**
 * Middleware to check if user is authenticated
 * Use after authenticateToken middleware
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
        return;
    }
    next();
};
