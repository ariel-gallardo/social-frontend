import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ChatService, Conversation, Message, User } from '../../services/chat.service';
import { AuthService } from '../../core/services/auth.service';
import { Subscription, finalize, firstValueFrom } from 'rxjs';
import { RealtimeConversationPayload, RealtimeMessagePayload, RealtimePresencePayload, RealtimeReadPayload, RealtimeService, RealtimeTypingPayload } from '../../services/realtime.service';
import { MessageNotificationService } from '../../services/message-notification.service';
import { UploadService } from '../../services/upload.service';

@Component({
  selector: 'app-chat-area',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-area.html',
  styleUrl: './chat-area.css',
})
export class ChatArea implements OnInit {
  activeConversation: Conversation | null = null;
  conversations: Conversation[] = [];
  me: User | null = null;
  newMessageContent = '';
  selectedConversationId: string | null = null;
  selectedAttachment: { file: File; previewUrl: string; name: string; type: string } | null = null;
  typingByUser: Record<string, number> = {};
  otherTypingName = '';
  typingDots = '.';
  readByUserAt: Record<string, string> = {};
  uploadErrorMessage = '';
  loadingOlderMessages = false;
  loadingInitialMessages = false;
  hasMoreMessages = false;
  isConversationBlocked = false;
  isConversationFriend = false;
  showBottomJump = false;
  blockStatus: 'NONE' | 'BLOCKED' | 'BLOCKED_BY_OTHER' = 'NONE';
  blockActionLoading = false;

  private messagePage = 1;
  private readonly messagePageSize = 5;
  private currentMessagesConversationId: string | null = null;

  /** Pending scroll restoration: applied after the loading spinner is removed. */
  private _pendingScrollContainer?: HTMLElement;
  private _pendingScrollPreviousHeight?: number;

  private routeSub?: Subscription;
  private initialDataSub?: Subscription;
  private activeConversationSub?: Subscription;
  private wsConversationSub?: Subscription;
  private wsPresenceSub?: Subscription;
  private wsTypingSub?: Subscription;
  private wsReadSub?: Subscription;
  private wsUserConversationsSub?: Subscription;
  private friendshipChangesSub?: Subscription;
  private typingStopTimeout?: ReturnType<typeof setTimeout>;
  private typingDotsInterval?: ReturnType<typeof setInterval>;
  private readEmitTimeout?: ReturnType<typeof setTimeout>;
  private uploadErrorTimeout?: ReturnType<typeof setTimeout>;
  private scrollDebounceTimeout?: ReturnType<typeof setTimeout>;
  private readonly scrollDebounceMs = 220;

  constructor(
    private route: ActivatedRoute,
    private chatService: ChatService,
    private authService: AuthService,
    private realtimeService: RealtimeService,
    private cdr: ChangeDetectorRef,
    private messageNotificationService: MessageNotificationService,
    private uploadService: UploadService
  ) { }

  ngOnInit() {
    this.routeSub = this.route.paramMap.subscribe(params => {
      this.selectedConversationId = params.get('id');
      this.resolveActiveConversation();
      this.watchActiveConversation();
    });

    this.initialDataSub = this.chatService.getInitialData(15000).subscribe({
      next: (data) => {
        this.me = data.me ?? null;
        this.conversations = this.sortConversationsByUpdatedAt(data.getConversations ?? []);
        this.resolveActiveConversation();
        this.watchActiveConversation();
        this.watchPresence();
        this.cdr.markForCheck();
      },
      error: (err) => {
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
        }
      }
    });

