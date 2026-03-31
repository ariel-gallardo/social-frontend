import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EMPTY, of } from 'rxjs';

import { ChatLayout } from './chat-layout';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../core/services/auth.service';

describe('ChatLayout', () => {
  let component: ChatLayout;
  let fixture: ComponentFixture<ChatLayout>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatLayout],
      providers: [
        provideRouter([]),
        {
          provide: ChatService,
          useValue: {
            getInitialData: () => of({ me: null, getConversations: [] }),
            getFriendRequests: () => of([]),
            friendshipChanges$: EMPTY
          }
        },
        {
          provide: AuthService,
          useValue: {
            logout: () => { }
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatLayout);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
