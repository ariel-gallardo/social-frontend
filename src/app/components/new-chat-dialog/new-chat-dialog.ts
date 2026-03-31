import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService, User, FriendStatus } from '../../services/chat.service';
import { AuthService } from '../../core/services/auth.service';
import { finalize, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface UserWithStatus extends User {
  friendStatus?: FriendStatus;
  loadingStatus?: boolean;
}

@Component({
  selector: 'app-new-chat-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './new-chat-dialog.html',
  styleUrl: './new-chat-dialog.css'
})
export class NewChatDialog implements OnInit {
  @Output() close = new EventEmitter<void>();
  @Output() userSelected = new EventEmitter<User>();

  searchTerm = '';
  users: UserWithStatus[] = [];
  loading = false;
  error = '';
  currentPage = 1;
  readonly pageSize = 6;
  totalPages = 1;
  totalElements = 0;

  private searchDebounceTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.searchUsers(1);
  }

  ngOnDestroy() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
  }

  get canGoPrevious(): boolean {
    return this.currentPage > 1;
  }

  get canGoNext(): boolean {
    return this.currentPage < this.totalPages;
  }

  onSearchTermChange() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    this.searchDebounceTimer = setTimeout(() => {
      this.searchUsers(1);
    }, 280);
  }

  searchUsers(page = 1) {
    this.loading = true;
    this.error = '';
    this.cdr.detectChanges();
    this.chatService.getPeoplePage(this.searchTerm.trim() || '', page, this.pageSize).pipe(
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (result) => {
        const fetchedUsers = (result.items ?? []) as UserWithStatus[];
        this.currentPage = result.page ?? page;
        this.totalPages = Math.max(result.totalPages ?? 1, 1);
        this.totalElements = result.totalElements ?? 0;

        if (fetchedUsers.length === 0) {
          this.users = [];
          this.cdr.detectChanges();
          return;
        }

        forkJoin(
          fetchedUsers.map((user) =>
            this.chatService.getFriendStatus(user.id).pipe(catchError(() => of(null)))
          )
        ).subscribe({
          next: (statuses) => {
            const usersWithStatus = fetchedUsers
              .map((user, index) => ({
                ...user,
                friendStatus: statuses[index] ?? undefined,
                loadingStatus: false
              }))
              .filter((user) => user.friendStatus?.status !== 'BLOCKED' && user.friendStatus?.status !== 'BLOCKED_BY_OTHER');

            this.users = usersWithStatus;
            this.cdr.detectChanges();
          },
          error: () => {
            this.users = fetchedUsers;
            this.cdr.detectChanges();
          }
        });
      },
      error: (err) => {
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
        } else {
          this.error = 'Error loading users';
        }
      }
    });
  }

  goToPreviousPage() {
    if (!this.canGoPrevious) {
      return;
    }
    this.searchUsers(this.currentPage - 1);
  }

  goToNextPage() {
    if (!this.canGoNext) {
      return;
    }
    this.searchUsers(this.currentPage + 1);
  }

  addFriend(user: UserWithStatus, event: Event) {
    event.stopPropagation();
    this.chatService.sendFriendRequest(user.id).subscribe({
      next: () => {
        user.friendStatus = {
          userId: user.id,
          status: 'PENDING',
          isFriend: false,
          hasPendingRequest: true
        };
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error sending friend request', err);
        this.error = 'Error sending friend request';
      }
    });
  }

  cancelPendingRequest(user: UserWithStatus, event: Event) {
    event.stopPropagation();
    this.chatService.cancelFriendRequest(user.id).subscribe({
      next: () => {
        user.friendStatus = {
          userId: user.id,
          status: 'NONE',
          isFriend: false,
          hasPendingRequest: false
        };
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'Error canceling friend request';
        this.cdr.detectChanges();
      }
    });
  }

  startChat(user: UserWithStatus, event: Event) {
    event.stopPropagation();
    this.userSelected.emit(user);
    this.close.emit();
  }

  onClose() {
    this.close.emit();
  }
}
