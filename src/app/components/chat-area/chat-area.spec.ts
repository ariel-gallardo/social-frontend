import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { EMPTY, of, throwError } from 'rxjs';

import { ChatArea } from './chat-area';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../core/services/auth.service';
import { RealtimeService } from '../../services/realtime.service';
import { MessageNotificationService } from '../../services/message-notification.service';
import { UploadService } from '../../services/upload.service';

function createMockFunction<T extends (...args: any[]) => any>(implementation: T) {
  let currentImplementation = implementation;
  const calls: unknown[][] = [];

  const mock = ((...args: unknown[]) => {
    calls.push(args);
    return currentImplementation(...(args as Parameters<T>));
  }) as T & {
    calls: unknown[][];
    setImplementation: (nextImplementation: T) => void;
  };

  mock.calls = calls;
  mock.setImplementation = (nextImplementation: T) => {
    currentImplementation = nextImplementation;
  };

  return mock;
}

describe('ChatArea', () => {
  let component: ChatArea;
  let fixture: ComponentFixture<ChatArea>;
  let chatService: any;
  let uploadService: any;

  const createMessage = (id: string, minute: number) => ({
    id,
    content: `message-${id}`,
    imageUrl: '',
    timestamp: `2026-03-12T10:${minute.toString().padStart(2, '0')}:00`,
    sender: me
  });

  const me = {
    id: 'me',
    username: 'me',
    fullName: 'Me',
    avatarUrl: 'https://avatar/me.png',
    isActive: true
  };

  const conversation = {
    id: '1',
    updatedAt: '2026-03-12T10:00:00',
    participants: [
      me,
      {
        id: 'other',
        username: 'other',
        fullName: 'Other User',
        avatarUrl: 'https://avatar/other.png',
        isActive: true
      }
    ],
    messages: [],
    lastMessage: null
  };

  beforeEach(async () => {
    chatService = {
      getInitialData: createMockFunction(() => of({ me, getConversations: [conversation] })),
      getConversation: createMockFunction(() => of(conversation)),
      getConversationMessagesPage: createMockFunction(() => of({ items: [], hasMore: false, page: 1, size: 5 })),
      sendMessage: createMockFunction(() => of({})),
      friendshipChanges$: EMPTY
    };
    uploadService = {
      uploadImage: createMockFunction(() => of({ key: '', url: '' }))
    };

    await TestBed.configureTestingModule({
      imports: [ChatArea],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: '1' }))
          }
        },
        {
          provide: ChatService,
          useValue: chatService
        },
        {
          provide: AuthService,
          useValue: {
            isUnauthorizedError: () => false,
            logout: () => { }
          }
        },
        {
          provide: RealtimeService,
          useValue: {
            subscribeToConversation: () => of(),
            subscribeToPresence: () => of(),
            subscribeToTyping: () => of(),
            subscribeToRead: () => of(),
            subscribeToUserConversations: () => of(),
            publishTyping: () => { },
            publishRead: () => { }
          }
        },
        {
          provide: MessageNotificationService,
          useValue: {
            clearConversation: () => { }
          }
        },
        {
          provide: UploadService,
          useValue: uploadService
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatArea);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should request the first page with 5 messages when opening a conversation', () => {
    expect(
      chatService.getConversationMessagesPage.calls.some(
        (call: unknown[]) => JSON.stringify(call) === JSON.stringify(['1', 1, 5])
      )
    ).toBe(true);
  });

  it('should load older messages in pages of 5 when scrolling to the top', () => {
    const latestMessages = ['6', '7', '8', '9', '10'].map((id, index) => createMessage(id, index + 6));
    const olderMessages = ['1', '2', '3', '4', '5'].map((id, index) => createMessage(id, index + 1));

    component.activeConversation = {
      ...conversation,
      messages: latestMessages,
      lastMessage: latestMessages[latestMessages.length - 1]
    };
    component.hasMoreMessages = true;
    (component as any).messagePage = 2;

    chatService.getConversationMessagesPage.setImplementation(() =>
      of({ items: olderMessages, hasMore: false, page: 2, size: 5 })
    );

    // Invoke the internal method directly to bypass the 150ms scroll debounce
    (component as any).loadMessagesPage(false, undefined);

    expect(chatService.getConversationMessagesPage.calls.at(-1)).toEqual(['1', 2, 5]);
    expect(component.activeConversation?.messages.map((message: { id: string }) => message.id)).toEqual([
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'
    ]);
    expect(component.hasMoreMessages).toBe(false);
  });

  it('should guard against loading when already loading or no more messages', () => {
    const initialCallCount = chatService.getConversationMessagesPage.calls.length;
    const container = { scrollTop: 20, scrollHeight: 400 } as HTMLElement;

    component.hasMoreMessages = false;
    component.onMessagesScroll({ target: container } as unknown as Event);
    component.onMessagesScroll({ target: container } as unknown as Event);

    component.hasMoreMessages = true;
    component.loadingOlderMessages = true;
    component.onMessagesScroll({ target: container } as unknown as Event);

    // None of these should have triggered a load (guards kick in before debounce fires)
    expect(chatService.getConversationMessagesPage.calls.length).toBe(initialCallCount);
  });

  it('should upload chat image before sending the message', async () => {
    const file = new File(['img'], 'photo.png', { type: 'image/png' });
    component.activeConversation = { ...conversation, messages: [] };
    component.selectedAttachment = {
      file,
      previewUrl: 'blob:test-image',
      name: 'photo.png',
      type: 'image/png'
    };

    uploadService.uploadImage.setImplementation(() => of({
      key: 'chat/photo.png',
      url: 'https://bucket.s3.amazonaws.com/chat/photo.png'
    }));

    await component.sendMessage();

    expect(uploadService.uploadImage.calls).toEqual([[file, 'chat']]);
    expect(chatService.sendMessage.calls).toEqual([['1', '', 'https://bucket.s3.amazonaws.com/chat/photo.png']]);
    expect(component.selectedAttachment).toBeNull();
  });

  it('should show a temporary error when image upload fails and skip message send', async () => {
    const file = new File(['img'], 'photo.png', { type: 'image/png' });
    component.activeConversation = { ...conversation, messages: [] };
    component.selectedAttachment = {
      file,
      previewUrl: 'blob:test-image',
      name: 'photo.png',
      type: 'image/png'
    };

    uploadService.uploadImage.setImplementation(() => throwError(() => new Error('upload failed')));

    await component.sendMessage();

    expect(chatService.sendMessage.calls.length).toBe(0);
    expect(component.uploadErrorMessage).toBe('No se pudo subir la imagen. Intentá nuevamente.');
  });

  it('should preserve messages in active conversation when getInitialData polls', () => {
    const messages = ['1', '2', '3'].map((id, i) => createMessage(id, i + 1));

    // Simulate state after first poll: conversation has messages loaded locally
    component.conversations = [{ ...conversation, messages: [] }];
    component.activeConversation = { ...conversation, messages };

    // Second poll: backend returns same conversation but with no messages (empty page)
    component.conversations = [{ ...conversation, messages: [] }];
    (component as any).resolveActiveConversation();

    // Messages must not be wiped — preserves the local buffer
    expect(component.activeConversation?.id).toBe('1');
    expect(component.activeConversation?.messages).toHaveLength(3);
    expect(component.activeConversation?.messages.map((m: { id: string }) => m.id)).toEqual(['1', '2', '3']);
  });

  it('should reset messages when switching to a different conversation', () => {
    const conv2 = {
      ...conversation,
      id: '2',
      participants: conversation.participants,
      messages: [],
      updatedAt: '2026-03-12T09:00:00',
      lastMessage: null
    };
    const messages = ['1', '2'].map((id, i) => createMessage(id, i + 1));

    component.conversations = [{ ...conversation, messages }, conv2];
    component.activeConversation = { ...conversation, messages };
    (component as any).selectedConversationId = '2';

    (component as any).resolveActiveConversation();

    expect(component.activeConversation?.id).toBe('2');
    expect(component.activeConversation?.messages).toHaveLength(0);
  });

  it('canSendMessages should be true only when friend and not blocked', () => {
    component.isConversationFriend = true;
    component.isConversationBlocked = false;
    expect(component.canSendMessages).toBe(true);

    component.isConversationFriend = false;
    component.isConversationBlocked = false;
    expect(component.canSendMessages).toBe(false);

    component.isConversationFriend = true;
    component.isConversationBlocked = true;
    expect(component.canSendMessages).toBe(false);

    component.isConversationFriend = false;
    component.isConversationBlocked = true;
    expect(component.canSendMessages).toBe(false);
  });
});
