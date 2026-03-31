import { gql } from 'apollo-angular';

export const GET_CONVERSATIONS = gql`
  query GetConversations {
    getConversations {
      id
      updatedAt
      participants {
        id
        username
        fullName
        avatarUrl
        isActive
      }
      lastMessage {
        id
        content
        timestamp
        imageUrl
        sender {
          id
          username
          fullName
          avatarUrl
          isActive
        }
      }
    }
    me {
      id
      username
      fullName
      avatarUrl
      isActive
    }
  }
`;

export const GET_PEOPLE = gql`
  query GetPeople($search: String) {
    getPeople(search: $search) {
      id
      username
      fullName
      avatarUrl
      isActive
    }
  }
`;

export const GET_PEOPLE_PAGE = gql`
  query GetPeoplePage($search: String, $page: Int, $size: Int) {
    getPeoplePage(search: $search, page: $page, size: $size) {
      items {
        id
        username
        fullName
        avatarUrl
        isActive
      }
      totalElements
      totalPages
      page
      size
    }
  }
`;

export const GET_FRIEND_STATUS = gql`
  query GetFriendStatus($userId: ID!) {
    getFriendStatus(userId: $userId) {
      userId
      status
      isFriend
      hasPendingRequest
    }
  }
`;

export const GET_FRIEND_REQUESTS = gql`
  query GetFriendRequests {
    getFriendRequests {
      id
      requester {
        id
        username
        fullName
        avatarUrl
        isActive
      }
      receiver {
        id
        username
        fullName
        avatarUrl
        isActive
      }
      status
      createdAt
    }
  }
`;

export const GET_CONVERSATION = gql`
  query GetConversation($id: ID!) {
    getConversation(id: $id) {
      id
      updatedAt
      participants {
        id
        username
        fullName
        avatarUrl
        isActive
      }
      lastMessage {
        id
        content
        timestamp
        imageUrl
        sender {
          id
          username
          fullName
          avatarUrl
          isActive
        }
      }
    }
  }
`;

export const GET_CONVERSATION_MESSAGES_PAGE = gql`
  query GetConversationMessagesPage($conversationId: ID!, $page: Int, $size: Int) {
    getConversationMessagesPage(conversationId: $conversationId, page: $page, size: $size) {
      items {
        id
        content
        timestamp
        imageUrl
        sender {
          id
          username
          fullName
          avatarUrl
          isActive
        }
      }
      hasMore
      page
      size
    }
  }
`;

export const SEND_FRIEND_REQUEST = gql`
  mutation SendFriendRequest($receiverId: ID!) {
    sendFriendRequest(receiverId: $receiverId) {
      id
      requester {
        id
        username
        fullName
      }
      receiver {
        id
        username
        fullName
      }
      status
      createdAt
    }
  }
`;

export const CANCEL_FRIEND_REQUEST = gql`
  mutation CancelFriendRequest($receiverId: ID!) {
    cancelFriendRequest(receiverId: $receiverId)
  }
`;

export const ACCEPT_FRIEND_REQUEST = gql`
  mutation AcceptFriendRequest($requestId: ID!) {
    acceptFriendRequest(requestId: $requestId) {
      id
      status
    }
  }
`;

export const REJECT_FRIEND_REQUEST = gql`
  mutation RejectFriendRequest($requestId: ID!) {
    rejectFriendRequest(requestId: $requestId) {
      id
      status
    }
  }
`;

export const REMOVE_FRIEND = gql`
  mutation RemoveFriend($userId: ID!) {
    removeFriend(userId: $userId)
  }
`;

export const BLOCK_USER = gql`
  mutation BlockUser($userId: ID!) {
    blockUser(userId: $userId)
  }
`;

export const UNBLOCK_USER = gql`
  mutation UnblockUser($userId: ID!) {
    unblockUser(userId: $userId)
  }
`;

export const SEND_MESSAGE = gql`
  mutation SendMessage($conversationId: ID!, $content: String, $imageUrl: String) {
    sendMessage(conversationId: $conversationId, content: $content, imageUrl: $imageUrl) {
      id
      content
      imageUrl
      timestamp
      sender {
        id
        username
        fullName
        avatarUrl
        isActive
      }
    }
  }
`;

export const START_CONVERSATION = gql`
  mutation StartConversation($userId: ID!) {
    startConversation(userId: $userId) {
      id
      updatedAt
      participants {
        id
        username
        fullName
        avatarUrl
        isActive
      }
    }
  }
`;