import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService, User } from '../../services/chat.service';
import { AuthService } from '../../core/services/auth.service';
import { UploadService } from '../../services/upload.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-settings-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.css'
})
export class SettingsPage implements OnInit {
  me: User | null = null;

  fullName = '';
  avatarUrl = '';
  selectedAvatarFile: File | null = null;
  avatarPreviewUrl = '';
  currentPassword = '';
  newPassword = '';

  profileMessage = '';
  uploadErrorMessage = '';
  passwordMessage = '';
  isSavingProfile = false;
  isChangingPassword = false;
  private uploadErrorTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private uploadService: UploadService
  ) { }

  ngOnInit() {
    this.chatService.getInitialData().subscribe({
      next: (data) => {
        this.me = data.me;
        this.fullName = data.me?.fullName ?? '';
        this.avatarUrl = data.me?.avatarUrl ?? '';
        this.avatarPreviewUrl = this.avatarUrl;
      },
      error: (err) => {
        if (this.authService.isUnauthorizedError(err)) {
          this.authService.logout();
        }
      }
    });
  }

  ngOnDestroy() {
    if (this.uploadErrorTimeout) {
      clearTimeout(this.uploadErrorTimeout);
    }
    if (this.avatarPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.avatarPreviewUrl);
    }
  }

  onAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.showTemporaryUploadError('Solo se permiten imágenes para el perfil.');
      return;
    }

    if (this.avatarPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.avatarPreviewUrl);
    }

    this.selectedAvatarFile = file;
    this.avatarPreviewUrl = URL.createObjectURL(file);
    input.value = '';
  }

  async saveProfile() {
    if (!this.fullName.trim()) {
      this.profileMessage = 'Name is required.';
      return;
    }

    this.isSavingProfile = true;
    this.profileMessage = '';

    let finalAvatarUrl = this.avatarUrl.trim();

    if (this.selectedAvatarFile) {
      try {
        const upload = await firstValueFrom(this.uploadService.uploadImage(this.selectedAvatarFile, 'profile'));
        finalAvatarUrl = upload.url;
      } catch {
        this.isSavingProfile = false;
        this.showTemporaryUploadError('No se pudo subir la imagen de perfil.');
        return;
      }
    }

    if (!finalAvatarUrl) {
      this.isSavingProfile = false;
      this.profileMessage = 'Avatar URL is required.';
      return;
    }

    this.authService.updateProfile(this.fullName.trim(), finalAvatarUrl).subscribe({
      next: () => {
        this.profileMessage = 'Profile updated successfully.';
        this.avatarUrl = finalAvatarUrl;
        this.avatarPreviewUrl = finalAvatarUrl;
        this.selectedAvatarFile = null;
        this.isSavingProfile = false;
      },
      error: (err) => {
        this.isSavingProfile = false;
        this.profileMessage = this.authService.getGraphQLErrorMessage(err) || 'Backend does not support profile updates yet.';
      }
    });
  }

  private showTemporaryUploadError(message: string) {
    this.uploadErrorMessage = message;
    if (this.uploadErrorTimeout) {
      clearTimeout(this.uploadErrorTimeout);
    }
    this.uploadErrorTimeout = setTimeout(() => {
      this.uploadErrorMessage = '';
    }, 3500);
  }

  savePassword() {
    if (!this.currentPassword || !this.newPassword) {
      this.passwordMessage = 'Both password fields are required.';
      return;
    }

    this.isChangingPassword = true;
    this.passwordMessage = '';

    this.authService.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.passwordMessage = 'Password changed successfully.';
        this.currentPassword = '';
        this.newPassword = '';
        this.isChangingPassword = false;
      },
      error: (err) => {
        this.isChangingPassword = false;
        this.passwordMessage = this.authService.getGraphQLErrorMessage(err) || 'Backend does not support password change yet.';
      }
    });
  }
}
