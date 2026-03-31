import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { NewChatDialog } from './new-chat-dialog';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../core/services/auth.service';

describe('NewChatDialog', () => {
  let component: NewChatDialog;
  let fixture: ComponentFixture<NewChatDialog>;

  let sendFriendRequestCalls: string[];
  let cancelFriendRequestCalls: string[];

  const chatServiceMock = {
    getPeoplePage: () => of({
      items: [],
      totalElements: 0,
      totalPages: 1,
      page: 1,
      size: 6
    }),
    getFriendStatus: () => of(null),
    sendFriendRequest: (userId: string) => {
      sendFriendRequestCalls.push(userId);
      return of({});
    },
    cancelFriendRequest: (userId: string) => {
      cancelFriendRequestCalls.push(userId);
      return of(true);
    }
  };

  const authServiceMock = {
    isUnauthorizedError: () => false,
    logout: () => {}
  };

  beforeEach(async () => {
    sendFriendRequestCalls = [];
    cancelFriendRequestCalls = [];

    await TestBed.configureTestingModule({
      imports: [NewChatDialog],
      providers: [
        { provide: ChatService, useValue: chatServiceMock },
        { provide: AuthService, useValue: authServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(NewChatDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should set status to PENDING instantly when adding friend', () => {
    const user = {
      id: '42',
      username: 'pending.user',
      fullName: 'Pending User',
      avatarUrl: 'https://avatar/pending.png',
      isActive: false
    } as any;

    let stopCalls = 0;
    const event = { stopPropagation: () => { stopCalls += 1; } } as any;

    component.addFriend(user, event);

    expect(stopCalls).toBe(1);
    expect(sendFriendRequestCalls).toEqual(['42']);
    expect(user.friendStatus).toEqual({
      userId: '42',
      status: 'PENDING',
      isFriend: false,
      hasPendingRequest: true
    });
  });

  it('should reset status to NONE when canceling pending request', () => {
    const user = {
      id: '42',
      username: 'pending.user',
      fullName: 'Pending User',
      avatarUrl: 'https://avatar/pending.png',
      isActive: false,
      friendStatus: {
        userId: '42',
        status: 'PENDING',
        isFriend: false,
        hasPendingRequest: true
      }
    } as any;

    let stopCalls = 0;
    const event = { stopPropagation: () => { stopCalls += 1; } } as any;

    component.cancelPendingRequest(user, event);

    expect(stopCalls).toBe(1);
    expect(cancelFriendRequestCalls).toEqual(['42']);
    expect(user.friendStatus).toEqual({
      userId: '42',
      status: 'NONE',
      isFriend: false,
      hasPendingRequest: false
    });
  });
});
