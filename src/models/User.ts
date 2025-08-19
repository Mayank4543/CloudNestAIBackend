import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Interface for storage partition
export interface IStoragePartition {
    name: string;
    quota: number; // Maximum storage in bytes
    used: number;  // Current usage in bytes
}

// Interface for User document
export interface IUser extends Document {
    _id: mongoose.Types.ObjectId;
    name: string;
    email: string;
    password?: string; // Optional for Google OAuth users
    picture?: string; // Profile picture URL for Google OAuth users
    passwordResetToken?: string;
    passwordResetExpires?: Date;
    storagePartitions: IStoragePartition[]; // User storage partitions
    createdAt: Date;
    updatedAt: Date;

    comparePassword(candidatePassword: string): Promise<boolean>;
    createPasswordResetToken(): string;
    toJSON(): Partial<IUser>;
}


export interface IUserModel extends mongoose.Model<IUser> {
    findByEmail(email: string): Promise<IUser | null>;
}

// User Schema
const UserSchema = new Schema<IUser>(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            minlength: [2, 'Name must be at least 2 characters long'],
            maxlength: [50, 'Name cannot exceed 50 characters']
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [
                /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
                'Please enter a valid email address'
            ]
        },
        password: {
            type: String,
            required: false, // Not required for Google OAuth users
            minlength: [6, 'Password must be at least 6 characters long'],
            select: false // Don't include password in queries by default
        },
        picture: {
            type: String,
            required: false, // Optional profile picture URL
            trim: true
        },
        passwordResetToken: {
            type: String,
            required: false,
            select: false // Don't include in queries by default
        },
        passwordResetExpires: {
            type: Date,
            required: false,
            select: false // Don't include in queries by default
        },
        storagePartitions: {
            type: [{
                name: {
                    type: String,
                    required: true,
                    trim: true,
                    minlength: [1, 'Partition name must be at least 1 character long'],
                    maxlength: [50, 'Partition name cannot exceed 50 characters']
                },
                quota: {
                    type: Number,
                    required: true,
                    min: [0, 'Quota cannot be negative'],
                    default: 5 * 1024 * 1024 * 1024 // 5GB default
                },
                used: {
                    type: Number,
                    required: true,
                    min: [0, 'Used storage cannot be negative'],
                    default: 0
                }
            }],
            default: [
                { name: 'personal', quota: 5 * 1024 * 1024 * 1024, used: 0 }, // 5GB
                { name: 'work', quota: 5 * 1024 * 1024 * 1024, used: 0 }      // 5GB
            ]
        }
    },
    {
        timestamps: true, // Automatically adds createdAt and updatedAt
        versionKey: false // Remove __v field
    }
);


// Pre-save middleware to hash password
UserSchema.pre<IUser>('save', async function (next) {
    // Only hash the password if it exists and has been modified (or is new)
    if (!this.password || !this.isModified('password')) {
        return next();
    }

    try {
        // Hash password with cost of 12
        const saltRounds = 12;
        this.password = await bcrypt.hash(this.password, saltRounds);
        next();
    } catch (error) {
        next(error as Error);
    }
});

// Instance method to compare password
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
    try {
        // If no password is set (e.g., Google OAuth user), return false
        if (!this.password) {
            return false;
        }
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw new Error('Password comparison failed');
    }
};

// Instance method to create password reset token
UserSchema.methods.createPasswordResetToken = function (): string {
    // Generate random token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Hash token and set to passwordResetToken field
    this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set expire time (10 minutes)
    this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000);

    // Return plain token (not hashed)
    return resetToken;
};

// Override toJSON to remove password from response
UserSchema.methods.toJSON = function (): Partial<IUser> {
    const userObject = this.toObject();
    delete userObject.password;
    return userObject;
};

// Static method to find user by email
UserSchema.statics.findByEmail = function (email: string): Promise<IUser | null> {
    return this.findOne({ email: email.toLowerCase() }).select('+password');
};

// Create and export the User model
const User = mongoose.model<IUser, IUserModel>('User', UserSchema);

export default User;
