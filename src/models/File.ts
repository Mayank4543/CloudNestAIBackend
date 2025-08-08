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

// Create and export the model
const File = mongoose.model<IFile>('File', FileSchema);

export default File;
