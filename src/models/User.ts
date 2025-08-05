import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

// Interface for User document
export interface IUser extends Document {
    _id: mongoose.Types.ObjectId;
    name: string;
    email: string;
    password: string;
    createdAt: Date;
    updatedAt: Date;

    
    comparePassword(candidatePassword: string): Promise<boolean>;
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
            required: [true, 'Password is required'],
            minlength: [6, 'Password must be at least 6 characters long'],
            select: false // Don't include password in queries by default
        }
    },
    {
        timestamps: true, // Automatically adds createdAt and updatedAt
        versionKey: false // Remove __v field
    }
);

// Index for faster email lookups
UserSchema.index({ email: 1 });

// Pre-save middleware to hash password
UserSchema.pre<IUser>('save', async function (next) {
    // Only hash the password if it's been modified (or is new)
    if (!this.isModified('password')) {
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
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw new Error('Password comparison failed');
    }
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
