// Define the structure of a user session
interface Session {
  accessToken: string;  
  createdAt: Date;
  expiresIn?: number;
  refreshToken?: string;
}

// Class for managing user sessions
class SessionManager {
  private sessions: Map<string, Session>;

  constructor() {
    this.sessions = new Map();
  }


  // Store or update a session for a specific user
  storeSession(userId: string, session: Session) {
    console.log(`Storing session for user ${userId}:`, session);
    this.sessions.set(userId, session);
    const retrievedSession = this.getSession(userId);
    console.log('Retrieved session for user', userId, retrievedSession);
  }

  // Retrieve a session for a specific user
  getSession(userId: string): Session | null {
    const session = this.sessions.get(userId);
    console.log(`Geted session for user ${userId}`, session);
    if (!session) {
      console.log(`No session found for user ${userId}`);
      return null;
    }
    return session;
  }

  // Update an existing session for a specific user
  // This can be used for refreshing tokens
  updateSession(userId: string, session: Session) {
    console.log(`Updating session for user ${userId}`);
    this.sessions.set(userId, session);
  }
}

// Export an instance of SessionManager for global use
export const sessionManager = new SessionManager();