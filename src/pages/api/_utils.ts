import { google } from 'googleapis';

import { sessionManager } from './dynamoDBSessionManagerCrypto';

// 创建 Google Calendar API 客户端
function getGoogleCalendarClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ auth, version: 'v3' });
}


// 
function convertToRunnerArgs(data: any) {

  // 确保每个属性都正确访问
  const action = data.action;
  const subject = data.eventSummary;
  const description = data.eventDetails;
  const startDateTime = data['startDateTime'];
  const endDateTime = data['endDateTime'];
  const eventId = data.eventId;

  // console.log(`Extracted data: action=${action}, subject=${subject}, description=${description}, startDateTime=${startDateTime}, endDateTime=${endDateTime}, eventId=${eventId}`);

  return {
    action: action,    
    description: description,
    end: {
      dateTime: endDateTime ? endDateTime : undefined,
      timeZone: 'Asia/Shanghai',
    },
    eventId: eventId,
    start: {
      dateTime: startDateTime ? startDateTime : undefined,
      timeZone: 'Asia/Shanghai',    
    },  
    subject: subject,
  };
}

async function addEvent(client: any, calendarId: any, args: any) {
  let formattedTimeStart = ''; // 默认时间
  let formattedTimeEnd = ''; // 默认时间

  formattedTimeStart = (args.start) ? args.start : new Date().toISOString();
  formattedTimeEnd = (args.end) ? args.end : (() => {
    const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000);
    return twoHoursLater.toISOString();
  })();

  const event = {
    description: args.description,
    end: formattedTimeEnd,
    start: formattedTimeStart,
    summary: args.subject,    
  };

  const response = await client.events.insert({
    calendarId: calendarId,
    resource: event,
  });
  return response.data;
}

async function listEvents(client: any, calendarId: any, searchParams: any) {
  const {q, timeMax, timeMin} = searchParams;

  let formattedTimeMin = ''; // 默认时间
  let formattedTimeMax = ''; // 默认时间

  formattedTimeMin = (timeMin && timeMin.dateTime) ? timeMin.dateTime : new Date().toISOString();
  formattedTimeMax = (timeMax && timeMax.dateTime) ? timeMax.dateTime : (() => {
    const oneYearLater = new Date();
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
    return oneYearLater.toISOString();
  })();

  console.log(`Extracted data: action=list, startDateTime=${formattedTimeMin}, endDateTime=${formattedTimeMax}`);

  try {
    const events = await client.events.list({
      calendarId: calendarId,
      q: q,
      timeMax: formattedTimeMax,
      timeMin: formattedTimeMin,
    });
    return events.data.items.length === 0 ? '没有找到任何日程' : events.data.items;
  } catch (error) {
    console.error('Error fetching events:', error);
    throw error;
  }
}

async function updateEvent(client: any, calendarId: any, args: any) {
  const { eventId, updateFields } = args; // updateFields 包含要更新的字段

  if (!eventId || !updateFields) {
    throw new Error('Event ID and update fields are required');
  }

  try {
    const updatedEvent = await client.events.update({
      calendarId: calendarId,
      eventId: eventId,
      resource: updateFields
    });
    return updatedEvent.data;
  } catch (error) {
    console.error('Error updating event:', error);
    throw error;
  }
}


async function deleteEvent(client: any, calendarId: any, eventId: string) {
  if (!eventId) {
    console.error('请提供日程标题或者ID');
    return '请提供日程标题或者ID';
  }

  try {
    await client.events.delete({
      calendarId: calendarId,
      eventId: eventId
    });
    return { message: '日程已成功删除' };
  } catch (error) {
    console.error('删除日程时出错:', error);
    return '删除失败，请重试，重试的时候请提供日程标题或者ID';
  }
}


async function ensureCalendarExists(client: any, calendarName: string) {
  let calendarId = null;

  // 尝试查找具有指定名称的日历
  try {
    const calendarsList = await client.calendarList.list();
    const existingCalendar = calendarsList.data.items.find(calendar => calendar.summary === calendarName);
    if (existingCalendar) {
      calendarId = existingCalendar.id; // 如果找到了，使用找到的日历ID
    }
  } catch (error) {
    console.error('Error listing calendars:', error);
    throw new Error('Failed to list calendars');
  }

  // 如果没有找到具有指定名称的日历，则创建一个新的日历
  if (!calendarId) {
    try {
      const newCalendar = await client.calendars.insert({
        resource: { summary: calendarName }
      });
      calendarId = newCalendar.data.id; // 使用新创建的日历ID
    } catch (error) {
      console.error('Error creating calendar:', error);
      throw new Error('Failed to create calendar');
    }
  }

  return calendarId;
}


// Runner
export async function runner(rawArgs: any, userId: string) {
  try {
    const session = await sessionManager.getSession(userId);
    if (!session || !session.accessToken) {
      throw new Error('No valid session found');
    }
    const accessToken = session.accessToken;
    const client = getGoogleCalendarClient(accessToken);

    const args = convertToRunnerArgs(rawArgs); 
    console.log(`Executing action: ${args.action}`, args);

    const calendarName = 'CCALENDAR';
    
    // 确保日历存在并获取日历ID
    const calendarId = await ensureCalendarExists(client, calendarName);

    // 根据操作类型执行相应动作
    switch (args.action) {
      case 'add': {
        return await addEvent(client, calendarId, args);
      }
      case 'list': {
        // 假设 args 中包含 timeMin, timeMax 和 q
        const searchParams = {    
          q: args.subject,      
          timeMax: args.end,
          timeMin: args.start,          
        };
        return await listEvents(client, calendarId, searchParams);
      }
      case 'update': {
        return await updateEvent(client, calendarId, args);
      }
      case 'delete': {
        return await deleteEvent(client, calendarId, args.eventId);
      }
      default:
        throw new Error('Invalid action');
    }
  } catch (error) {
    console.error('Error in runner:', error);
    throw error;
  }
}

export default runner;
