import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { UploadService } from './upload.service';

describe('UploadService', () => {
  let service: UploadService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.setItem('social_auth_token', 'token-123');

    TestBed.configureTestingModule({
      providers: [
        UploadService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    service = TestBed.inject(UploadService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem('social_auth_token');
  });

  it('should upload an image using multipart form data and auth header', () => {
    const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' });

    service.uploadImage(file, 'chat').subscribe((response) => {
      expect(response.url).toBe('https://bucket.s3.amazonaws.com/chat/photo.png');
    });

    const request = httpMock.expectOne('http://localhost:8080/api/uploads');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer token-123');
    expect(request.request.body instanceof FormData).toBe(true);
    expect(request.request.body.get('folder')).toBe('chat');
    expect((request.request.body.get('file') as File).name).toBe('photo.png');

    request.flush({
      key: 'chat/photo.png',
      url: 'https://bucket.s3.amazonaws.com/chat/photo.png'
    });
  });
});