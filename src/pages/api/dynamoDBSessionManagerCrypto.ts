// 引入AWS SDK中与DynamoDB和KMS相关的模块
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
// import { KMSClient, DecryptCommand } from "@aws-sdk/client-kms";
import crypto from 'node:crypto';


// 假设您已经有了加密密钥和初始化向量（IV），这些值应该安全地存储和管理
// 以下是示例值，请替换为您自己的密钥和IV
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your_secret_encryption_key'; // 确保这个密钥是32位的
// const IV = process.env.IV || 'your_initialization_vector'; // IV应该是16位的

// 定义一个类来管理DynamoDB中的用户会话
class DynamoDBSessionManager {
    private ddbDocClient: DynamoDBDocumentClient; // DynamoDB文档客户端
    // private kmsClient: KMSClient; // KMS客户端
    private tableName: string; // DynamoDB表名
    // private kmsKeyId: string; // 用于加密/解密的KMS密钥ID

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
        // this.kmsKeyId = process.env.AWS_KMS_KEY_ID!; // 从环境变量读取KMS密钥ID
        // this.kmsClient = new KMSClient({ region: process.env.AWS_REGION! }); // 初始化KMS客户端
    }

    // 使用crypto模块重写的加密数据的私有方法
    private async encryptData(data: string): Promise<string> {
        const iv = Buffer.alloc(16, 0); // Initialization vector.
        const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
        let cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(data);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return encrypted.toString('base64'); // 将加密后的数据转换为Base64格式的字符串
    }

    // 使用crypto模块重写的解密数据的私有方法
    private async decryptData(ciphertextBlob: string): Promise<string> {
        const iv = Buffer.alloc(16, 0); // Initialization vector.
        const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);

        let encryptedText = Buffer.from(ciphertextBlob, 'base64'); // 将加密数据从Base64格式转换为Buffer
        let decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString(); // 将解密后的数据转换为字符串
    }


    // 如果userId不同，通过userEmail删除会话
    async deleteSessionByEmailIfUserIdDiffers(userId: string, userEmail: string) {
        // 使用UserEmail作为查询条件的GSI进行查询
        const queryParams = {
            ExpressionAttributeValues: {
                ':userEmail': userEmail
            },
            IndexName: 'UserEmail-index', // 您的GSI名称
            KeyConditionExpression: 'UserEmail = :userEmail',
            TableName: this.tableName,           
        };
    
        try {
            // 查询现有会话
            const result = await this.ddbDocClient.send(new QueryCommand(queryParams));
            console.log(`Sessions query for differing UserIds.`);
            
            // 检查result.Items是否为undefined，如果是，则使用空数组
            const items = result.Items || [];
            
            // 现在，即使result.Items是undefined，以下代码也可以正常工作
            const deletePromises = items.filter(item => item.UserId !== userId)
                .map(async (item) => {
                    const deleteParams = {
                        Key: { UserId: item.UserId },
                        TableName: this.tableName
                    };
                    return this.ddbDocClient.send(new DeleteCommand(deleteParams));
                });
            
            // 等待所有删除操作完成
            await Promise.all(deletePromises);
            console.log(`Sessions deleted for differing UserIds.`);
        } catch (error) {
            console.error('Error in deleting session by email if user ID differs:', error);
        }
    }


    // 存储会话信息到DynamoDB
    async storeSession(userId: string, accessToken: string, createdAt: Date, expiresIn: number, refreshToken: string, userEmail: string) {
        const createdAtIsoString = createdAt.toISOString(); // 将创建时间转换为ISO格式的字符串
    
        // 先加密accessToken和refreshToken
        const encryptedAccessToken = await this.encryptData(accessToken);
        const encryptedRefreshToken = await this.encryptData(refreshToken);
    
    
        // 修改前的准备调用
        await this.deleteSessionByEmailIfUserIdDiffers(userId, userEmail);
    
    
        const params = {
            Item: {                
                AccessToken: encryptedAccessToken, // 加密后的访问令牌
                CreatedAt: createdAtIsoString, // 创建时间
                ExpiresIn: expiresIn, // 过期时间
                RefreshToken: encryptedRefreshToken, // 加密后的刷新令牌                
                UserEmail: userEmail, // 用户邮箱
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
    
                // 将UserEmail添加到sessionData中
                const userEmail = result.Item.UserEmail ? result.Item.UserEmail : 'Email not available';
    
                const sessionData = {
                    accessToken: accessToken, // 解密后的访问令牌
                    createdAt: new Date(result.Item.CreatedAt), // 创建时间
                    expiresIn: result.Item.ExpiresIn, // 过期时间
                    refreshToken: refreshToken, // 解密后的刷新令牌
                    userEmail: userEmail, // 用户邮箱
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

}
// 导出DynamoDBSessionManager实例
export const sessionManager = new DynamoDBSessionManager();