    // Re-check block state whenever any friendship changes (block/unblock/remove friend)
    this.friendshipChangesSub = this.chatService.friendshipChanges$.subscribe(() => {
      this.checkConversationBlock();
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
    this.initialDataSub?.unsubscribe();
    this.activeConversationSub?.unsubscribe();
    this.wsConversationSub?.unsubscribe();
    this.wsPresenceSub?.unsubscribe();
    this.wsTypingSub?.unsubscribe();
    this.wsReadSub?.unsubscribe();
    this.wsUserConversationsSub?.unsubscribe();
      this.friendshipChangesSub?.unsubscribe();
    if (this.typingStopTimeout) {
      clearTimeout(this.typingStopTimeout);
    }
    if (this.typingDotsInterval) {
      clearInterval(this.typingDotsInterval);
    }
    if (this.readEmitTimeout) {
      clearTimeout(this.readEmitTimeout);
    }
    if (this.uploadErrorTimeout) {
      clearTimeout(this.uploadErrorTimeout);
    }
    if (this.scrollDebounceTimeout) {
      clearTimeout(this.scrollDebounceTimeout);
    }
    if (this.selectedAttachment?.previewUrl) {
      URL.revokeObjectURL(this.selectedAttachment.previewUrl);
    }
  }

  private watchPresence() {
    if (this.wsPresenceSub) {
      return;
    }

    this.wsPresenceSub = this.realtimeService.subscribeToPresence().subscribe({
      next: (presence) => {
        this.applyPresence(presence);
        this.cdr.detectChanges();
      }
    });

    if (!this.wsUserConversationsSub && this.me?.id) {
      this.wsUserConversationsSub = this.realtimeService.subscribeToUserConversations(this.me.id).subscribe({
        next: (payload) => {
          this.applyConversationRefresh(payload);
          this.cdr.detectChanges();
        }
      });
    }
  }

  private applyConversationRefresh(payload: RealtimeConversationPayload) {
    if (this.activeConversation?.id !== payload.id || !payload.lastMessage) {
      return;
    }

    const alreadyExists = this.activeConversation.messages.some((message) => message.id === payload.lastMessage?.id);
    if (alreadyExists) {
      return;
    }

    this.appendRealtimeMessage(payload.lastMessage);
    this.cdr.markForCheck();
  }

  private applyPresence(presence: RealtimePresencePayload) {
    this.conversations = this.conversations.map((conversation) => ({
      ...conversation,
      participants: conversation.participants.map((participant) =>
        participant.id === presence.userId
          ? { ...participant, isActive: presence.isActive }
          : participant
      )
    }));

    this.conversations = this.sortConversationsByUpdatedAt(this.conversations);

    if (!this.activeConversation) {
      return;
    }

    this.activeConversation = {
      ...this.activeConversation,
      participants: this.activeConversation.participants.map((participant) =>
        participant.id === presence.userId
          ? { ...participant, isActive: presence.isActive }
          : participant
      )
    };

    this.cdr.markForCheck();
  }

  private resolveActiveConversation() {
    const previousActiveConversation = this.activeConversation;

    const nextActiveConversation = this.selectedConversationId
      ? (this.conversations.find((conversation) => conversation.id === this.selectedConversationId) ?? null)
      : (this.conversations[0] ?? null);

    if (
      previousActiveConversation &&
      nextActiveConversation &&
      previousActiveConversation.id === nextActiveConversation.id
    ) {
      this.activeConversation = {
        ...nextActiveConversation,
        messages: previousActiveConversation.messages
      };
      return;
    }

    this.activeConversation = nextActiveConversation;
  }

  private sortConversationsByUpdatedAt(conversations: Conversation[]): Conversation[] {
    return [...conversations].sort((first, second) =>
      new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
    );
  }

  private watchActiveConversation() {
    this.activeConversationSub?.unsubscribe();
    this.wsConversationSub?.unsubscribe();
    this.wsTypingSub?.unsubscribe();
    this.wsReadSub?.unsubscribe();

    const targetConversationId = this.selectedConversationId ?? this.activeConversation?.id ?? null;
    if (!targetConversationId) {
      return;
    }

    this.activeConversationSub = this.chatService.getConversation(targetConversationId, 20000).subscribe({
      next: (conversation) => {
        if (!conversation) {
          return;
        }
        const messageSeed = this.currentMessagesConversationId === conversation.id
          ? this.activeConversation?.messages ?? []
          : [];

        this.activeConversation = {
          ...conversation,
          messages: messageSeed
        };

        if (this.currentMessagesConversationId !== conversation.id) {
          this.currentMessagesConversationId = conversation.id;
          this.messagePage = 1;
          this.hasMoreMessages = false;
          this.blockStatus = 'NONE';
          this.isConversationBlocked = false;
          this.loadMessagesPage(true);
          this.checkConversationBlock();
        }

        this.messageNotificationService.clearConversation(targetConversationId);
        this.emitRead();
        this.cdr.detectChanges();
      },
      error: (err) => {
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
        }
      }
    });

    this.wsConversationSub = this.realtimeService.subscribeToConversation(targetConversationId).subscribe({
      next: (wsMessage) => {
        this.appendRealtimeMessage(wsMessage);
        this.cdr.detectChanges();
      }
    });

    this.wsTypingSub = this.realtimeService.subscribeToTyping(targetConversationId).subscribe({
      next: (typingPayload) => {
        this.applyTypingPayload(typingPayload);
        this.cdr.detectChanges();
      }
    });

    this.wsReadSub = this.realtimeService.subscribeToRead(targetConversationId).subscribe({
      next: (readPayload) => {
        this.applyReadPayload(readPayload);
        this.cdr.detectChanges();
      }
    });

    this.emitRead();
    this.messageNotificationService.clearConversation(targetConversationId);
  }

