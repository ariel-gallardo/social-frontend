import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { Subject, catchError, filter, map, of, switchMap, tap, throwError } from 'rxjs';
import { 
  START_CONVERSATION, 
  SEND_MESSAGE,
  SEND_FRIEND_REQUEST,
  CANCEL_FRIEND_REQUEST,
  ACCEPT_FRIEND_REQUEST,
  REJECT_FRIEND_REQUEST,
  REMOVE_FRIEND,
  BLOCK_USER,
  UNBLOCK_USER
} from '../graphql/queries/chat.queries';
import { 
  GET_CONVERSATION, 
  GET_CONVERSATIONS, 
  GET_PEOPLE, 
  GET_PEOPLE_PAGE, 
  GET_FRIEND_STATUS,
  GET_FRIEND_REQUESTS,
  GET_CONVERSATION_MESSAGES_PAGE
} from '../graphql/queries/chat.queries';

export interface User {
    id: string;
    username: string;
    fullName: string;
    avatarUrl: string;
    isActive: boolean;
}

export interface Message {
    id: string;
    content: string;
    imageUrl: string;
    timestamp: string;
    sender: User;
}

export interface Conversation {
    id: string;
    updatedAt: string;
    participants: User[];
    messages: Message[];
  lastMessage?: Message | null;
}

export interface FriendRequest {
    id: string;
    requester: User;
    receiver: User;
    status: string;
    createdAt: string;
    updatedAt?: string;
}

export interface FriendStatus {
    userId: string;
    status: string;
    isFriend: boolean;
    hasPendingRequest: boolean;
}

export interface InitialData {
  getConversations: Conversation[];
  me: User | null;
}

export interface PeopleData {
  getPeople: User[];
}

export interface PeoplePageResult {
  items: User[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}

export interface PeoplePageData {
  getPeoplePage: PeoplePageResult;
}

export interface FriendRequestsData {
  getFriendRequests: FriendRequest[];
}

export interface FriendStatusData {
  getFriendStatus: FriendStatus;
}

export interface StartConversationData {
  startConversation: Conversation;
}

export interface ConversationData {
  getConversation: Conversation | null;
}

export interface MessagePageResult {
  items: Message[];
  hasMore: boolean;
  page: number;
  size: number;
}

export interface MessagePageData {
  getConversationMessagesPage: MessagePageResult;
}

type PartialUser = Partial<User> | null | undefined;
type PartialMessage = Omit<Partial<Message>, 'sender'> & {
  sender?: PartialUser;
};
type PartialConversation = Omit<Partial<Conversation>, 'participants' | 'messages' | 'lastMessage'> & {
  participants?: PartialUser[];
  messages?: PartialMessage[];
  lastMessage?: PartialMessage | null;
};

@Injectable({
    providedIn: 'root'
})
export class ChatService {
    private readonly friendshipChangesSubject = new Subject<void>();
    readonly friendshipChanges$ = this.friendshipChangesSubject.asObservable();

    constructor(private apollo: Apollo) { }

    private mapMessage(message: PartialMessage): Message {
      return {
        id: message?.id ?? '',
        content: message?.content ?? '',
        imageUrl: message?.imageUrl ?? '',
        timestamp: message?.timestamp ?? '',
        sender: {
          id: message?.sender?.id ?? '',
          username: message?.sender?.username ?? '',
          fullName: message?.sender?.fullName ?? '',
          avatarUrl: message?.sender?.avatarUrl ?? '',
          isActive: message?.sender?.isActive ?? false
        }
      };
    }

    private mapConversation(conversation: PartialConversation): Conversation {
      return {
        id: conversation?.id ?? '',
        updatedAt: conversation?.updatedAt ?? '',
        participants: (conversation?.participants ?? []).map((participant) => ({
          id: participant?.id ?? '',
          username: participant?.username ?? '',
          fullName: participant?.fullName ?? '',
          avatarUrl: participant?.avatarUrl ?? '',
          isActive: participant?.isActive ?? false
        })),
        messages: (conversation?.messages ?? []).map((message) => this.mapMessage(message)),
        lastMessage: conversation?.lastMessage ? this.mapMessage(conversation.lastMessage) : null
      };
    }

