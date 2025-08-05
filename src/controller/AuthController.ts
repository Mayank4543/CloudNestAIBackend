import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';

// Interface for registration request
interface RegisterRequest {
    name: string;
    email: string;
    password: string;
}

// Interface for login request
interface LoginRequest {
    email: string;
    password: string;
}

// Interface for JWT payload
interface JWTPayload {
    userId: string;
    email: string;
    name: string;
}

export class AuthController {

    /**
     * Generate JWT token for user
     * @param user - User document
     * @returns JWT token string
     */
    private static generateToken(user: IUser): string {
        const payload: JWTPayload = {
            userId: user._id.toString(),
            email: user.email,
            name: user.name
        };

        const secret = process.env.JWT_SECRET || 'fallback-secret-key';
        const expiresIn = process.env.JWT_EXPIRES_IN || '7d';


        return jwt.sign(payload, secret, { expiresIn } as any);
    }

    /**
     * Register a new user
     * @route POST /api/auth/register
     * @body { name, email, password }
     */
    public static async register(req: Request, res: Response): Promise<void> {
        try {
            const { name, email, password }: RegisterRequest = req.body;

            // Validate required fields
            if (!name || !email || !password) {
                res.status(400).json({
                    success: false,
                    message: 'Name, email, and password are required'
                });
                return;
            }

            // Check if user already exists
            const existingUser = await User.findOne({ email: email.toLowerCase() });
            if (existingUser) {
                res.status(409).json({
                    success: false,
                    message: 'User with this email already exists'
                });
                return;
            }

            // Create new user (password will be hashed by pre-save middleware)
            const newUser = new User({
                name: name.trim(),
                email: email.toLowerCase().trim(),
                password
            });

            // Save user to database
            const savedUser = await newUser.save();

            // Generate JWT token
            const token = AuthController.generateToken(savedUser);

            // Return success response (password excluded by toJSON method)
            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                data: {
                    user: savedUser,
                    token
                }
            });

        } catch (error) {
            console.error('Registration error:', error);

            // Handle validation errors
            if (error instanceof Error && error.name === 'ValidationError') {
                res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    errors: error.message
                });
                return;
            }

            // Handle duplicate key error (email already exists)
            if (error instanceof Error && 'code' in error && error.code === 11000) {
                res.status(409).json({
                    success: false,
                    message: 'User with this email already exists'
                });
                return;
            }

            res.status(500).json({
                success: false,
                message: 'Internal server error during registration'
            });
        }
    }

    /**
     * Login user
     * @route POST /api/auth/login
     * @body { email, password }
     */
    public static async login(req: Request, res: Response): Promise<void> {
        try {
            const { email, password }: LoginRequest = req.body;

            // Validate required fields
            if (!email || !password) {
                res.status(400).json({
                    success: false,
                    message: 'Email and password are required'
                });
                return;
            }

            // Find user by email (include password for comparison)
            const user = await User.findByEmail(email);
            if (!user) {
                res.status(401).json({
                    success: false,
                    message: 'Invalid email or password'
                });
                return;
            }

            // Compare password
            const isPasswordValid = await user.comparePassword(password);
            if (!isPasswordValid) {
                res.status(401).json({
                    success: false,
                    message: 'Invalid email or password'
                });
                return;
            }

            // Generate JWT token
            const token = AuthController.generateToken(user);

            // Update last login (optional)
            user.set({ lastLogin: new Date() });
            await user.save();

            // Return success response
            res.status(200).json({
                success: true,
                message: 'Login successful',
                data: {
                    user: user.toJSON(), // Password excluded by toJSON method
                    token
                }
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error during login'
            });
        }
    }

    /**
     * Get current user profile
     * @route GET /api/auth/profile
     * @headers Authorization: Bearer <token>
     */
    public static async getProfile(req: Request, res: Response): Promise<void> {
        try {
            // User should be available from auth middleware (req.user is the full user object)
            const user = (req as any).user;

            if (!user) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized - User not found in request'
                });
                return;
            }

            // User is already loaded by the middleware, so we can return it directly
            res.status(200).json({
                success: true,
                message: 'Profile retrieved successfully',
                data: {
                    user: user.toJSON()
                }
            });

        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    /**
     * Logout user (client-side token removal)
     * @route POST /api/auth/logout
     */
    public static async logout(req: Request, res: Response): Promise<void> {
        // Since we're using stateless JWT tokens, logout is handled client-side
        // by removing the token from storage
        res.status(200).json({
            success: true,
            message: 'Logout successful. Please remove the token from client storage.'
        });
    }
}

export default AuthController;