  private applyReadPayload(payload: RealtimeReadPayload) {
    if (!this.activeConversation || payload.conversationId !== this.activeConversation.id) {
      return;
    }
    this.readByUserAt[payload.userId] = payload.lastReadAt;
    this.cdr.markForCheck();
  }

  private applyTypingPayload(payload: RealtimeTypingPayload) {
    if (!this.activeConversation || this.me?.id === payload.userId) {
      return;
    }
    if (payload.conversationId !== this.activeConversation.id) {
      return;
    }

    if (!payload.typing) {
      delete this.typingByUser[payload.userId];
    } else {
      this.typingByUser[payload.userId] = Date.now();
      this.otherTypingName = payload.fullName;
    }

    const now = Date.now();
    Object.keys(this.typingByUser).forEach((userId) => {
      if (now - this.typingByUser[userId] >= 3500) {
        delete this.typingByUser[userId];
      }
    });

    const activeTypingUserId = Object.entries(this.typingByUser)
      .find(([, ts]) => now - ts < 3500)?.[0];

    if (!activeTypingUserId) {
      this.otherTypingName = '';
      this.cdr.markForCheck();
      return;
    }

    if (!this.typingDotsInterval) {
      const sequence = ['.', '..', '...'];
      let index = 0;
      this.typingDotsInterval = setInterval(() => {
        this.typingDots = sequence[index % sequence.length];
        index += 1;
        this.cdr.detectChanges();
      }, 450);
    }

    this.cdr.markForCheck();
  }

  get isOtherTyping(): boolean {
    return this.otherTypingName.trim().length > 0;
  }

  private appendRealtimeMessage(wsMessage: RealtimeMessagePayload) {
    if (!this.activeConversation || this.activeConversation.id !== wsMessage.conversationId) {
      return;
    }

    const alreadyExists = this.activeConversation.messages.some((message) => message.id === wsMessage.id);
    if (alreadyExists) {
      return;
    }

    this.activeConversation = {
      ...this.activeConversation,
      updatedAt: wsMessage.timestamp,
      messages: [...this.activeConversation.messages, {
        id: wsMessage.id,
        content: wsMessage.content ?? '',
        imageUrl: wsMessage.imageUrl ?? '',
        timestamp: wsMessage.timestamp,
        sender: {
          id: wsMessage.sender.id,
          username: wsMessage.sender.username,
          fullName: wsMessage.sender.fullName,
          avatarUrl: wsMessage.sender.avatarUrl,
          isActive: wsMessage.sender.isActive
        }
      }]
    };

    if (wsMessage.sender.id !== this.me?.id) {
      this.emitRead();
    }

    this.cdr.markForCheck();

    if (wsMessage.sender.id === this.me?.id) {
      this.scrollToBottom();
    }
  }

  getOtherParticipant(conv: Conversation | null): User | undefined {
    if (!conv) return undefined;
    return conv.participants.find(p => p.id !== this.me?.id);
  }

  async sendMessage() {
    const trimmedContent = this.newMessageContent.trim();
    if (!trimmedContent && !this.selectedAttachment) return;
    if (!this.activeConversation) return;
  if (this.isConversationBlocked || !this.isConversationFriend) return;

    const content = trimmedContent || (this.selectedAttachment?.type.startsWith('image/') ? '' : this.selectedAttachment?.name || 'Attachment');

    let imageUrl: string | undefined;
    if (this.selectedAttachment) {
      try {
        const upload = await firstValueFrom(this.uploadService.uploadImage(this.selectedAttachment.file, 'chat'));
        imageUrl = upload.url;
      } catch {
        this.showTemporaryUploadError('No se pudo subir la imagen. Intentá nuevamente.');
        return;
      }
    }

    this.newMessageContent = '';
    if (this.selectedAttachment?.previewUrl) {
      URL.revokeObjectURL(this.selectedAttachment.previewUrl);
    }
    this.selectedAttachment = null;
    this.emitTyping(false);

    this.chatService.sendMessage(this.activeConversation.id, content, imageUrl).subscribe({
      next: () => {
        this.scrollToBottom();
      },
      error: (err) => {
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
        } else if (err?.message?.toLowerCase().includes('block') || JSON.stringify(err)?.toLowerCase().includes('block')) {
          this.blockStatus = 'BLOCKED_BY_OTHER';
          this.isConversationBlocked = true;
          this.checkConversationBlock();
          this.cdr.detectChanges();
        }
      }
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.showTemporaryUploadError('Solo se pueden adjuntar imágenes en el chat.');
      input.value = '';
      return;
    }

    this.selectedAttachment = {
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
      type: file.type || 'application/octet-stream'
    };

    input.value = '';
  }

