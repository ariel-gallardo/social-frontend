import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { Sidebar } from './sidebar';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../core/services/auth.service';

describe('Sidebar', () => {
  let component: Sidebar;
  let fixture: ComponentFixture<Sidebar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Sidebar],
      providers: [
        provideRouter([]),
        {
          provide: ChatService,
          useValue: {
            getInitialData: () => of({ me: null, getConversations: [] })
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

    fixture = TestBed.createComponent(Sidebar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