    private notifyFriendshipChanged() {
      this.friendshipChangesSubject.next();
    }

    private normalizePeopleSearch(search?: string): string | null {
      if (!search) {
        return null;
      }

      const normalized = search
        .trim()
        .replace(/^@+/, '')
        .replace(/\s+/g, ' ');

      return normalized.length > 0 ? normalized : null;
    }

  getInitialData(pollIntervalMs = 0) {
  return this.apollo.watchQuery<InitialData>({
            query: GET_CONVERSATIONS,
      pollInterval: pollIntervalMs > 0 ? pollIntervalMs : undefined,
        }).valueChanges.pipe(
      map((result) => result.data),
      filter((data): data is InitialData => !!data),
      map((data) => ({
        me: data.me ?? null,
        getConversations: (data.getConversations ?? []).map((conversation) => this.mapConversation(conversation))
      })),
      catchError((error) => throwError(() => error))
        );
    }

    sendMessage(conversationId: string, content: string, imageUrl?: string) {
        return this.apollo.mutate({
            mutation: SEND_MESSAGE,
            variables: {
                conversationId,
                content,
                imageUrl
            },
            refetchQueries: [{ query: GET_CONVERSATIONS }]
        });
    }

    getPeople(search?: string, pollIntervalMs = 0) {
      return this.apollo.query<PeopleData>({
        query: GET_PEOPLE,
        variables: { search: this.normalizePeopleSearch(search) },
        fetchPolicy: 'network-only'
      }).pipe(
        map((result: any) => {
          if (result.errors?.length) {
            throw result.errors[0];
          }
          return (result.data?.getPeople ?? []) as User[];
        }),
        catchError((error) => throwError(() => error))
      );
    }

    getPeoplePage(search?: string, page = 1, size = 12) {
      return this.apollo.query<PeoplePageData>({
        query: GET_PEOPLE_PAGE,
        variables: {
          search: this.normalizePeopleSearch(search),
          page,
          size
        },
        fetchPolicy: 'network-only'
      }).pipe(
        switchMap((result: any) => {
          if (result.errors?.length) {
            return throwError(() => result.errors[0]);
          }

          const pageData = result.data?.getPeoplePage;
          if (!pageData) {
            return this.getPeople(search).pipe(
              map((users) => {
                const safePage = page < 1 ? 1 : page;
                const start = (safePage - 1) * size;
                return {
                  items: users.slice(start, start + size),
                  totalElements: users.length,
                  totalPages: Math.max(1, Math.ceil(users.length / size)),
                  page: safePage,
                  size
                };
              })
            );
          }

          const items = (pageData.items ?? []).map((user: any) => ({
            id: user?.id ?? '',
            username: user?.username ?? '',
            fullName: user?.fullName ?? '',
            avatarUrl: user?.avatarUrl ?? '',
            isActive: user?.isActive ?? false
          }));

          return of({
            items,
            totalElements: pageData.totalElements ?? 0,
            totalPages: pageData.totalPages ?? 1,
            page: pageData.page ?? page,
            size: pageData.size ?? size
          });
        }),
        catchError((error) => throwError(() => error))
      );
    }

    getFriendRequests() {
      return this.apollo.query<FriendRequestsData>({
        query: GET_FRIEND_REQUESTS,
        fetchPolicy: 'network-only'
      }).pipe(
        map((result) => (result.data?.getFriendRequests ?? []) as FriendRequest[]),
        catchError((error) => throwError(() => error))
      );
    }

    getFriendStatus(userId: string) {
      return this.apollo.query<FriendStatusData>({
        query: GET_FRIEND_STATUS,
        variables: { userId },
        fetchPolicy: 'network-only'
      }).pipe(
        map((result) => (result.data?.getFriendStatus ?? null) as FriendStatus | null),
        catchError((error) => throwError(() => error))
      );
    }

    sendFriendRequest(receiverId: string) {
      return this.apollo.mutate({
        mutation: SEND_FRIEND_REQUEST,
        variables: { receiverId },
        refetchQueries: [{ query: GET_FRIEND_REQUESTS }]
      }).pipe(
        map((result: any) => result.data?.sendFriendRequest),
        tap(() => this.notifyFriendshipChanged()),
        catchError((error) => throwError(() => error))
      );
    }

