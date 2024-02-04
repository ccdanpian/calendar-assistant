// pages/api/time_assistant/currentTime.ts
import { getCurrentTime } from '@lobehub/chat-plugin-sdk';
import moment from 'moment-timezone';

export default async (req, res) => {
  try {
    // 确保只处理 POST 请求
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // 获取请求参数
    const args = req.body;

    // 检查时区参数是否存在，如果不存在，则使用北京时间时区作为默认值
    const timezone = args.timezone || 'Asia/Shanghai';
    
    // 获取当前时间
    const currentTime = moment().tz(timezone).format('YYYY-MM-DDTHH:mm:ss.SSSZ');
    // 获取当前星期几
    const dayOfWeek = moment().tz(timezone).format('dddd');
    
    // 构造响应数据
    const responseData = {
      currentTime: currentTime,
      dayOfWeek: dayOfWeek,
    };
    
    // 发送响应
    res.json(responseData);
  } catch (error) {
    // 如果有错误，返回错误响应
    res.status(500).json({ error: 'Internal server error' });
  }
};
