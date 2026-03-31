import { Injectable, NgZone } from '@angular/core';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import { Observable } from 'rxjs';

export interface RealtimePresencePayload {
  userId: string;
  isActive: boolean;
}

export interface RealtimeUserPayload {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string;
  isActive: boolean;
}

export interface RealtimeMessagePayload {
  id: string;
  conversationId: string;
  content: string | null;
  imageUrl: string | null;
  timestamp: string;
  sender: RealtimeUserPayload;
}

export interface RealtimeConversationPayload {
  id: string;
  updatedAt: string;
  participants: RealtimeUserPayload[];
  lastMessage: RealtimeMessagePayload | null;
}

export interface RealtimeTypingPayload {
  conversationId: string;
  userId: string;
  fullName: string;
  typing: boolean;
  timestamp: string;
}

export interface RealtimeReadPayload {
  conversationId: string;
  userId: string;
  fullName: string;
  lastReadAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class RealtimeService {
  private client: Client | null = null;

  constructor(private ngZone: NgZone) {}

  private ensureConnection() {
    if (this.client?.active) {
      return;
    }

    this.client = new Client({
      brokerURL: 'ws://localhost:8080/ws',
      connectHeaders: {
        Authorization: `Bearer ${localStorage.getItem('social_auth_token') ?? ''}`
      },
      reconnectDelay: 5000,
      debug: () => undefined
    });

    this.client.activate();
  }

  subscribeToTopic<T>(topic: string): Observable<T> {
    this.ensureConnection();

    return new Observable<T>((observer) => {
      let subscription: StompSubscription | null = null;

      const subscribeWhenConnected = () => {
        if (!this.client?.connected) {
          setTimeout(subscribeWhenConnected, 150);
          return;
        }

        subscription = this.client.subscribe(topic, (message: IMessage) => {
          try {
            this.ngZone.run(() => {
              observer.next(JSON.parse(message.body) as T);
            });
          } catch (error) {
            this.ngZone.run(() => {
              observer.error(error);
            });
          }
        });
      };

      subscribeWhenConnected();

      return () => {
        subscription?.unsubscribe();
      };
    });
  }

  subscribeToConversation(conversationId: string): Observable<RealtimeMessagePayload> {
    return this.subscribeToTopic<RealtimeMessagePayload>(`/topic/conversations/${conversationId}`);
  }

  subscribeToUserConversations(userId: string): Observable<RealtimeConversationPayload> {
    return this.subscribeToTopic<RealtimeConversationPayload>(`/topic/users/${userId}/conversations`);
  }

  subscribeToPresence(): Observable<RealtimePresencePayload> {
    return this.subscribeToTopic<RealtimePresencePayload>('/topic/presence');
  }

  subscribeToTyping(conversationId: string): Observable<RealtimeTypingPayload> {
    return this.subscribeToTopic<RealtimeTypingPayload>(`/topic/conversations/${conversationId}/typing`);
  }

  subscribeToRead(conversationId: string): Observable<RealtimeReadPayload> {
    return this.subscribeToTopic<RealtimeReadPayload>(`/topic/conversations/${conversationId}/read`);
  }

  publishTyping(conversationId: string, typing: boolean) {
    this.ensureConnection();

    const publishWhenConnected = () => {
      if (!this.client?.connected) {
        setTimeout(publishWhenConnected, 120);
        return;
      }

      this.client.publish({
        destination: `/app/typing/${conversationId}`,
        body: JSON.stringify({ typing })
      });
    };

    publishWhenConnected();
  }

  publishRead(conversationId: string) {
    this.ensureConnection();

    const publishWhenConnected = () => {
      if (!this.client?.connected) {
        setTimeout(publishWhenConnected, 120);
        return;
      }

      this.client.publish({
        destination: `/app/read/${conversationId}`,
        body: '{}'
      });
    };

    publishWhenConnected();
  }

  disconnect() {
    if (!this.client) {
      return;
    }

    this.client.deactivate();
    this.client = null;
  }
}
