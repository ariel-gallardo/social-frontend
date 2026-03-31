import { gql } from 'apollo-angular';

export const SEND_MESSAGE = gql`
  mutation SendMessage($conversationId: ID!, $content: String, $imageUrl: String) {
    sendMessage(conversationId: $conversationId, content: $content, imageUrl: $imageUrl) {
      id
      content
      timestamp
      imageUrl
      sender {
        id
        fullName
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
        fullName
        avatarUrl
        isActive
      }
      messages {
        id
        content
        timestamp
        imageUrl
        sender {
          id
          fullName
        }
      }
    }
  }
`;