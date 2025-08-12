import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fileRouter from './routes/fileRouter';
import authRoutes from './routes/authRoutes';
import semanticSearchRoutes from './routes/semanticSearchRoutes';
import { getStaticServePath, ensureUploadDir } from './utils/uploadPaths';
import { serveUploadedFile } from './middleware/fileServingMiddleware';
import { EmbeddingService } from './services/EmbeddingService';

dotenv.config();

// Ensure upload directory exists on server startup
ensureUploadDir();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cloudnest';

console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`📂 Working directory: ${process.cwd()}`);
console.log(`📁 Upload directory will be: ${getStaticServePath()}`);

const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [
    'https://cloud-nest-ai-frontend.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);

        // Allow if origin is in the allowed list or if in development
        if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
            callback(null, true);
        } else {
            console.log(`CORS blocked for origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    maxAge: 86400 // CORS preflight cache (24 hours)
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file serving for uploaded files with custom middleware
app.use('/uploads', serveUploadedFile);

const staticPath = getStaticServePath();
console.log(`📁 Upload directory: ${staticPath}`);
console.log(`🌐 Files accessible at: /uploads/<filename>`);



// Routes
app.use('/api/files', fileRouter);
app.use('/api/auth', authRoutes);
app.use('/api/semantic', semanticSearchRoutes);

app.get('/health', (_req, res) => {
    res.status(200).json({ success: true, message: 'OK' });
});

app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err: any, _req: express.Request, res: express.Response) => {
    const status = err.status || 500;
    res.status(status).json({
        success: false,
        message: err.message || 'Internal Server Error',
    });
});

const connectToMongoDB = async () => {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
};

const startServer = async () => {
    try {
        await connectToMongoDB();

        // Initialize the embedding model in the background
        EmbeddingService.initializeModel().catch(error => {
            console.error('❌ Failed to initialize embedding model:', error);
            // Don't crash the server if model fails to load
        });

        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error('❌ Server failed to start:', err);
        process.exit(1);
    }
};

export { app };

if (require.main === module) {
    startServer();
}
