import mongoose, { Schema, Document } from 'mongoose';

// Interface for the File document
export interface IFile extends Document {
    filename: string;
    originalname: string;
    mimetype: string;
    size: number;
    path: string;
    userId: mongoose.Types.ObjectId;
    isPublic: boolean;
    createdAt: Date;
    tags: string[];
    r2Url?: string; // URL to file in Cloudflare R2 storage
    r2ObjectKey?: string; // Object key in R2 bucket
    embedding?: number[]; // Vector embedding for semantic search
    textContent?: string; // Extracted text content for reference (optional)
}

// Mongoose schema for uploaded files
const FileSchema: Schema = new Schema({
    filename: {
        type: String,
        required: true,
        trim: true
    },
    originalname: {
        type: String,
        required: true,
        trim: true
    },
    mimetype: {
        type: String,
        required: true,
        trim: true
    },
    size: {
        type: Number,
        required: true,
        min: 0
    },
    path: {
        type: String,
        required: true,
        trim: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    isPublic: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    tags: {
        type: [String],
        default: [],
        validate: {
            validator: function (tags: string[]) {
                return tags.every(tag => tag.trim().length > 0);
            },
            message: 'Tags cannot be empty strings'
        }
    },
    r2Url: {
        type: String,
        trim: true
    },
    r2ObjectKey: {
        type: String,
        trim: true
    },
    embedding: {
        type: [Number], // Vector embedding for semantic search
        index: false, // We'll create a vector index separately
        select: false // Don't include in normal queries unless explicitly requested
    },
    textContent: {
        type: String, // Extracted text content (optional, for debugging)
        select: false // Don't include in normal queries unless explicitly requested
    }
}, {
    timestamps: true, // This adds createdAt and updatedAt automatically
    versionKey: false // Removes the __v field
});

// Create indexes for better query performance
FileSchema.index({ filename: 1 });
FileSchema.index({ mimetype: 1 });
FileSchema.index({ createdAt: -1 });
FileSchema.index({ tags: 1 });
FileSchema.index({ userId: 1 });
FileSchema.index({ isPublic: 1 });
FileSchema.index({ userId: 1, isPublic: 1 });

// Note: To create the vector index for embeddings, run this command in MongoDB Atlas:
/*
db.files.createIndex(
  { embedding: "vectorSearch" },
  {
    name: "embeddingVectorIndex",
    vectorSearchConfig: {
      dimensions: 384,  // all-MiniLM-L6-v2 produces 384-dimensional vectors
      similarity: "cosine"
    }
  }
)
*/

// Create and export the model
const File = mongoose.model<IFile>('File', FileSchema);

export default File;
