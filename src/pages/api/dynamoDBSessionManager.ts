// 导入AWS SDK相关库
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { KMSClient, EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";

class DynamoDBSessionManager {
    private ddbDocClient: DynamoDBDocumentClient;
    private kmsClient: KMSClient;
    private tableName: string;
    private kmsKeyId: string; // KMS Key ID for encryption/decryption

    constructor() {
        // 初始化DynamoDB客户端
        const ddbClient = new DynamoDBClient({
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
            },
            region: process.env.AWS_REGION!
        });

        // 初始化DynamoDB Document客户端
        this.ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

        // 初始化KMS客户端
        this.kmsClient = new KMSClient({ region: process.env.AWS_REGION! });

        // 从环境变量中读取表名和KMS密钥ID
        this.tableName = process.env.DYNAMODB_SESSION_TABLE!;
        this.kmsKeyId = process.env.AWS_KMS_KEY_ID!;
    }

    private async encryptData(data: string): Promise<string> {
        const params = {
            KeyId: this.kmsKeyId,
            Plaintext: Buffer.from(data)
        };

        const command = new EncryptCommand(params);
        const response = await this.kmsClient.send(command);
        return response.CiphertextBlob.toString('base64');
    }

    private async decryptData(ciphertextBlob: string): Promise<string> {
        const params = {
            CiphertextBlob: Buffer.from(ciphertextBlob, 'base64')
        };

        const command = new DecryptCommand(params);
        const response = await this.kmsClient.send(command);
        return response.Plaintext.toString();
    }

    async storeSession(userId: string, accessToken: string, createdAt: Date, expiresIn: number, refreshToken: string) {
        // 加密accessToken和refreshToken
        const encryptedAccessToken = await this.encryptData(accessToken);
        const encryptedRefreshToken = await this.encryptData(refreshToken);

        // 准备存储到DynamoDB的数据
        const params = {
            Item: {
                UserId: userId,
                AccessToken: encryptedAccessToken,
                CreatedAt: createdAt.toISOString(),
                ExpiresIn: expiresIn,
                RefreshToken: encryptedRefreshToken,
            },
            TableName: this.tableName
        };

        // 尝试存储session信息
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

        // 尝试获取session信息
        try {
            const result = await this.ddbDocClient.send(new GetCommand(params));
            if (result.Item) {
                // 解密accessToken和refreshToken
                const accessToken = await this.decryptData(result.Item.AccessToken);
                const refreshToken = await this.decryptData(result.Item.RefreshToken);

                const sessionData = {
                    accessToken: accessToken,
                    createdAt: new Date(result.Item.CreatedAt),
                    expiresIn: result.Item.ExpiresIn,
                    refreshToken: refreshToken,
                };
                console.log(`Session retrieved for user ${userId}`, sessionData);
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

        // 尝试删除session信息
        try {
            await this.ddbDocClient.send(new DeleteCommand(params));
            console.log('Session deleted successfully.');
        } catch (error) {
            console.error('Error deleting session:', error);
        }
    }
}

// 导出DynamoDBSessionManager实例
export const sessionManager = new DynamoDBSessionManager();
