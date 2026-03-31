import { gql } from 'apollo-angular';

export const LOGIN_MUTATION = gql`
  mutation Login($username: String!, $password: String!) {
    login(username: $username, password: $password) {
      token
      user {
        id
        username
        fullName
      }
    }
  }
`;

export const REGISTER_MUTATION = gql`
  mutation Register($username: String!, $password: String!, $fullName: String!) {
    register(username: $username, password: $password, fullName: $fullName) {
      token
      user {
        id
        username
        fullName
      }
    }
  }
`;

export const UPDATE_PROFILE_MUTATION = gql`
  mutation UpdateProfile($fullName: String!, $avatarUrl: String!) {
    updateProfile(fullName: $fullName, avatarUrl: $avatarUrl) {
      id
      username
      fullName
      avatarUrl
      isActive
    }
  }
`;

export const CHANGE_PASSWORD_MUTATION = gql`
  mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
    changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
  }
`;