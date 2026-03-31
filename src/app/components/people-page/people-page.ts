import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ChatService, FriendStatus, User } from '../../services/chat.service';
import { AuthService } from '../../core/services/auth.service';
import { finalize, Subscription, interval } from 'rxjs';

interface UserWithStatus extends User {
  friendStatus?: FriendStatus;
  loadingStatus?: boolean;
  actionLoading?: boolean;
}

@Component({
  selector: 'app-people-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './people-page.html',
  styleUrl: './people-page.css'
})
export class PeoplePage implements OnInit {
  users: UserWithStatus[] = [];
  loading = false;
  search = '';
  searchDraft = '';
  errorMessage = '';
  currentPage = 1;
  readonly pageSize = 8;
  totalPages = 1;
  totalElements = 0;
  private refreshSub?: Subscription;
  private searchDebounceTimer?: ReturnType<typeof setTimeout>;
  private friendshipChangesSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private chatService: ChatService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      const search = params.get('search') ?? '';
      const rawPage = Number.parseInt(params.get('page') ?? '1', 10);
      const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
      this.search = search;
      this.searchDraft = this.search;
      this.currentPage = page;
      this.loadPeople();
    });

    this.refreshSub = interval(10000).subscribe(() => {
      this.loadPeople(false);
    });

    this.friendshipChangesSub = this.chatService.friendshipChanges$.subscribe(() => {
      this.loadPeople(false);
    });
  }

  submitSearch() {
    const search = this.searchDraft.trim().replace(/^@+/, '').replace(/\s+/g, ' ');
    this.router.navigate(['/people'], {
      queryParams: search ? { search, page: 1 } : { page: 1 }
    });
  }

  onSearchDraftChange() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    this.searchDebounceTimer = setTimeout(() => {
      this.submitSearch();
    }, 320);
  }

  ngOnDestroy() {
    this.refreshSub?.unsubscribe();
    this.friendshipChangesSub?.unsubscribe();
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

  goToPreviousPage() {
    this.goToPage(this.currentPage - 1);
  }

  goToNextPage() {
    this.goToPage(this.currentPage + 1);
  }

  private goToPage(page: number) {
    const safePage = Math.min(Math.max(page, 1), this.totalPages);
    if (safePage === this.currentPage) {
      return;
    }

    this.router.navigate(['/people'], {
      queryParams: this.search ? { search: this.search, page: safePage } : { page: safePage }
    });
  }

  private startChat(user: UserWithStatus) {
    user.actionLoading = true;
    this.chatService.startConversation(user.id).subscribe({
      next: (conversation) => {
        user.actionLoading = false;
        this.router.navigate(['/chat', conversation.id]);
      },
      error: (err) => {
        user.actionLoading = false;
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
        }
      }
    });
  }

  private loadFriendStatus(user: UserWithStatus) {
    user.loadingStatus = true;
    this.chatService.getFriendStatus(user.id).pipe(
      finalize(() => {
        user.loadingStatus = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (status) => {
        user.friendStatus = status ?? undefined;
      },
      error: () => {
        user.friendStatus = undefined;
      }
    });
  }

  private sendFriendRequest(user: UserWithStatus) {
    user.actionLoading = true;
    this.chatService.sendFriendRequest(user.id).pipe(
      finalize(() => {
        user.actionLoading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        user.friendStatus = {
          userId: user.id,
          status: 'PENDING',
          isFriend: false,
          hasPendingRequest: true
        };
      },
      error: (err) => {
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
        }
      }
    });
  }

  connect(user: UserWithStatus) {
    if (user.loadingStatus || user.actionLoading) {
      return;
    }

    if (user.friendStatus?.status === 'BLOCKED' || user.friendStatus?.status === 'BLOCKED_BY_OTHER') {
      return;
    }

    if (user.friendStatus?.isFriend === true) {
      this.startChat(user);
      return;
    }

    if (user.friendStatus?.hasPendingRequest === true) {
      this.cancelFriendRequest(user);
      return;
    }

    this.sendFriendRequest(user);
  }

  private cancelFriendRequest(user: UserWithStatus) {
    user.actionLoading = true;
    this.chatService.cancelFriendRequest(user.id).pipe(
      finalize(() => {
        user.actionLoading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        user.friendStatus = {
          userId: user.id,
          status: 'NONE',
          isFriend: false,
          hasPendingRequest: false
        };
      },
      error: (err) => {
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
        }
      }
    });
  }

  getActionLabel(user: UserWithStatus): string {
    if (user.actionLoading) {
      return 'Agregando...';
    }

    if (user.loadingStatus) {
      return '...';
    }

    if (user.friendStatus?.isFriend === true) {
      return 'Chatear';
    }

    if (user.friendStatus?.status === 'BLOCKED') {
      return 'Bloqueado';
    }

    if (user.friendStatus?.status === 'BLOCKED_BY_OTHER') {
      return 'Te bloqueó';
    }

    if (user.friendStatus?.hasPendingRequest === true) {
      return 'Cancelar';
    }

    return 'Agregar';
  }

  isActionDisabled(user: UserWithStatus): boolean {
    if (user.loadingStatus || user.actionLoading) {
      return true;
    }

    return user.friendStatus?.status === 'BLOCKED' || user.friendStatus?.status === 'BLOCKED_BY_OTHER';
  }

  removeFriend(user: UserWithStatus) {
    if (user.actionLoading) {
      return;
    }

    const previousStatus = user.friendStatus;
    user.actionLoading = true;

    this.chatService.removeFriend(user.id).pipe(
      finalize(() => {
        user.actionLoading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        user.friendStatus = {
          userId: user.id,
          status: 'NONE',
          isFriend: false,
          hasPendingRequest: false
        };
      },
      error: (err) => {
        user.friendStatus = previousStatus;
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
        }
      }
    });
  }

  blockUser(user: UserWithStatus) {
    if (user.actionLoading) {
      return;
    }

    const previousStatus = user.friendStatus;
    user.actionLoading = true;

    this.chatService.blockUser(user.id).pipe(
      finalize(() => {
        user.actionLoading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        user.friendStatus = {
          userId: user.id,
          status: 'BLOCKED',
          isFriend: false,
          hasPendingRequest: false
        };
      },
      error: (err) => {
        user.friendStatus = previousStatus;
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
        }
      }
    });
  }

  unblockUser(user: UserWithStatus) {
    if (user.actionLoading) {
      return;
    }

    const previousStatus = user.friendStatus;
    user.actionLoading = true;

    this.chatService.unblockUser(user.id).pipe(
      finalize(() => {
        user.actionLoading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        user.friendStatus = {
          userId: user.id,
          status: 'NONE',
          isFriend: false,
          hasPendingRequest: false
        };
      },
      error: (err) => {
        user.friendStatus = previousStatus;
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
        }
      }
    });
  }

  private loadPeopleRequest() {
    return this.chatService.getPeoplePage(this.search, this.currentPage, this.pageSize);
  }

  loadPeople(showLoader = true) {
    if (showLoader) {
      this.loading = true;
      this.cdr.detectChanges();
    }
    this.errorMessage = '';
    this.loadPeopleRequest().pipe(
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (result) => {
        // Preserve locally-known statuses (e.g. BLOCKED) while loadFriendStatus
        // fetches server confirmation, preventing a flash back to "Bloquear"
        const knownStatuses = new Map(this.users.map(u => [u.id, u.friendStatus]));
        this.users = ((result.items ?? []) as UserWithStatus[]).map((user) => ({
          ...user,
          friendStatus: knownStatuses.get(user.id),
          loadingStatus: false,
          actionLoading: false
        }));
        this.totalPages = Math.max(result.totalPages ?? 1, 1);
        this.totalElements = result.totalElements ?? 0;

        this.users.forEach((user) => this.loadFriendStatus(user));

        if (this.currentPage > this.totalPages) {
          this.goToPage(this.totalPages);
          return;
        }
      },
      error: (err) => {
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
        } else {
          this.errorMessage = 'No se pudieron cargar las personas en este momento.';
        }
      }
    });
  }
}