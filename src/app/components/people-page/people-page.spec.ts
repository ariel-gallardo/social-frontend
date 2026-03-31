import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';

import { PeoplePage } from './people-page';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../core/services/auth.service';

describe('PeoplePage', () => {
  let component: PeoplePage;
  let fixture: ComponentFixture<PeoplePage>;

  let sendFriendRequestCalls: string[];
  let cancelFriendRequestCalls: string[];

  const queryParamMap$ = new BehaviorSubject(convertToParamMap({ page: '1' }));

  const activatedRouteMock = {
    queryParamMap: queryParamMap$.asObservable()
  };

  const routerMock = {
    navigate: () => Promise.resolve(true)
  };

  const chatServiceMock = {
    friendshipChanges$: of(undefined),
    getPeoplePage: () => of({
      items: [],
      totalElements: 0,
      totalPages: 1,
      page: 1,
      size: 8
    }),
    getFriendStatus: () => of(null),
    startConversation: () => of({ id: 'conv-1' }),
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
      imports: [PeoplePage],
      providers: [
        { provide: ChatService, useValue: chatServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: ActivatedRoute, useValue: activatedRouteMock },
        { provide: Router, useValue: routerMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PeoplePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should send friend request when status is NONE', () => {
    const user: any = {
      id: '99',
      username: 'new.user',
      fullName: 'New User',
      avatarUrl: 'https://avatar/new.png',
      isActive: false,
      friendStatus: {
        userId: '99',
        status: 'NONE',
        isFriend: false,
        hasPendingRequest: false
      }
    };

    component.connect(user);

    expect(sendFriendRequestCalls).toEqual(['99']);
    expect(user.friendStatus).toEqual({
      userId: '99',
      status: 'PENDING',
      isFriend: false,
      hasPendingRequest: true
    });
  });

  it('should cancel pending request when status is PENDING', () => {
    const user: any = {
      id: '99',
      username: 'pending.user',
      fullName: 'Pending User',
      avatarUrl: 'https://avatar/pending.png',
      isActive: false,
      friendStatus: {
        userId: '99',
        status: 'PENDING',
        isFriend: false,
        hasPendingRequest: true
      }
    };

    component.connect(user);

    expect(cancelFriendRequestCalls).toEqual(['99']);
    expect(user.friendStatus).toEqual({
      userId: '99',
      status: 'NONE',
      isFriend: false,
      hasPendingRequest: false
    });
  });
});
