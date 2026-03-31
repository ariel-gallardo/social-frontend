import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { SettingsPage } from './settings-page';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../core/services/auth.service';
import { UploadService } from '../../services/upload.service';

function createMockFunction<T extends (...args: any[]) => any>(implementation: T) {
  let currentImplementation = implementation;
  const calls: unknown[][] = [];

  const mock = ((...args: unknown[]) => {
    calls.push(args);
    return currentImplementation(...(args as Parameters<T>));
  }) as T & {
    calls: unknown[][];
    setImplementation: (nextImplementation: T) => void;
  };

  mock.calls = calls;
  mock.setImplementation = (nextImplementation: T) => {
    currentImplementation = nextImplementation;
  };

  return mock;
}

describe('SettingsPage', () => {
  let component: SettingsPage;
  let fixture: ComponentFixture<SettingsPage>;
  let authService: any;
  let uploadService: any;

  beforeEach(async () => {
    authService = {
      isUnauthorizedError: createMockFunction(() => false),
      logout: createMockFunction(() => undefined),
      updateProfile: createMockFunction(() => of({})),
      changePassword: createMockFunction(() => of(true)),
      getGraphQLErrorMessage: createMockFunction(() => 'Unexpected error')
    };
    uploadService = {
      uploadImage: createMockFunction(() => of({ key: '', url: '' }))
    };

    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        {
          provide: ChatService,
          useValue: {
            getInitialData: () => of({
              me: {
                id: '1',
                username: 'me',
                fullName: 'Me',
                avatarUrl: 'https://avatar/current.png',
                isActive: true
              },
              getConversations: []
            })
          }
        },
        {
          provide: AuthService,
          useValue: authService
        },
        {
          provide: UploadService,
          useValue: uploadService
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should upload the avatar image before updating the profile', async () => {
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    component.fullName = 'Nuevo Nombre';
    component.selectedAvatarFile = file;

    uploadService.uploadImage.setImplementation(() => of({
      key: 'profile/avatar.png',
      url: 'https://bucket.s3.amazonaws.com/profile/avatar.png'
    }));

    await component.saveProfile();

    expect(uploadService.uploadImage.calls).toEqual([[file, 'profile']]);
    expect(authService.updateProfile.calls).toEqual([['Nuevo Nombre', 'https://bucket.s3.amazonaws.com/profile/avatar.png']]);
  });

  it('should show a temporary error when avatar upload fails and skip profile update', async () => {
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    component.fullName = 'Nuevo Nombre';
    component.selectedAvatarFile = file;

    uploadService.uploadImage.setImplementation(() => throwError(() => new Error('upload failed')));

    await component.saveProfile();

    expect(authService.updateProfile.calls.length).toBe(0);
    expect(component.uploadErrorMessage).toBe('No se pudo subir la imagen de perfil.');
  });

  it('should require both password fields to change password', () => {
    component.currentPassword = 'oldpass';
    component.newPassword = '';

    component.savePassword();

    expect(authService.changePassword.calls.length).toBe(0);
    expect(component.passwordMessage).toBe('Both password fields are required.');
  });

  it('should change password successfully and clear fields', () => {
    component.currentPassword = 'oldpass';
    component.newPassword = 'newpass';

    authService.changePassword.setImplementation(() => of(true));

    component.savePassword();

    expect(authService.changePassword.calls).toEqual([['oldpass', 'newpass']]);
    expect(component.passwordMessage).toBe('Password changed successfully.');
    expect(component.currentPassword).toBe('');
    expect(component.newPassword).toBe('');
    expect(component.isChangingPassword).toBe(false);
  });

  it('should show backend error message when password change is rejected', () => {
    component.currentPassword = 'oldpass';
    component.newPassword = 'newpass';

    authService.changePassword.setImplementation(() => throwError(() => new Error('rejected')));
    authService.getGraphQLErrorMessage.setImplementation(() => 'Contraseña actual incorrecta');

    component.savePassword();

    expect(component.passwordMessage).toBe('Contraseña actual incorrecta');
    expect(component.isChangingPassword).toBe(false);
  });

  it('should update profile with a direct avatar URL without uploading a file', async () => {
    component.fullName = 'Nombre Actualizado';
    component.avatarUrl = 'https://cdn.example.com/my-avatar.png';
    component.selectedAvatarFile = null;

    await component.saveProfile();

    expect(uploadService.uploadImage.calls.length).toBe(0);
    expect(authService.updateProfile.calls).toEqual([
      ['Nombre Actualizado', 'https://cdn.example.com/my-avatar.png']
    ]);
    expect(component.profileMessage).toBe('Profile updated successfully.');
  });
});
