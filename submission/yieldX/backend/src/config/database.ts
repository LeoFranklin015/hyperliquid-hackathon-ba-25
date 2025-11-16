import mongoose from 'mongoose';

export class DatabaseConnection {
    private static instance: DatabaseConnection;
    private isConnected: boolean = false;

    private constructor() {}

    public static getInstance(): DatabaseConnection {
        if (!DatabaseConnection.instance) {
            DatabaseConnection.instance = new DatabaseConnection();
        }
        return DatabaseConnection.instance;
    }

    public async connect(): Promise<void> {
        if (this.isConnected) {
            console.log('📊 Database already connected');
            return;
        }

        try {
            const mongoUrl = process.env.MONGO_URL;
            if (!mongoUrl) {
                throw new Error('MONGO_URL environment variable is not set');
            }

            await mongoose.connect(mongoUrl);
            
            this.isConnected = true;
            console.log('✅ Connected to MongoDB');

            // Handle connection events
            mongoose.connection.on('error', (error) => {
                console.error('❌ MongoDB connection error:', error);
                this.isConnected = false;
            });

            mongoose.connection.on('disconnected', () => {
                console.log('⚠️  MongoDB disconnected');
                this.isConnected = false;
            });

            mongoose.connection.on('reconnected', () => {
                console.log('🔄 MongoDB reconnected');
                this.isConnected = true;
            });

        } catch (error) {
            console.error('❌ Failed to connect to MongoDB:', error);
            this.isConnected = false;
            throw error;
        }
    }

    public async disconnect(): Promise<void> {
        if (!this.isConnected) {
            return;
        }

        try {
            await mongoose.disconnect();
            this.isConnected = false;
            console.log('✅ Disconnected from MongoDB');
        } catch (error) {
            console.error('❌ Error disconnecting from MongoDB:', error);
            throw error;
        }
    }

    public getConnectionStatus(): boolean {
        return this.isConnected && mongoose.connection.readyState === 1;
    }

    public getConnectionInfo(): {
        isConnected: boolean;
        readyState: number;
        host?: string;
        name?: string;
    } {
        return {
            isConnected: this.isConnected,
            readyState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            name: mongoose.connection.name
        };
    }
}