  clearAttachment() {
    if (this.selectedAttachment?.previewUrl) {
      URL.revokeObjectURL(this.selectedAttachment.previewUrl);
    }
    this.selectedAttachment = null;
  }

  onMessagesScroll(event: Event) {
    const container = event.target as HTMLElement;
    this.updateScrollIndicators(container);

    if (!this.hasMoreMessages || this.loadingOlderMessages) {
      return;
    }

    if (this.scrollDebounceTimeout) {
      clearTimeout(this.scrollDebounceTimeout);
    }

    this.scrollDebounceTimeout = setTimeout(() => {
      if (!this.hasMoreMessages || this.loadingOlderMessages) {
        return;
      }
      if (container.scrollTop <= 80) {
        this.loadMessagesPage(false, container);
      }
    }, this.scrollDebounceMs);
  }

  private loadMessagesPage(reset: boolean, container?: HTMLElement) {
    if (!this.activeConversation) {
      return;
    }

    if (reset) {
      this.messagePage = 1;
      this.hasMoreMessages = false;
      this.showBottomJump = false;
      this.activeConversation = {
        ...this.activeConversation,
        messages: []
      };
      this.loadingInitialMessages = true;
    }

    // Capture height BEFORE the loading spinner appears so the delta is pure message height.
    const previousHeight = container?.scrollHeight ?? 0;
    this.loadingOlderMessages = true;
    this.cdr.detectChanges();

    this.chatService.getConversationMessagesPage(this.activeConversation.id, this.messagePage, this.messagePageSize)
      .pipe(finalize(() => {
        this.loadingOlderMessages = false;
        if (reset) {
          this.loadingInitialMessages = false;
        }
        this.cdr.detectChanges();

        // Restore scroll AFTER the loading spinner is removed from the DOM so the
        // layout shift caused by its removal is already reflected in scrollHeight.
        if (this._pendingScrollContainer !== undefined && this._pendingScrollPreviousHeight !== undefined) {
          const target = this._pendingScrollContainer;
          const ph = this._pendingScrollPreviousHeight;
          this._pendingScrollContainer = undefined;
          this._pendingScrollPreviousHeight = undefined;
          setTimeout(() => {
            target.scrollTop = Math.max(0, target.scrollHeight - ph);
            this.updateScrollIndicators(target);
          }, 0);
        }
      }))
      .subscribe({
        next: (pageData) => {
          if (!this.activeConversation) {
            return;
          }

          const newItems = pageData.items.filter((incoming) =>
            !this.activeConversation?.messages.some((current) => current.id === incoming.id)
          );

          this.activeConversation = {
            ...this.activeConversation,
            messages: [...newItems, ...this.activeConversation.messages]
          };

          this.hasMoreMessages = pageData.hasMore;
          this.messagePage += 1;

          this.cdr.detectChanges();

          if (reset) {
            this.scrollToBottom();
            return;
          }

          // Schedule scroll restoration for after finalize removes the spinner.
          // We store previousHeight (before ANY changes, including spinner) so
          // that scrollHeight - previousHeight equals exactly the height of the
          // newly prepended messages.
          if (container) {
            this._pendingScrollContainer = container;
            this._pendingScrollPreviousHeight = previousHeight;
          }
        },
        error: (err) => {
          if (this.authService.isUnauthorizedError(err)) {
            this.authService.logout();
          }
        }
      });
  }

  private checkConversationBlock() {
    if (!this.activeConversation || !this.me) return;
    const other = this.activeConversation.participants.find(p => p.id !== this.me!.id);
    if (!other) return;
    this.chatService.getFriendStatus(other.id).subscribe({
      next: (status) => {
        const serverStatus = status?.status ?? 'NONE';
        this.blockStatus = serverStatus === 'BLOCKED_BY_OTHER' ? 'BLOCKED_BY_OTHER' : serverStatus === 'BLOCKED' ? 'BLOCKED' : 'NONE';
        this.isConversationBlocked = this.blockStatus !== 'NONE';
        this.isConversationFriend = status?.isFriend === true && !this.isConversationBlocked;
        this.cdr.detectChanges();
      },
      error: () => { /* silent */ }
    });
  }

  get canSendMessages(): boolean {
    return this.isConversationFriend && !this.isConversationBlocked;
  }

  get isBlockedByMe(): boolean {
    return this.blockStatus === 'BLOCKED';
  }

  get isBlockedByOther(): boolean {
    return this.blockStatus === 'BLOCKED_BY_OTHER';
  }

