import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

class DynamoDBSessionManager {
    private ddbDocClient: DynamoDBDocumentClient;
    private tableName: string;

    constructor() {
        const ddbClient = new DynamoDBClient({            
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
            },
            region: process.env.AWS_REGION!
        });

        this.ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
        this.tableName = process.env.DYNAMODB_SESSION_TABLE!;
    }

    async storeSession(userId: string, accessToken: string, createdAt: Date, expiresIn: number, refreshToken: string) {
        // Format the createdAt date to an ISO string for DynamoDB compatibility
        const createdAtIsoString = createdAt.toISOString();
    
        const params = {
            TableName: this.tableName,
            Item: {                
                AccessToken: accessToken, // Stored directly as a string
                CreatedAt: createdAtIsoString, // Date converted to ISO string format
                ExpiresIn: expiresIn, // Assuming expiresIn_s is already in the correct format (seconds as a number)
                RefreshToken: refreshToken, // Stored directly as a string
                UserId: userId              
            }
        };
    
        try {
            await this.ddbDocClient.send(new PutCommand(params));
            console.log('Session stored successfully.');
        } catch (error) {
            console.error('Error storing session:', error);
        }
    }
    
    

    async getSession(userId: string) {
        const params = {            
            Key: { UserId: userId },
            TableName: this.tableName
        };
    
        try {
            const result = await this.ddbDocClient.send(new GetCommand(params));
            if (result.Item) {
                // Since CreatedAt was stored as an ISO string, it can be directly used or converted back to a Date object if needed
                const sessionData = {
                    accessToken: result.Item.AccessToken,
                    createdAt: new Date(result.Item.CreatedAt), // Converting the ISO string back to a Date object
                    expiresIn: result.Item.ExpiresIn,
                    refreshToken: result.Item.RefreshToken             
                };
                console.log(`Geted session for user ${userId}`, sessionData);
                return sessionData;
            } else {
                return null;
            }
        } catch (error) {
            console.error('Error retrieving session:', error);
            return null;
        }
    }
    

    async deleteSession(userId: string) {
        const params = {            
            Key: { UserId: userId },
            TableName: this.tableName
        };

        try {
            await this.ddbDocClient.send(new DeleteCommand(params));
            console.log('Session deleted successfully');
        } catch (error) {
            console.error('Error deleting session:', error);
        }
    }
}

export const sessionManager = new DynamoDBSessionManager();
