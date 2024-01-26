const { OAuth2Client } = require('google-auth-library');
import { sessionManager } from './sessionManager';

// 环境变量
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

// 创建实例
const authClient = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

export default async (req, res) => {
  try {
    //检查是否是OAuth回调请求（通常带有授权码）
    if (req.method === 'GET') {
      const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
      const authorizationCode = urlParams.get('code');

      if (authorizationCode) {
        // 使用授权码换取访问令牌
        const { tokens } = await authClient.getToken({ code: authorizationCode, redirect_uri: REDIRECT_URI });
        authClient.setCredentials(tokens);

        // 存储用户会话
        const userId = '12345'; // 这里需要逻辑来确定用户ID
        sessionManager.storeSession(userId, {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn: tokens.expiry_date,
          createdAt: new Date()
        });

        // 返回成功消息
        res.json({ message: 'Authentication successful' });
        return;
      }

      // 如果没有授权码，返回错误
      res.status(400).json({ error: 'Authorization code missing' });
      return;
    }

    // 处理令牌刷新请求（POST）
    if (req.method === 'POST') {
      const userId = '12345'; // 从请求中获取用户ID
      const session = sessionManager.getSession(userId);

      if (session && session.refreshToken) {
        // 使用Google Auth Library刷新访问令牌
        const { credentials } = await authClient.refreshToken(session.refreshToken);
        sessionManager.storeSession(userId, {
          accessToken: credentials.access_token,
          refreshToken: credentials.refresh_token || session.refreshToken,
          expiresIn: credentials.expiry_date,
          createdAt: new Date()
        });

        res.json({ accessToken: credentials.access_token });
        return;
      }

      res.status(400).json({ error: 'Refresh token missing or invalid' });
      return;
    }

    // 非GET或POST请求返回错误
    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
};