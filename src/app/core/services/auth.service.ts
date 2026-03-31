import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { Observable, tap } from 'rxjs';
import { Router } from '@angular/router';
import { RealtimeService } from '../../services/realtime.service';
import {
  CHANGE_PASSWORD_MUTATION,
  LOGIN_MUTATION,
  REGISTER_MUTATION,
  UPDATE_PROFILE_MUTATION
} from '../../graphql/mutations/auth.mutations';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly TOKEN_KEY = 'social_auth_token';

    constructor(private apollo: Apollo, private router: Router, private realtimeService: RealtimeService) { }

    login(username: string, password: string): Observable<any> {
        return this.apollo.mutate({
            mutation: LOGIN_MUTATION,
            variables: { username, password }
        }).pipe(
            tap((res: any) => {
                if (res.data?.login?.token) {
                    this.setToken(res.data.login.token);
                }
            })
        );
    }

    register(username: string, password: string, fullName: string): Observable<any> {
        return this.apollo.mutate({
            mutation: REGISTER_MUTATION,
            variables: { username, password, fullName }
        }).pipe(
            tap((res: any) => {
                if (res.data?.register?.token) {
                    this.setToken(res.data.register.token);
                }
            })
        );
    }

      updateProfile(fullName: string, avatarUrl: string): Observable<any> {
        return this.apollo.mutate({
          mutation: UPDATE_PROFILE_MUTATION,
          variables: { fullName, avatarUrl }
        });
      }

      changePassword(currentPassword: string, newPassword: string): Observable<any> {
        return this.apollo.mutate({
          mutation: CHANGE_PASSWORD_MUTATION,
          variables: { currentPassword, newPassword }
        });
      }

    logout() {
      this.realtimeService.disconnect();
        localStorage.removeItem(this.TOKEN_KEY);
        this.apollo.client.resetStore();
        this.router.navigate(['/login']);
    }

    setToken(token: string) {
        localStorage.setItem(this.TOKEN_KEY, token);
    }

    getToken(): string | null {
        return localStorage.getItem(this.TOKEN_KEY);
    }

    isAuthenticated(): boolean {
      if(this.isTokenExpired()) localStorage.removeItem(this.TOKEN_KEY);
      return !!this.getToken();
    }

    getGraphQLErrorMessage(error: any): string {
      return error?.error?.errors?.[0]?.message
        ?? error?.graphQLErrors?.[0]?.message
        ?? error?.message
        ?? 'Unexpected error';
    }

    isUnauthorizedError(error: any): boolean {
      const message = this.getGraphQLErrorMessage(error).toLowerCase();
      return message.includes('unauthorized') || message.includes('forbidden') || message.includes('jwt');
    }

    isTokenExpired(){
      const token = localStorage.getItem(this.TOKEN_KEY);
      if (!token) return true;

      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const exp = typeof payload?.exp === 'number' ? payload.exp : null;

        if (exp === null) return true;
        return exp * 1000 <= Date.now();
      } catch {
        return true;
      }
    }
}
