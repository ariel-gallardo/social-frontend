import { Injectable, signal } from '@angular/core';

export interface MessageNotificationItem {
  conversationId: string;
  userId: string;
  fullName: string;
  avatarUrl: string;
  preview: string;
  unreadCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class MessageNotificationService {
  readonly items = signal<MessageNotificationItem[]>([]);
  readonly unreadByConversation = signal<Record<string, number>>({});

  notifyIncoming(payload: Omit<MessageNotificationItem, 'unreadCount'>) {
    const currentUnread = this.unreadByConversation()[payload.conversationId] ?? 0;
    const nextUnread = currentUnread + 1;

    this.unreadByConversation.set({
      ...this.unreadByConversation(),
      [payload.conversationId]: nextUnread
    });

    const nextItems = this.items().filter((item) => item.conversationId !== payload.conversationId);
    this.items.set([
      {
        ...payload,
        unreadCount: nextUnread
      },
      ...nextItems
    ].slice(0, 3));

    this.playSound();

    setTimeout(() => {
      this.items.set(this.items().filter((item) => item.conversationId !== payload.conversationId));
    }, 4500);
  }

  clearConversation(conversationId: string) {
    const nextUnread = { ...this.unreadByConversation() };
    delete nextUnread[conversationId];
    this.unreadByConversation.set(nextUnread);
    this.items.set(this.items().filter((item) => item.conversationId !== conversationId));
  }

  unreadCount(conversationId: string): number {
    return this.unreadByConversation()[conversationId] ?? 0;
  }

  private playSound() {
    try {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        return;
      }

      const audioContext = new AudioContextCtor();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.001, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.05, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch {
      // Ignore browser audio restrictions.
    }
  }
}