  blockCurrentConversationUser() {
    if (this.blockActionLoading || !this.activeConversation || !this.me) {
      return;
    }

    const other = this.activeConversation.participants.find((participant) => participant.id !== this.me?.id);
    if (!other) {
      return;
    }

    this.blockActionLoading = true;
    this.chatService.blockUser(other.id).pipe(
      finalize(() => {
        this.blockActionLoading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        this.blockStatus = 'BLOCKED';
        this.isConversationBlocked = true;
      },
      error: (err) => {
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
        }
      }
    });
  }

  unblockCurrentConversationUser() {
    if (this.blockActionLoading || !this.activeConversation || !this.me || !this.isBlockedByMe) {
      return;
    }

    const other = this.activeConversation.participants.find((participant) => participant.id !== this.me?.id);
    if (!other) {
      return;
    }

    this.blockActionLoading = true;
    this.chatService.unblockUser(other.id).pipe(
      finalize(() => {
        this.blockActionLoading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        this.blockStatus = 'NONE';
        this.isConversationBlocked = false;
      },
      error: (err) => {
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
        }
      }
    });
  }

  private showTemporaryUploadError(message: string) {
    this.uploadErrorMessage = message;
    if (this.uploadErrorTimeout) {
      clearTimeout(this.uploadErrorTimeout);
    }
    this.uploadErrorTimeout = setTimeout(() => {
      this.uploadErrorMessage = '';
      this.cdr.markForCheck();
    }, 3500);
    this.cdr.markForCheck();
  }

  private scrollToBottom() {
    setTimeout(() => {
      const container = document.getElementById('chat-messages-scroll');
      if (!container) {
        return;
      }
      container.scrollTop = container.scrollHeight;
      this.updateScrollIndicators(container);
    });
  }

  jumpToLatest() {
    const container = document.getElementById('chat-messages-scroll');
    if (!container) {
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    this.updateScrollIndicators(container);
  }

  private updateScrollIndicators(container: HTMLElement) {
    this.showBottomJump = container.scrollHeight - (container.scrollTop + container.clientHeight) > 140;
    this.cdr.markForCheck();
  }

  onMessageInputChange() {
    const hasText = this.newMessageContent.trim().length > 0;
    this.emitTyping(hasText);
  }

  private emitTyping(isTyping: boolean) {
    const conversationId = this.activeConversation?.id;
    if (!conversationId) {
      return;
    }

    this.realtimeService.publishTyping(conversationId, isTyping);

    if (this.typingStopTimeout) {
      clearTimeout(this.typingStopTimeout);
    }

    if (isTyping) {
      this.typingStopTimeout = setTimeout(() => {
        this.realtimeService.publishTyping(conversationId, false);
      }, 1800);
    }
  }

  private emitRead() {
    const conversationId = this.activeConversation?.id;
    if (!conversationId) {
      return;
    }

    if (this.readEmitTimeout) {
      clearTimeout(this.readEmitTimeout);
    }

    this.readEmitTimeout = setTimeout(() => {
      this.realtimeService.publishRead(conversationId);
    }, 120);
  }

  messageStatusIcon(message: { sender: User; timestamp: string }): 'check_circle' | 'done_all' {
    if (message.sender.id !== this.me?.id) {
      return 'check_circle';
    }

    const otherUserId = this.getOtherParticipant(this.activeConversation)?.id;
    if (!otherUserId) {
      return 'check_circle';
    }

    const readAt = this.readByUserAt[otherUserId];
    if (!readAt) {
      return 'check_circle';
    }

    return new Date(readAt).getTime() >= new Date(message.timestamp).getTime()
      ? 'done_all'
      : 'check_circle';
  }

  isImageUrl(url?: string | null): boolean {
    if (!url) {
      return false;
    }
    return /\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i.test(url);
  }

  shouldShowDateHeader(messages: Message[], index: number): boolean {
    if (index === 0) {
      return true;
    }

    const current = new Date(messages[index].timestamp);
    const previous = new Date(messages[index - 1].timestamp);

    return current.toDateString() !== previous.toDateString();
  }

  formatDateHeader(timestamp: string): string {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Hoy';
    }

    if (date.toDateString() === yesterday.toDateString()) {
      return 'Ayer';
    }

    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  downloadName(msg: { content?: string | null; imageUrl?: string | null }): string {
    return msg.content?.trim() || 'attachment';
  }

  onlineLabel(conv: Conversation | null): string {
    return this.getOtherParticipant(conv)?.isActive ? 'Online' : 'Offline';
  }

  formatTime(timestamp: string): string {
    const d = new Date(timestamp);
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
  }
}
