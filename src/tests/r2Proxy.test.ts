import request from 'supertest';
import mongoose from 'mongoose';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import jwt from 'jsonwebtoken';
import { proxyR2File } from '../middleware/r2ProxyMiddleware';
import File from '../models/File';
import { FileService } from '../services/FileService';
import axios from 'axios';

// Mock the axios module
jest.mock('axios');
const mockedAxios = jest.mocked(axios);

// Mock environment variables
process.env.JWT_SECRET = 'test-secret-key';
process.env.R2_ACCESS_KEY_ID = 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.R2_ENDPOINT = 'https://test-endpoint.com';
process.env.R2_BUCKET_NAME = 'test-bucket';

// Mock FileService.generatePresignedUrl
jest.mock('../services/FileService', () => {
    const originalModule = jest.requireActual('../services/FileService');
    return {
        ...originalModule,
        FileService: {
            ...originalModule.FileService,
            generatePresignedUrl: jest.fn().mockImplementation(async (objectKey) => {
                return `https://mocked-r2-url.com/${objectKey}?signature=abc123`;
            })
        }
    };
});

describe('R2 Proxy Middleware', () => {
    let mongoServer: MongoMemoryServer;
    let app: express.Application;
    let testUserId: mongoose.Types.ObjectId;
    let mockReadableStream: any;

    beforeAll(async () => {
        // Set up MongoDB Memory Server
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        await mongoose.connect(uri);

        // Create a test user ID
        testUserId = new mongoose.Types.ObjectId();

        // Set up Express app
        app = express();
        app.use(express.json());
        app.get('/proxy/:filename', proxyR2File);
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Create a mock readable stream for axios response
        mockReadableStream = {
            pipe: jest.fn(),
            on: jest.fn().mockImplementation((event, callback) => {
                return mockReadableStream;
            })
        };

        // Configure axios mock
        mockedAxios.mockResolvedValue({
            data: mockReadableStream,
            headers: { 'content-type': 'image/jpeg' }
        });
    });

    // Helper function to create a JWT token
    const createToken = (userId: string) => {
        return jwt.sign({ userId }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    };

    test('should return 400 if filename is not provided', async () => {
        const response = await request(app).get('/proxy/');
        expect(response.status).toBe(404);
    });

    test('should return 404 if file is not found', async () => {
        // Mock File.findOne to return null
        jest.spyOn(File, 'findOne').mockResolvedValueOnce(null);

        const response = await request(app).get('/proxy/nonexistent.jpg');

        expect(response.status).toBe(404);
        expect(response.body.message).toBe('File not found');
    });

    test('should return 401 if private file is accessed without authentication', async () => {
        // Mock a private file
        const mockFile = {
            filename: 'private.jpg',
            originalname: 'private.jpg',
            mimetype: 'image/jpeg',
            isPublic: false,
            userId: testUserId,
            r2ObjectKey: 'private-123.jpg'
        };

        jest.spyOn(File, 'findOne').mockResolvedValueOnce(mockFile as any);

        const response = await request(app).get('/proxy/private.jpg');

        expect(response.status).toBe(401);
        expect(response.body.message).toContain('Authentication required');
    });

    test('should successfully proxy a public file', async () => {
        // Mock a public file
        const mockFile = {
            filename: 'public.jpg',
            originalname: 'original-public.jpg',
            mimetype: 'image/jpeg',
            isPublic: true,
            r2ObjectKey: 'public-123.jpg'
        };

        jest.spyOn(File, 'findOne').mockResolvedValueOnce(mockFile as any);

        const response = await request(app).get('/proxy/public.jpg');

        expect(FileService.generatePresignedUrl).toHaveBeenCalledWith('public-123.jpg', 86400);
        expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
            method: 'GET',
            url: expect.stringContaining('public-123.jpg'),
            responseType: 'stream'
        }));

        // Check if the stream was piped to the response
        expect(mockReadableStream.pipe).toHaveBeenCalled();
    });

    test('should successfully proxy a private file with valid token', async () => {
        const userId = testUserId.toString();
        const token = createToken(userId);

        // Mock a private file
        const mockFile = {
            filename: 'private.jpg',
            originalname: 'private-original.jpg',
            mimetype: 'image/jpeg',
            isPublic: false,
            userId: testUserId,
            r2ObjectKey: 'private-123.jpg'
        };

        jest.spyOn(File, 'findOne').mockResolvedValueOnce(mockFile as any);

        const response = await request(app)
            .get('/proxy/private.jpg')
            .set('Authorization', `Bearer ${token}`);

        expect(FileService.generatePresignedUrl).toHaveBeenCalledWith('private-123.jpg', 3600);
        expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
            method: 'GET',
            url: expect.stringContaining('private-123.jpg'),
            responseType: 'stream'
        }));

        // Check if the stream was piped to the response
        expect(mockReadableStream.pipe).toHaveBeenCalled();
    });

    test('should fall back to r2Url if r2ObjectKey is not available', async () => {
        // Mock a file with only r2Url
        const mockFile = {
            filename: 'fallback.jpg',
            originalname: 'fallback-original.jpg',
            mimetype: 'image/jpeg',
            isPublic: true,
            r2Url: 'https://direct-r2-url.com/fallback.jpg'
        };

        jest.spyOn(File, 'findOne').mockResolvedValueOnce(mockFile as any);

        const response = await request(app).get('/proxy/fallback.jpg');

        expect(FileService.generatePresignedUrl).not.toHaveBeenCalled();
        expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
            method: 'GET',
            url: 'https://direct-r2-url.com/fallback.jpg',
            responseType: 'stream'
        }));

        // Check if the stream was piped to the response
        expect(mockReadableStream.pipe).toHaveBeenCalled();
    });

    test('should return 500 if proxy request fails', async () => {
        // Mock a file
        const mockFile = {
            filename: 'error.jpg',
            originalname: 'error.jpg',
            mimetype: 'image/jpeg',
            isPublic: true,
            r2ObjectKey: 'error-123.jpg'
        };

        jest.spyOn(File, 'findOne').mockResolvedValueOnce(mockFile as any);

        // Make axios throw an error
        mockedAxios.mockRejectedValueOnce(new Error('Network error'));

        const response = await request(app).get('/proxy/error.jpg');

        expect(response.status).toBe(500);
        expect(response.body.message).toContain('Error retrieving file');
    });
});
