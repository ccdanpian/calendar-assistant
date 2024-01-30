// import {getPluginSettingsFromRequest} from '@lobehub/chat-plugin-sdk';
// import fetch from 'node-fetch';
import { OAuth2Client } from 'google-auth-library';
import { sessionManager } from './sessionManager';
import { runner } from './_utils'; // 假设这是处理日历操作的函数
// import { Settings } from './_types';

import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

// Google 相关的环境变量
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI;
const googleScopes = process.env.GOOGLE_SCOPES;

const googleUserId = process.env.GOOGLE_USER_ID;

const expiresIn_s: number = Number.parseInt(process.env.EXPIRES_IN || '1800', 10);

// 创建OAuth2Client实例
const authClient = new OAuth2Client(googleClientId, googleClientSecret, googleRedirectUri);


// 使用 Google OAuth2Client 解码 ID 令牌
async function decodeIdToken(idToken: string): Promise<any> {
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({
    audience: googleClientId,  // 指定您的 Google OAuth 2.0 客户端 ID
    idToken: idToken,    
  });
  return ticket.getPayload();
}

// 从 OAuth 令牌中提取用户 ID（例如，用户的邮箱）
async function extractUserIdFromOAuth(tokens: any): Promise<string> {
  if (tokens && tokens.id_token) {
    try {
      const decodedIdToken = await decodeIdToken(tokens.id_token);
      console.log('decodeIdToken', decodedIdToken);
      return decodedIdToken.email; // 使用解码后的 ID 令牌中的电子邮件地址
    } catch (error) {
      const message = (error as Error).message;
      console.error(message);
      throw new Error('Error decoding ID token: ' + message);
    }    
  } else {
    throw new Error('No ID token found in OAuth tokens');
  }
}

function buildAuthUrl() {
  const authEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';

  // 确保所有环境变量都有值，或提供默认值
  const clientId = googleClientId || 'default-client-id';
  const redirectUri = googleRedirectUri || 'default-redirect-uri';
  const scopes = googleScopes || 'https://www.googleapis.com/auth/calendar openid email';

  const queryParams = new URLSearchParams({
    access_type: 'offline', 
    client_id: clientId,
    prompt: 'consent',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes
  });

  return `${authEndpoint}?${queryParams.toString()}`;
}


app.use(async (req: Request, res: Response) => {
  try {
    if (req.path === '/api/calendar' && req.method === 'GET') {
      // ... googleAuth.ts 中的 GET 请求处理逻辑 ...
      //检查是否是OAuth回调请求（通常带有授权码）
      const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
      const authorizationCode = urlParams.get('code');

      if (authorizationCode) {
        // 使用授权码换取访问令牌
        const { tokens } = await authClient.getToken({ code: authorizationCode, redirect_uri: googleRedirectUri });
        authClient.setCredentials(tokens);

        // 存储用户会话
        // 从 OAuth 提供的信息中获取用户身份
        const userId = await extractUserIdFromOAuth(tokens);// 这里需要实现 extractUserIdFromOAuth 函数
        const accessToken = tokens.access_token || 'no-access-token'; // 提供默认值或处理为错误
        const refreshToken = tokens.refresh_token || 'no-refresh-token'; // 提供默认值或处理为错误

        // const expiresIn = expiresIn; //设置为30分钟

        sessionManager.storeSession(userId, {
          accessToken: accessToken,
          createdAt: new Date(),
          expiresIn: expiresIn_s, // 使用处理过的值
          refreshToken: refreshToken
        });

        // 返回成功消息
        res.json({ message: 'Authentication successful' });
        return;
      }

      // 如果没有授权码，返回错误
      res.status(400).json({ error: 'Authorization code missing' });
      return;

    } else if (req.method === 'POST') {
      // ... 原 app.ts 中的 POST 请求处理逻辑 ...
      const rawArgs = req.body;
      const args = JSON.parse(rawArgs);

      console.log(`000000, req.body`, req.body);

      const userId = googleUserId || 'zhanghua.x@gmail.com'; 

      let session = sessionManager.getSession(userId);

      console.log(`111111`, userId);

      if (!session) {
        // 会话不存在，生成跳转认证URL
        console.log(`222222, 会话不存在, 生成跳转认证URL`);
        const authUrl = buildAuthUrl();  
        res.json({ authUrl: authUrl });
        return;
      }

      if (!session || !session.accessToken || new Date() > new Date(session.createdAt.getTime() + ((session.expiresIn || 0) * 1000))) {
        // ... 其他代码 ...
        console.log(`333333, refreshToken: `, session.refreshToken);
        if (session && session.refreshToken) {
          try {
            console.log(`555555, try refesh: `, session.refreshToken);
            // 使用 Google Auth Library 刷新令牌
            authClient.setCredentials({
              refresh_token: session.refreshToken
            });
        
            const { credentials } = await authClient.refreshAccessToken();
        
            // 更新会话信息
            sessionManager.storeSession(userId, {
              accessToken: credentials.access_token || 'default-access-token', // 提供默认值或处理为错误,
              createdAt: new Date(),
              // expiresIn: credentials.expiry_date || 0, // 如果expiry_date为null或undefined，则使用0,
              expiresIn: expiresIn_s, // 设置为30分钟
              refreshToken: credentials.refresh_token || session.refreshToken
            });
        
            // 继续处理原始请求
          } catch (error) {
            // 如果刷新令牌失败，处理错误
            console.error('Error refreshing token:', error);
            res.status(401).json({ error: 'Failed to refresh token' });
            return;
          }
        } else {
          // 如果没有有效的刷新令牌，需要重新授权
          console.log(`666666, 无有效令牌，需要重新授权`, session.refreshToken);
          const authUrl = buildAuthUrl();
          res.status(401).json({ authUrl: authUrl });
          return;
        }        
      }

      const result = await runner(args, userId);  //执行日历操作
      res.status(200).json(result);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error:', error);
      res.status(500).json({ error: error.message, stack: error.stack });
    } else {
      // 处理其他类型的错误或未知错误
      console.error('Unknown error', error);
      res.status(500).json({ error: "An unknown error occurred" });
    }
  }  
});

module.exports = app;
