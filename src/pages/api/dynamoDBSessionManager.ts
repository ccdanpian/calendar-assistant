// 引入AWS SDK中与DynamoDB和KMS相关的模块
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { KMSClient, EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";

// 定义一个类来管理DynamoDB中的用户会话
class DynamoDBSessionManager {
    private ddbDocClient: DynamoDBDocumentClient; // DynamoDB文档客户端
    private kmsClient: KMSClient; // KMS客户端
    private tableName: string; // DynamoDB表名
    private kmsKeyId: string; // 用于加密/解密的KMS密钥ID

    // 类构造函数
    constructor() {
        // 初始化DynamoDB客户端
        const ddbClient = new DynamoDBClient({
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID!, // 从环境变量读取访问密钥ID
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! // 从环境变量读取秘密访问密钥
            },
            region: process.env.AWS_REGION! // 从环境变量读取AWS区域
        });

        // 从DynamoDB客户端创建文档客户端
        this.ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
        this.tableName = process.env.DYNAMODB_SESSION_TABLE!; // 从环境变量读取DynamoDB表名
        this.kmsKeyId = process.env.AWS_KMS_KEY_ID!; // 从环境变量读取KMS密钥ID
        this.kmsClient = new KMSClient({ region: process.env.AWS_REGION! }); // 初始化KMS客户端
    }

    // 加密数据的私有方法
    private async encryptData(data: string): Promise<string> {
        const params = {
            KeyId: this.kmsKeyId, // 使用KMS密钥ID
            Plaintext: Buffer.from(data) // 将数据转换为Buffer
        };

        // 发送加密命令
        const command = new EncryptCommand(params);
        const response = await this.kmsClient.send(command);
        if (!response.CiphertextBlob) {
            // 如果CiphertextBlob未定义，抛出错误
            throw new Error('Encryption failed, CiphertextBlob is undefined.');
        }
        // 正确地将CiphertextBlob转换为Base64格式的字符串
        return Buffer.from(response.CiphertextBlob).toString('base64');
    }

    // 解密数据的私有方法
    private async decryptData(ciphertextBlob: string): Promise<string> {
        const params = {
            CiphertextBlob: Buffer.from(ciphertextBlob, 'base64') // 将加密数据从base64格式转换为Buffer
        };

        // 发送解密命令
        const command = new DecryptCommand(params);
        const response = await this.kmsClient.send(command);
        if (!response.Plaintext) {
            // 如果Plaintext未定义，抛出错误
            throw new Error('Decryption failed, Plaintext is undefined.');
        }
        // 正确地将Plaintext（Uint8Array）转换为字符串
        return Buffer.from(response.Plaintext).toString();
    }


    // 存储会话信息到DynamoDB
    async storeSession(userId: string, accessToken: string, createdAt: Date, expiresIn: number, refreshToken: string) {
        const createdAtIsoString = createdAt.toISOString(); // 将创建时间转换为ISO格式的字符串

        // 先加密accessToken和refreshToken
        const encryptedAccessToken = await this.encryptData(accessToken);
        const encryptedRefreshToken = await this.encryptData(refreshToken);

        const params = {
            Item: {                
                AccessToken: encryptedAccessToken, // 加密后的访问令牌
                CreatedAt: createdAtIsoString, // 创建时间
                ExpiresIn: expiresIn, // 过期时间
                RefreshToken: encryptedRefreshToken, // 加密后的刷新令牌
                UserId: userId // 用户ID
            },
            TableName: this.tableName // 表名
        };

        // 尝试将会话信息存储到DynamoDB
        try {
            await this.ddbDocClient.send(new PutCommand(params));
            console.log('Session stored successfully.');
        } catch (error) {
            console.error('Error storing session:', error);
        }
    }

    // 从DynamoDB获取会话信息
    async getSession(userId: string) {
        const params = {
            Key: { UserId: userId }, // 根据用户ID查询
            TableName: this.tableName // 表名
        };

        try {
            const result = await this.ddbDocClient.send(new GetCommand(params));
            if (result.Item) {
                // 解密accessToken和refreshToken
                console.log(`AccessToken ddd`, result.Item.AccessToken);
                const accessToken = await this.decryptData(result.Item.AccessToken);
                const refreshToken = await this.decryptData(result.Item.RefreshToken);

                console.log(`AccessToken eee`, accessToken);

                const sessionData = {
                    accessToken: accessToken, // 解密后的访问令牌
                    createdAt: new Date(result.Item.CreatedAt), // 创建时间
                    expiresIn: result.Item.ExpiresIn, // 过期时间
                    refreshToken: refreshToken, // 解密后的刷新令牌
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

    // 从DynamoDB删除会话信息
    async deleteSession(userId: string) {
        const params = {
            Key: { UserId: userId }, // 根据用户ID进行删除
            TableName: this.tableName // 表名
        };

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
