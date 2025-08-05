import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fileRouter from './src/routes/fileRouter';
import authRoutes from './src/routes/authRoutes';

// Load environment variables from .env file
dotenv.config();

// Create Express application
const app = express();

// Get configuration from environment variables
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cloudnest';
const NODE_ENV = process.env.NODE_ENV || 'development';

// CORS configuration
const corsOptions = {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware (development only)
if (NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
        next();
    });
}

// Serve static files from upload directory
app.use('/uploads', express.static(path.join(__dirname, 'src/upload')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'CloudNest AI Backend is running',
        timestamp: new Date().toISOString(),
        environment: NODE_ENV
    });
});

// Mount file routes
app.use('/api/files', fileRouter);

// Mount authentication routes  
console.log('🔧 Mounting auth routes at /api/auth...');
app.use('/api/auth', authRoutes);

// Debug route mounting in development
if (NODE_ENV === 'development') {
    console.log('📍 Available routes:');
    console.log('  - GET  /health');
    console.log('  - GET  /api/auth/test');
    console.log('  - POST /api/auth/register');
    console.log('  - POST /api/auth/login');
    console.log('  - GET  /api/auth/profile');
    console.log('  - POST /api/auth/logout');
}

// 404 handler for undefined routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`
    });
});

// Global error handler
app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Global error handler:', error);

    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const errorStatus = error instanceof Error && 'status' in error ? (error as any).status : 500;
    const errorStack = error instanceof Error ? error.stack : undefined;

    res.status(errorStatus).json({
        success: false,
        message: errorMessage,
        ...(NODE_ENV === 'development' && errorStack && { stack: errorStack })
    });
});

// MongoDB connection with retry logic
const connectToMongoDB = async (retryCount = 0): Promise<void> => {
    const maxRetries = 5;

    try {
        console.log(`Attempting to connect to MongoDB... (Attempt ${retryCount + 1})`);

        await mongoose.connect(MONGODB_URI);

        console.log('✅ Successfully connected to MongoDB');
        console.log('📋 To use the database features, you need MongoDB running at:', MONGODB_URI);

        // Handle connection events
        mongoose.connection.on('error', (error) => {
            console.error('❌ MongoDB connection error:', error);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ MongoDB disconnected');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('🔄 MongoDB reconnected');
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ MongoDB connection failed (Attempt ${retryCount + 1}):`, errorMessage);

        if (retryCount === 0) {
            console.log('💡 Tips to fix MongoDB connection issues:');
            console.log('   1. Make sure MongoDB is installed and running');
            console.log('   2. Check if the MongoDB URI is correct in .env file');
            console.log('   3. Try using "mongodb://127.0.0.1:27017/cloudnest" instead of localhost');
            console.log('   4. Verify MongoDB is listening on port 27017');
        }

        if (retryCount < maxRetries) {
            console.log(`⏳ Retrying in 5 seconds...`);
            setTimeout(() => connectToMongoDB(retryCount + 1), 5000);
        } else {
            console.error('💥 Max retry attempts reached');
            throw error;
        }
    }
};

// Start server function
const startServer = async (): Promise<void> => {
    try {
        // Start Express server first
        const server = app.listen(PORT, () => {
            console.log('🚀 Server Configuration:');
            console.log(`   Environment: ${NODE_ENV}`);
            console.log(`   Port: ${PORT}`);
            console.log(`   MongoDB URI: ${MONGODB_URI.replace(/\/\/.*@/, '//***:***@')}`);
            console.log(`   CORS Origins: ${corsOptions.origin}`);
            console.log(`\n🌟 CloudNest AI Backend server is running on http://localhost:${PORT}`);
            console.log(`📁 File API available at: http://localhost:${PORT}/api/files`);
            console.log(`🔍 Health check: http://localhost:${PORT}/health`);
        });

        // Connect to MongoDB in the background
        connectToMongoDB().then(() => {
            console.log('✅ MongoDB connection established, all features are now available');
        }).catch(error => {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('❌ Final MongoDB connection attempt failed:', errorMessage);
            console.warn('⚠️ Server is running but database features are not available');
        });

        // Handle server errors
        server.on('error', (error: unknown) => {
            if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
                console.error(`❌ Port ${PORT} is already in use`);
                process.exit(1);
            } else {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error('❌ Server error:', errorMessage);
            }
        });

        // Graceful shutdown handling
        const gracefulShutdown = async (signal: string) => {
            console.log(`\n${signal} received. Starting graceful shutdown...`);

            try {
                // Close server
                server.close(() => {
                    console.log('✅ HTTP server closed');
                });

                // Close MongoDB connection
                await mongoose.connection.close();
                console.log('✅ MongoDB connection closed');

                console.log('✅ Graceful shutdown completed');
                process.exit(0);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error('❌ Error during graceful shutdown:', errorMessage);
                process.exit(1);
            }
        };

        // Setup graceful shutdown handlers
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

// Export app for testing
export { app };

// Start server if this file is run directly
if (require.main === module) {
    startServer();
}
