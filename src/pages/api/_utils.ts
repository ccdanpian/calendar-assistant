import { google } from 'googleapis';

import { sessionManager } from './sessionManager';

// åå»º Google Calendar API å®¢æ·ç«¯
function getGoogleCalendarClient(accessToken) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({auth,  version: 'v3'});
}


// å°åå§æ°æ®è½¬æ¢ä¸º RunnerArgs ç±»å
function convertToRunnerArgs(data) {

  // 确保每个属性都正确访问
  const action = data.action;
  const subject = data.eventSummary;
  const description = data.eventDetails;
  const startDateTime = data['startDateTime'];
  const endDateTime = data['endDateTime'];
  const eventId = data.eventId;

  console.log(`Extracted data: action=${action}, subject=${subject}, description=${description}, startDateTime=${startDateTime}, endDateTime=${endDateTime}, eventId=${eventId}`);

  return {
    action: action,    
    end: {
      dateTime: endDateTime ? endDateTime : undefined,
      timeZone: 'Asia/Shanghai',
    },
    start: {
      dateTime: startDateTime ? startDateTime : undefined,
      timeZone: 'Asia/Shanghai',    
    },    
    description: description,
    eventId: eventId,
    subject: subject,
  };
}

async function addEvent(client, args) {
  const event = {
    description: args.description,
    end: args.end,
    start: args.start,
    summary: args.subject,    
  };
  const response = await client.events.insert({
    calendarId: 'primary',
    resource: event,
  });
  return response.data;
}

// 下面是各个函数的示例实现，您需要根据您的需求和 Google Calendar API 的使用来完善这些函数

async function listEvents(client, searchParams) {
  const {q, timeMax, timeMin} = searchParams;

  // 将 dateTime 从对象中提取并转换为 RFC3339 格式字符串
  const formattedTimeMin = timeMin.dateTime; // 假设为北京时间
  const formattedTimeMax = timeMax.dateTime; // 假设为北京时间

  try {
    const events = await client.events.list({
      calendarId: 'primary',
      q: q,
      timeMax: formattedTimeMax,
      timeMin: formattedTimeMin      
      // singleEvents: true,
      //orderBy: 'startTime'
    });
    return events.data.items;
  } catch (error) {
    console.error('Error fetching events:', error);
    throw error;
  }
}



async function updateEvent(client, args) {
  const { eventId, updateFields } = args; // updateFields 包含要更新的字段

  if (!eventId || !updateFields) {
    throw new Error('Event ID and update fields are required');
  }

  try {
    const updatedEvent = await client.events.update({
      calendarId: 'primary',
      eventId: eventId,
      resource: updateFields
    });
    return updatedEvent.data;
  } catch (error) {
    console.error('Error updating event:', error);
    throw error;
  }
}


async function deleteEvent(client, eventId) {
  if (!eventId) {
    console.error('请提供日程标题或者ID');
    return '请提供日程标题或者ID';
  }

  try {
    await client.events.delete({
      calendarId: 'primary',
      eventId: eventId
    });
    return { message: '日程已成功删除' };
  } catch (error) {
    console.error('删除日程时出错:', error);
    return '删除失败，请重试，重试的时候请提供日程标题或者ID';
  }
}


// Runner å½æ°
export async function runner(rawArgs: any, userId: string) {
  try {
    const session = sessionManager.getSession(userId);
    if (!session || !session.accessToken) {
      throw new Error('No valid session found');
    }
    const accessToken = session.accessToken;
    const client = getGoogleCalendarClient(accessToken);

    const args = convertToRunnerArgs(rawArgs); 
    console.log(`Executing action: ${args.action}`, args);

    switch (args.action) {
      case 'add':      
        return await addEvent(client, args);
      case 'list':
        // 假设 args 中包含 timeMin, timeMax 和 q
        const searchParams = {    
          q: args.subject,      
          timeMax: args.end,
          timeMin: args.start,          
        };
        return await listEvents(client, searchParams);
      case 'update':
        return await updateEvent(client, args); // 假设 updateEvent 是定义好的函数
      case 'delete':
        return await deleteEvent(client, args.eventId); // 假设 deleteEvent 是定义好的函数
      default:
        throw new Error('Invalid action');
    }
  } catch (error) {
    console.error('Error in runner:', error);
    throw error;
  }
}


export default runner;