    cancelFriendRequest(receiverId: string) {
      return this.apollo.mutate<{ cancelFriendRequest: boolean }>({
        mutation: CANCEL_FRIEND_REQUEST,
        variables: { receiverId },
        refetchQueries: [{ query: GET_FRIEND_REQUESTS }]
      }).pipe(
        map((result) => result.data?.cancelFriendRequest === true),
        tap(() => this.notifyFriendshipChanged()),
        catchError((error) => throwError(() => error))
      );
    }

    acceptFriendRequest(requestId: string) {
      return this.apollo.mutate({
        mutation: ACCEPT_FRIEND_REQUEST,
        variables: { requestId },
        refetchQueries: [{ query: GET_FRIEND_REQUESTS }]
      }).pipe(
        tap(() => this.notifyFriendshipChanged()),
        catchError((error) => throwError(() => error))
      );
    }

    rejectFriendRequest(requestId: string) {
      return this.apollo.mutate({
        mutation: REJECT_FRIEND_REQUEST,
        variables: { requestId },
        refetchQueries: [{ query: GET_FRIEND_REQUESTS }]
      }).pipe(
        tap(() => this.notifyFriendshipChanged()),
        catchError((error) => throwError(() => error))
      );
    }

    removeFriend(userId: string) {
      return this.apollo.mutate<{ removeFriend: boolean }>({
        mutation: REMOVE_FRIEND,
        variables: { userId },
        refetchQueries: [{ query: GET_FRIEND_REQUESTS }]
      }).pipe(
        map((result) => result.data?.removeFriend === true),
        tap(() => this.notifyFriendshipChanged()),
        catchError((error) => throwError(() => error))
      );
    }

    blockUser(userId: string) {
      return this.apollo.mutate<{ blockUser: boolean }>({
        mutation: BLOCK_USER,
        variables: { userId },
        refetchQueries: [{ query: GET_FRIEND_REQUESTS }]
      }).pipe(
        map((result) => result.data?.blockUser === true),
        tap(() => this.notifyFriendshipChanged()),
        catchError((error) => throwError(() => error))
      );
    }

    unblockUser(userId: string) {
      return this.apollo.mutate<{ unblockUser: boolean }>({
        mutation: UNBLOCK_USER,
        variables: { userId },
        refetchQueries: [{ query: GET_FRIEND_REQUESTS }]
      }).pipe(
        map((result) => result.data?.unblockUser === true),
        tap(() => this.notifyFriendshipChanged()),
        catchError((error) => throwError(() => error))
      );
    }

    getConversation(conversationId: string, pollIntervalMs = 0) {
      return this.apollo.watchQuery<ConversationData>({
        query: GET_CONVERSATION,
        variables: { id: conversationId },
        fetchPolicy: 'network-only',
        pollInterval: pollIntervalMs > 0 ? pollIntervalMs : undefined
      }).valueChanges.pipe(
        map((result) => {
          const conversation = result.data?.getConversation;
          return conversation ? this.mapConversation(conversation) : null;
        }),
        catchError((error) => throwError(() => error))
      );
    }

    getConversationMessagesPage(conversationId: string, page = 1, size = 5) {
      return this.apollo.query<MessagePageData>({
        query: GET_CONVERSATION_MESSAGES_PAGE,
        variables: {
          conversationId,
          page,
          size
        },
        fetchPolicy: 'network-only'
      }).pipe(
        map((result) => {
          const pageData = result.data?.getConversationMessagesPage;
          return {
            items: (pageData?.items ?? []).map((message) => this.mapMessage(message)),
            hasMore: pageData?.hasMore ?? false,
            page: pageData?.page ?? page,
            size: pageData?.size ?? size
          } as MessagePageResult;
        }),
        catchError((error) => throwError(() => error))
      );
    }

    startConversation(userId: string) {
      return this.apollo.mutate<StartConversationData>({
        mutation: START_CONVERSATION,
        variables: { userId },
        refetchQueries: [{ query: GET_CONVERSATIONS }]
      }).pipe(
        map((result) => result.data?.startConversation),
        filter((conversation): conversation is Conversation => !!conversation),
        catchError((error) => throwError(() => error))
      );
    }
}
