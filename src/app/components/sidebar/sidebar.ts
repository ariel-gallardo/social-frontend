import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ChatService, Conversation, User } from '../../services/chat.service';
import { AuthService } from '../../core/services/auth.service';
import { NewChatDialog } from '../new-chat-dialog/new-chat-dialog';
import { RealtimeConversationPayload, RealtimePresencePayload, RealtimeService } from '../../services/realtime.service';
import { Subscription } from 'rxjs';
import { MessageNotificationService } from '../../services/message-notification.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, NewChatDialog],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar implements OnInit {
  me: User | null = null;
  conversations: Conversation[] = [];
  showNewChatDialog = false;
  private wsUserConversationsSub?: Subscription;
  private wsPresenceSub?: Subscription;
  private friendshipChangesSub?: Subscription;

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private router: Router,
    private realtimeService: RealtimeService,
    private cdr: ChangeDetectorRef,
    public messageNotificationService: MessageNotificationService
  ) { }

  ngOnInit() {
    this.chatService.getInitialData(15000).subscribe({
      next: (data) => {
        this.me = data.me ?? null;
        this.conversations = this.sortConversationsByUpdatedAt(data.getConversations ?? []);
        this.subscribeToRealtimeConversations();
        this.subscribeToFriendshipChanges();
        this.cdr.markForCheck();
      },
      error: (err) => {
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
        }
      }
    });
  }

  ngOnDestroy() {
    this.wsUserConversationsSub?.unsubscribe();
    this.wsPresenceSub?.unsubscribe();
    this.friendshipChangesSub?.unsubscribe();
  }

  private subscribeToFriendshipChanges() {
    if (this.friendshipChangesSub) {
      return;
    }

    this.friendshipChangesSub = this.chatService.friendshipChanges$.subscribe(() => {
      this.chatService.getInitialData().subscribe({
        next: (data) => {
          this.me = data.me ?? this.me;
          this.conversations = this.sortConversationsByUpdatedAt(data.getConversations ?? []);
          this.cdr.detectChanges();
        }
      });
    });
  }

  private subscribeToRealtimeConversations() {
    if (!this.me?.id || this.wsUserConversationsSub) {
      return;
    }

    this.wsUserConversationsSub = this.realtimeService.subscribeToUserConversations(this.me.id).subscribe({
      next: (payload) => {
        this.applyRealtimeConversation(payload);
        this.cdr.detectChanges();
      }
    });

    this.wsPresenceSub = this.realtimeService.subscribeToPresence().subscribe({
      next: (presence) => {
        this.applyRealtimePresence(presence);
        this.cdr.detectChanges();
      }
    });
  }

  private applyRealtimePresence(presence: RealtimePresencePayload) {
    this.conversations = this.conversations.map((conversation) => ({
      ...conversation,
      participants: conversation.participants.map((participant) =>
        participant.id === presence.userId
          ? { ...participant, isActive: presence.isActive }
          : participant
      )
    }));

    this.conversations = this.sortConversationsByUpdatedAt(this.conversations);

    this.cdr.markForCheck();
  }

  private sortConversationsByUpdatedAt(conversations: Conversation[]): Conversation[] {
    return [...conversations].sort((first, second) =>
      new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
    );
  }

  private applyRealtimeConversation(payload: RealtimeConversationPayload) {
    const otherParticipant = payload.participants.find((participant) => participant.id !== this.me?.id);
    const isActiveConversationRoute = this.router.url === `/chat/${payload.id}` || (this.router.url === '/chat' && this.conversations[0]?.id === payload.id);
    const isIncomingMessage = payload.lastMessage?.sender.id !== this.me?.id;

    const lastMessage = payload.lastMessage ? {
      id: payload.lastMessage.id,
      content: payload.lastMessage.content ?? '',
      imageUrl: payload.lastMessage.imageUrl ?? '',
      timestamp: payload.lastMessage.timestamp,
      sender: {
        id: payload.lastMessage.sender.id,
        username: payload.lastMessage.sender.username,
        fullName: payload.lastMessage.sender.fullName,
        avatarUrl: payload.lastMessage.sender.avatarUrl,
        isActive: payload.lastMessage.sender.isActive
      }
    } : null;

    if (payload.lastMessage && otherParticipant && isIncomingMessage && !isActiveConversationRoute) {
      this.messageNotificationService.notifyIncoming({
        conversationId: payload.id,
        userId: otherParticipant.id,
        fullName: otherParticipant.fullName,
        avatarUrl: otherParticipant.avatarUrl,
        preview: payload.lastMessage.content?.trim() || 'Sent you an attachment'
      });
    }

    const existingIndex = this.conversations.findIndex((conversation) => conversation.id === payload.id);
    const nextConversation: Conversation = {
      id: payload.id,
      updatedAt: payload.updatedAt,
      participants: payload.participants.map((participant) => ({
        id: participant.id,
        username: participant.username,
        fullName: participant.fullName,
        avatarUrl: participant.avatarUrl,
        isActive: participant.isActive
      })),
      messages: lastMessage ? [lastMessage] : [],
      lastMessage
    };

    if (existingIndex === -1) {
      this.conversations = [nextConversation, ...this.conversations];
      this.cdr.markForCheck();
      return;
    }

    const nextList = [...this.conversations];
    nextList.splice(existingIndex, 1);
    this.conversations = [nextConversation, ...nextList];
    this.cdr.markForCheck();
  }

  openNewChatDialog() {
    this.showNewChatDialog = true;
  }

  closeNewChatDialog() {
    this.showNewChatDialog = false;
  }

  onUserSelectedForChat(user: User) {
    this.chatService.startConversation(user.id).subscribe({
      next: (conversation) => {
        this.router.navigate(['/chat', conversation.id]);
      },
      error: (err) => {
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
        }
      }
    });
  }

  getOtherParticipant(conv: Conversation): User | undefined {
    return conv.participants.find(p => p.id !== this.me?.id);
  }

  getLastMessage(conv: Conversation) {
    if (conv.lastMessage) return conv.lastMessage;
    if (!conv.messages || conv.messages.length === 0) return null;
    return conv.messages[conv.messages.length - 1];
  }

  getTimeAgo(timestamp: string): string {
    const diff = new Date().getTime() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days === 1) return `Yesterday`;
    return `${days}d`;
  }
}
