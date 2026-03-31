import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Sidebar } from '../sidebar/sidebar';
import { ChatService, FriendRequest, User } from '../../services/chat.service';
import { AuthService } from '../../core/services/auth.service';
import { MessageNotificationService } from '../../services/message-notification.service';
import { Subscription, finalize, interval } from 'rxjs';

interface FriendRequestNotification extends FriendRequest {
  actionLoading?: boolean;
}

@Component({
  selector: 'app-chat-layout',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive, Sidebar],
  templateUrl: './chat-layout.html',
  styleUrl: './chat-layout.css',
})
export class ChatLayout implements OnInit {
  me: User | null = null;
  searchTerm = '';
  showFriendNotifications = false;
  showProfileMenu = false;
  pendingFriendRequests: FriendRequestNotification[] = [];
  loadingFriendRequests = false;
  friendRequestsError = '';

  private friendRequestsRefreshSub?: Subscription;
  private friendshipChangesSub?: Subscription;

  private normalizeSearch(search: string): string {
    return search.trim().replace(/^@+/, '').replace(/\s+/g, ' ');
  }

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    public messageNotificationService: MessageNotificationService
  ) { }

  ngOnInit() {
    this.chatService.getInitialData(5000).subscribe({
      next: (data) => {
        this.me = data.me ?? null;
        this.loadFriendRequests(false);
      },
      error: (err) => {
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
        }
      }
    });

    this.friendRequestsRefreshSub = interval(10000).subscribe(() => {
      this.loadFriendRequests(false);
    });

    this.friendshipChangesSub = this.chatService.friendshipChanges$.subscribe(() => {
      this.loadFriendRequests(false);
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    this.friendRequestsRefreshSub?.unsubscribe();
    this.friendshipChangesSub?.unsubscribe();
  }

  search() {
    const search = this.normalizeSearch(this.searchTerm);
    this.router.navigate(['/people'], {
      queryParams: search ? { search, page: 1 } : { page: 1 }
    });
  }

  get pendingFriendRequestsCount(): number {
    return this.pendingFriendRequests.length;
  }

  toggleFriendNotifications() {
    this.showFriendNotifications = !this.showFriendNotifications;
    if (this.showFriendNotifications) {
      this.showProfileMenu = false;
    }
    if (this.showFriendNotifications) {
      this.loadFriendRequests();
    }
  }

  toggleProfileMenu() {
    this.showProfileMenu = !this.showProfileMenu;
    if (this.showProfileMenu) {
      this.showFriendNotifications = false;
    }
  }

  goToSettings() {
    this.showProfileMenu = false;
    this.router.navigate(['/settings']);
  }

  logout() {
    this.showProfileMenu = false;
    this.authService.logout();
  }

  loadFriendRequests(showLoader = true) {
    if (!this.me?.id) {
      return;
    }

    if (showLoader) {
      this.loadingFriendRequests = true;
    }
    this.friendRequestsError = '';

    this.chatService.getFriendRequests().pipe(
      finalize(() => {
        this.loadingFriendRequests = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (requests) => {
        this.pendingFriendRequests = (requests ?? [])
          .filter((request) => request.status === 'PENDING' && request.receiver?.id === this.me?.id)
          .map((request) => ({
            ...request,
            actionLoading: false
          }));
        this.cdr.detectChanges();
      },
      error: (err) => {
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
          return;
        }
        this.friendRequestsError = 'No se pudieron cargar las solicitudes.';
        this.cdr.detectChanges();
      }
    });
  }

  acceptFriendRequest(request: FriendRequestNotification) {
    const previousRequests = this.pendingFriendRequests;
    this.pendingFriendRequests = this.pendingFriendRequests.filter((item) => item.id !== request.id);
    this.cdr.detectChanges();

    this.chatService.acceptFriendRequest(request.id).pipe(
      finalize(() => this.cdr.detectChanges())
    ).subscribe({
      next: () => {},
      error: (err) => {
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
          return;
        }
        this.pendingFriendRequests = previousRequests;
        this.friendRequestsError = 'No se pudo aceptar la solicitud.';
      }
    });
  }

  rejectFriendRequest(request: FriendRequestNotification) {
    const previousRequests = this.pendingFriendRequests;
    this.pendingFriendRequests = this.pendingFriendRequests.filter((item) => item.id !== request.id);
    this.cdr.detectChanges();

    this.chatService.rejectFriendRequest(request.id).pipe(
      finalize(() => this.cdr.detectChanges())
    ).subscribe({
      next: () => {},
      error: (err) => {
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
          return;
        }
        this.pendingFriendRequests = previousRequests;
        this.friendRequestsError = 'No se pudo rechazar la solicitud.';
      }
    });
  }
}
