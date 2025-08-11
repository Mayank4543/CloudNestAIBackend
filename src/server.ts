import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fileRouter from './routes/fileRouter';
import authRoutes from './routes/authRoutes';
import { getStaticServePath, ensureUploadDir } from './utils/uploadPaths';
import { serveUploadedFile } from './middleware/fileServingMiddleware';

dotenv.config();

// Ensure upload directory exists on server startup
ensureUploadDir();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cloudnest';

console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`📂 Working directory: ${process.cwd()}`);
console.log(`📁 Upload directory will be: ${getStaticServePath()}`);

const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['https://cloud-nest-ai-frontend.vercel.app','http://localhost:3000'];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
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
